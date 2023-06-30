import fetch from 'node-fetch';
import { v4 as uuid } from 'uuid';
import { createHmac } from 'crypto';
import { getCordExternalUserIDFromSlackID } from '../utils/user';
import { ORG_ID, getCordServerToken } from '../utils/cord';
import { loadSharedThreads, loadSlackData } from '../utils/files';
import { RequestWithRawBody, processJSONResponse } from '../utils/server';
import { UsersInfoResponse } from '@slack/web-api';

export const processIncomingSlackEvent = async (event: any) => {
  console.log('🤖 Slack event received');

  if (event.event.type === 'message') {
    const sharedThreads = loadSharedThreads();

    const linkedCordThreadID =
      sharedThreads.slackToCord[event.event.channel]?.[event.event.thread_ts];

    const slackUserID = event.event.user;

    // This is not a message related to a Cord-mirrored thread, so just return
    if (!linkedCordThreadID) {
      return;
    }

    const { botUserID } = loadSlackData();

    // This message was posted to Slack by our bot - don't send it back to Cord
    // again
    if (event.event.user === botUserID) {
      console.log(
        '❌ Not mirroring to Cord because it came from there in the first place',
      );
      return;
    }

    console.log('🪞➡️ Mirroring a message from SLACK to CORD');

    const serverToken = getCordServerToken();

    const content = [{ type: 'p', children: [{ text: event.event.text }] }];

    let authorID = getCordExternalUserIDFromSlackID(slackUserID);

    if (!authorID) {
      // The message on Slack was written by someone we don't have a Cord user
      // for.  Create a user with the same name and profile picture so we have
      // a message author.

      const { slackBotToken } = loadSlackData();

      if (!slackBotToken) {
        throw new Error('Unable to find Slack bot token');
      }

      const params = new URLSearchParams({
        user: event.event.user,
      });

      // get details of Slack user
      const userProfile = (await fetch(
        `https://slack.com/api/users.info?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${slackBotToken}`,
          },
        },
      ).then(processJSONResponse)) as UsersInfoResponse;

      // Create a Cord user with the same name, email and profile picture
      await fetch(
        `https://api.cord.com/v1/users/${encodeURIComponent(slackUserID)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            email: userProfile.user?.profile?.email,
            name: userProfile.user?.profile?.display_name,
            profilePictureURL: userProfile.user?.profile?.image_192,
          }),
          headers: {
            Authorization: `Bearer ${serverToken}`,
            'Content-Type': 'application/json',
          },
        },
      ).then(processJSONResponse);

      // Add this user to the same org
      await fetch(
        `https://api.cord.com/v1/organizations/${encodeURIComponent(
          ORG_ID,
        )}/members`,
        {
          method: 'POST',
          body: JSON.stringify({
            add: [slackUserID],
          }),
          headers: {
            Authorization: `Bearer ${serverToken}`,
            'Content-Type': 'application/json',
          },
        },
      ).then(processJSONResponse);

      authorID = slackUserID;
    }

    const messageID = uuid();

    await fetch(
      `https://api.cord.com/v1/threads/${encodeURIComponent(
        linkedCordThreadID,
      )}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          id: messageID,
          content,
          authorID,
          // We record that this message originally came from Slack in the message's
          // metadata because we will receive a Cord webhook thread-message-added
          // event - and this will help us understand that we should NOT mirror
          // the message back to Slack again
          metadata: {
            originalSlackMessageTS: event.event.ts,
          },
        }),
        headers: {
          Authorization: `Bearer ${serverToken}`,
          'Content-Type': 'application/json',
        },
      },
    ).then(processJSONResponse);
  }
};

export function verifySlackEvent(req: RequestWithRawBody) {
  const SLACK_APP_SIGNING_SECRET = process.env.SLACK_APP_SIGNING_SECRET;

  if (!SLACK_APP_SIGNING_SECRET) {
    throw new Error('Slack signing secret not set');
  }

  const slackTimestamp = req.header('X-Slack-Request-Timestamp');
  const slackSignature = req.header('X-Slack-Signature');

  const bodyString = req.rawBody.toString();
  const verifyStr = 'v0:' + slackTimestamp + ':' + bodyString;
  const incomingSignature =
    'v0=' +
    createHmac('sha256', SLACK_APP_SIGNING_SECRET)
      .update(verifyStr)
      .digest('hex');

  if (slackSignature !== incomingSignature) {
    throw new Error('Unable to verify Slack event signature');
  }
}
