import { createHmac } from 'crypto';
import type { Request } from 'express';
import jsonStableStringify = require('fast-json-stable-stringify');
import type { WebhookPayloads } from '@cord-sdk/types';
import { loadSharedThreads, loadSlackData } from '../utils/files';
import { getSlackUserIdFromCordExternalUserID } from '../utils/user';
import {
  postMessageToSlack,
  prepareSlackNotification,
  prepareSubsequentMessageToShareToSlack,
} from '../utils/slack';

export function verifyCordEvent(req: Request) {
  const CORD_SIGNING_SECRET = process.env.CORD_SIGNING_SECRET;

  // Obtained from https://console.cord.com.  Unique to a Cord application.
  if (!CORD_SIGNING_SECRET) {
    throw new Error(
      'Cord signing secret not set.  Please add to .env as instructed in the README',
    );
  }

  const cordTimestamp = req.header('X-Cord-Timestamp');
  const cordSignature = req.header('X-Cord-Signature');

  const bodyString = jsonStableStringify(req.body);
  const verifyStr = cordTimestamp + ':' + bodyString;
  const incomingSignature = createHmac('sha256', CORD_SIGNING_SECRET)
    .update(verifyStr)
    .digest('base64');

  if (cordSignature !== incomingSignature) {
    throw new Error('Unable to verify Cord signature');
  }
}

export async function processIncomingCordEvent(body: any) {
  console.log('📞 Cord event received');

  const eventHandler = eventHandlers[body.type as keyof typeof eventHandlers];

  await eventHandler(body.event);
}

const eventHandlers = {
  async 'thread-message-added'(event: WebhookPayloads['thread-message-added']) {
    const {
      usersToNotify,
      thread: { id: threadID, metadata },
    } = event;

    const { slackBotToken } = loadSlackData();

    if (!slackBotToken) {
      throw new Error('Unable to load Slack bot token');
    }

    // If this field is set it's because this message originated from Slack.  In
    // which case we should not mirror it to Slack again.
    if (metadata.originalSlackMessageTS) {
      console.log(
        '❌ Not mirroring to Slack because it came from there in the first place',
      );
      return;
    }

    const sharedThreads = loadSharedThreads();

    // This thread was previously shared to Slack (via the /shareToSlack) endpoint
    // in this app.  We should send this subsequent Cord message to the Slack thread,
    // to keep it up-to-date.
    if (sharedThreads.cordToSlack[threadID]) {
      const { slackChannel, timestamp } = sharedThreads.cordToSlack[threadID];

      const body = prepareSubsequentMessageToShareToSlack({
        message: { authorID: event.message.author.id, ...event.message },
        slackChannel: slackChannel,
        slackThreadTimestamp: timestamp,
      });

      console.log('➡️🪞 Mirroring a message from CORD to SLACK');

      await postMessageToSlack(body);
    }

    // Look at the users Cord things should be notified about this message (e.g.
    // because they have previously messaged in this thread,or are mentioned in a
    // message), find the Slack IDs for those Cord user IDs, and send them a DM
    // notification on Slack
    usersToNotify.forEach(async (user) => {
      const slackUserID = getSlackUserIdFromCordExternalUserID(user.id);

      // If we don't have a slack ID for the user, we can't notify them
      if (!slackUserID) {
        return;
      }

      const body = prepareSlackNotification({
        slackUserID,
        messageAddedEvent: event,
        userToNotify: user,
      });

      await postMessageToSlack(body);
    });
  },
};
