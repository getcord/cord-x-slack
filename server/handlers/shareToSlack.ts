import fetch from 'node-fetch';
import type { Request, Response } from 'express';
import type { MessageVariables, ThreadVariables } from '@cord-sdk/api-types';
import type { ChatPostMessageResponse } from '@slack/web-api';
import {
  postMessageToSlack,
  prepareFirstMessageToShareToSlack,
  prepareSubsequentMessageToShareToSlack,
} from '../utils/slack';
import { addSharedThread, loadSlackData } from '../utils/files';
import { getCordServerToken } from '../utils/cord';
import { processJSONResponse } from '../utils/server';

export async function shareToSlackHandler(req: Request, res: Response) {
  const { slackBotToken } = loadSlackData();

  if (!slackBotToken) {
    throw new Error("Can't share to Slack without bot token");
  }

  const { threadID, channel } = req.body as {
    threadID: string;
    channel: string;
  };

  if (!threadID || !channel) {
    throw new Error('Missing threadID or channel');
  }
  const serverToken = getCordServerToken();

  // First, call Cord's API to fetch all the messages in the thread
  const messages = (await fetch(
    `https://api.cord.com/v1/threads/${encodeURIComponent(
      threadID,
    )}/messages?sortDirection=ascending`,
    {
      headers: {
        Authorization: `Bearer ${serverToken}`,
      },
    },
  ).then(processJSONResponse)) as MessageVariables[];

  if (!messages || messages.length === 0) {
    throw new Error('No messages found in Cord thread');
  }

  // Call Cord to get supplementary information about the thread
  const thread = (await fetch(
    `https://api.cord.com/v1/threads/${encodeURIComponent(threadID)}`,
    {
      headers: {
        Authorization: `Bearer ${serverToken}`,
      },
    },
  ).then(processJSONResponse)) as ThreadVariables;

  // The Slack app bot needs to have joined the channel you wish to share the
  // messages to.  This could be skipped if it's already joined the channel.
  await fetch('https://slack.com/api/conversations.join', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${slackBotToken}`,
    },
    body: JSON.stringify({
      channel,
    }),
  });

  // Prepare the Cord messages into an appropriate form to send to Slack:

  // Share the first Cord message to Slack.  In order to make the subsequent
  // messages in the thread show as thread replies to this first message, we
  // need to get its timestamp.
  const firstMessageReqBody = prepareFirstMessageToShareToSlack({
    message: messages[0],
    thread,
    slackChannel: channel,
  });

  const firstMessage = (await postMessageToSlack(
    firstMessageReqBody,
  )) as ChatPostMessageResponse;

  if (!firstMessage.ts) {
    throw new Error('No timestamp found on first message');
  }

  // In order to mirror future messages on the thread (i.e. the code in
  // handlers/slackEvents), you will need to keep track of which messages you
  // have shared.  We suggest you do this in a database table, but for this
  // example we write them to a json file.
  addSharedThread({
    cordThreadID: threadID,
    slackChannel: channel,
    slackThreadTimestamp: firstMessage.ts,
  });

  // Prepare subsequent messages to be sent as replies to the first message
  messages.slice(1).forEach(async (msg) => {
    const reqBody = prepareSubsequentMessageToShareToSlack({
      message: msg,
      slackChannel: channel,
      slackThreadTimestamp: firstMessage.ts!,
    });

    await postMessageToSlack(reqBody);
  });

  // Optional: Update the metadata of the Cord thread to mark the fact that this
  // thread is now shared with Slack.
  await fetch(
    `https://api.cord.com/v1/threads/${encodeURIComponent(threadID)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        metadata: {
          sharedToSlack: JSON.stringify({
            channel,
            thread_ts: firstMessage.ts,
          }),
        },
      }),
      headers: {
        Authorization: `Bearer ${serverToken}`,
        'Content-Type': 'application/json',
      },
    },
  );
}
