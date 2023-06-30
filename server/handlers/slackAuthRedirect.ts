import type { Request, Response } from 'express';
import fetch from 'node-fetch';
import type {
  OauthV2AccessResponse,
  ConversationsListResponse,
  UsersListResponse,
} from '@slack/web-api';
import { FRONT_END_HOST } from '../server';
import { loadUsers, saveSlackData, saveUsers } from '../utils/files';
import { processJSONResponse } from '../utils/server';

export async function slackAuthRedirectHandler(req: Request, res: Response) {
  const { code, state: cordUserID, error } = req.query;

  if (error === 'access_denied') {
    // You clicked "Cancel" in Slack's auth dialog
    res.redirect(FRONT_END_HOST);
  }

  if (!code) {
    throw new Error('No code received');
  }

  if (typeof cordUserID !== 'string') {
    throw new Error('Unexpected state format');
  }

  const { SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET } = process.env;

  if (!SLACK_APP_CLIENT_ID || !SLACK_APP_CLIENT_SECRET) {
    throw new Error(
      'Missing Slack app environment variables.  Please add to .env as instructed in the README.',
    );
  }

  const slackOauthResponse = (await fetch(
    'https://slack.com/api/oauth.v2.access',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          SLACK_APP_CLIENT_ID + ':' + SLACK_APP_CLIENT_SECRET,
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        code: code.toString(),
      }),
    },
  ).then(processJSONResponse)) as OauthV2AccessResponse;

  // For type-checker
  if (!slackOauthResponse.authed_user) {
    throw new Error('Unexpected request body format from Slack');
  }

  const {
    access_token: botToken,
    authed_user: { id: slackUserID },
    bot_user_id: botUserID,
  } = slackOauthResponse;

  if (!botToken) {
    throw new Error('Something went wrong when fetching the bot token');
  }

  // Fetch a list of the user's Slack channels to show in the UI, for them to
  // select when they want to share a Cord thread to Slack
  const channelsResponse = (await fetch(
    'https://slack.com/api/conversations.list',
    {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
    },
  ).then(processJSONResponse)) as ConversationsListResponse;

  if (!channelsResponse.channels) {
    throw new Error('No Slack channels found');
  }

  const channels = channelsResponse.channels.map((c) => {
    if (c.id && c.name) {
      return {
        id: c.id,
        name: c.name,
      };
    } else {
      throw new Error('Bad Slack channel format');
    }
  });

  // Your Slack bot token will need the permission 'users:read.email' in addition
  // to 'users:read' to get user profile information including emails.
  const usersResponse = (await fetch('https://slack.com/api/users.list', {
    headers: {
      Authorization: `Bearer ${botToken}`,
    },
  }).then(processJSONResponse)) as UsersListResponse;

  if (!usersResponse.members) {
    throw new Error('No Slack users found');
  }

  const slackUsersByEmail = new Map<string, string>();

  usersResponse.members.forEach((slackUser) => {
    if (slackUser.profile?.email) {
      slackUsersByEmail.set(slackUser.profile.email, slackUser.id!);
    }
  });

  // These are some sample users we prepared for you.  Feel free to change them.
  let yourAppUsers = loadUsers();

  // Add the slack ID of the user who added the Slack integration to the records
  // of your users, so they can be tagged in messages shared to Slack
  yourAppUsers[cordUserID].slackID = slackUserID;

  for (let user in yourAppUsers) {
    // If it doesn't yet have a matched Slack user ID
    if (!yourAppUsers[user].slackID) {
      // Associate one based on email
      yourAppUsers[user].slackID = slackUsersByEmail.get(
        yourAppUsers[user].email,
      );
    }
  }

  saveUsers(yourAppUsers);

  // Store the bot token appropriately.  Just for the purposes of this demonstration
  // code we write it to a file, but you'd want to store it e.g. in a protected
  // database

  saveSlackData({ slackBotToken: botToken, botUserID, channels });

  res.redirect(FRONT_END_HOST);
}
