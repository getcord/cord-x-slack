import fetch from 'node-fetch';
import type {
  MessageVariables,
  NotificationReplyAction,
  ThreadVariables,
  WebhookPayloads,
} from '@cord-sdk/api-types';
import { getNameFromCordExtID } from './user';
import { loadSlackData } from './files';
import { processJSONResponse } from './server';
import { ChatPostMessageArguments } from '@slack/web-api';
import { UserData } from '@cord-sdk/types';

export async function postMessageToSlack(body: ChatPostMessageArguments) {
  const { slackBotToken } = loadSlackData();

  if (!slackBotToken) {
    throw new Error("Can't share to Slack without bot token");
  }

  // NB your Slack bot token will need the permission 'chat:write'
  return await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${slackBotToken}`,
    },
    body: JSON.stringify(body),
  }).then(processJSONResponse);
}

export function prepareFirstMessageToShareToSlack({
  message,
  thread,
  slackChannel,
}: {
  message: MessageVariables;
  thread: ThreadVariables;
  slackChannel: string;
}): ChatPostMessageArguments {
  const { url, authorID } = message;

  const messageAuthor = getNameFromCordExtID(authorID);

  return {
    channel: slackChannel,
    text: `${messageAuthor} left a message on <${url}|${thread.name}>`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${messageAuthor} left a message on <${url}|${thread.name}>`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '> ' + message.plaintext.replace(/\n/g, '\n> '),
        },
      },
    ],
  };
}

export function prepareSubsequentMessageToShareToSlack({
  message,
  messageEvent,
  slackChannel,
  slackThreadTimestamp,
}: {
  message?: MessageVariables;
  messageEvent?: WebhookPayloads['thread-message-added'];
  slackChannel: string;
  slackThreadTimestamp: string;
}): ChatPostMessageArguments {
  const authorID = message?.authorID || messageEvent?.author.id;
  const plaintext = message?.plaintext || messageEvent?.plaintext;

  if (!authorID || !plaintext) {
    throw new Error('Missing message author or plaintext');
  }

  const messageAuthor = getNameFromCordExtID(authorID);

  return {
    thread_ts: slackThreadTimestamp,
    channel: slackChannel,
    text: `${messageAuthor} replied`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `${messageAuthor} replied:` },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '> ' + plaintext.replace(/\n/g, '\n> '),
        },
      },
    ],
  };
}

export function prepareSlackNotification({
  slackUserID,
  messageAddedEvent,
  userToNotify,
}: {
  slackUserID: string;
  messageAddedEvent: WebhookPayloads['thread-message-added'];
  userToNotify: UserData & {
    replyActions: NotificationReplyAction[] | null;
  };
}) {
  const {
    author,
    plaintext,
    url,
    thread: { name: threadName },
  } = messageAddedEvent;

  const actionText = getNotificationActionText(userToNotify.replyActions);

  return {
    channel: slackUserID,
    text: `${author.name} ${actionText} on ${threadName}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          // NB simple url may not be enough for a user to click and 'find'
          // the comment in question, especially for SPAs.  You may need to
          // consider passing the Cord 'location' so your app can be put into
          // the right state.
          text: `${author.name} ${actionText} on <${url}|${threadName}>`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '> ' + plaintext.replace(/\n/g, '\n> '),
        },
      },
    ],
  };
}

export function getNotificationActionText(
  actions: NotificationReplyAction[] | null,
): string {
  if (actions?.includes('mention')) {
    return 'mentioned you';
  } else if (actions?.includes('create-thread')) {
    return 'created a new thread';
  } else {
    return 'replied';
  }
}
