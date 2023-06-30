// Everything this file does should really be done with a database, but to keep
// this app simple we've persisted information by reading/writing to files in
// the data directory

import path from 'path';
import fs from 'fs';

type SharedThreads = {
  cordToSlack: {
    [cordThreadID: string]: {
      slackChannel: string;
      timestamp: string;
    };
  };
  slackToCord: {
    [slackChannelID: string]: {
      [threadTimestamp: string]: string;
    };
  };
};

const sharedThreadsPath = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'sharedThreads.json',
);

export function loadSharedThreads(): SharedThreads {
  if (fs.existsSync(sharedThreadsPath)) {
    return JSON.parse(fs.readFileSync(sharedThreadsPath, 'utf8'));
  }
  return { cordToSlack: {}, slackToCord: {} };
}

export function saveSharedThreads(sharedThreads: SharedThreads) {
  fs.writeFileSync(sharedThreadsPath, JSON.stringify(sharedThreads));
}

export function addSharedThread({
  cordThreadID,
  slackChannel,
  slackThreadTimestamp,
}: {
  cordThreadID: string;
  slackChannel: string;
  slackThreadTimestamp: string;
}) {
  const sharedThreads = loadSharedThreads();

  if (sharedThreads.slackToCord[slackChannel]) {
    sharedThreads.slackToCord[slackChannel][slackThreadTimestamp] =
      cordThreadID;
  } else {
    sharedThreads.slackToCord[slackChannel] = {
      [slackThreadTimestamp]: cordThreadID,
    };
  }

  sharedThreads.cordToSlack[cordThreadID] = {
    slackChannel,
    timestamp: slackThreadTimestamp,
  };

  saveSharedThreads(sharedThreads);
}

const slackDataPath = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'slackData.json',
);

export type SlackChannel = {
  id: string;
  name: string;
};

type SlackData = {
  slackBotToken?: string;
  botUserID?: string;
  channels?: SlackChannel[];
};

export function loadSlackData(): SlackData {
  if (fs.existsSync(slackDataPath)) {
    return JSON.parse(fs.readFileSync(slackDataPath, 'utf8'));
  }
  return {};
}

export function saveSlackData(slackData: SlackData) {
  fs.writeFileSync(slackDataPath, JSON.stringify(slackData));
}

export function deleteSlackInfo() {
  if (fs.existsSync(slackDataPath)) {
    fs.rmSync(slackDataPath);
  }
  if (fs.existsSync(sharedThreadsPath)) {
    fs.rmSync(sharedThreadsPath);
  }

  const users = loadUsers();

  for (let user in users) {
    delete users[user].slackID;
  }
  saveUsers(users);
}

type Users = {
  [cordUserID: string]: {
    name: string;
    email: string;
    profilePictureURL?: string;
    slackID?: string;
  };
};

const usersDataPath = path.join(__dirname, '..', '..', 'data', 'users.json');

export function loadUsers(): Users {
  return JSON.parse(fs.readFileSync(usersDataPath, 'utf8')).users;
}

export function saveUsers(users: Users) {
  fs.writeFileSync(usersDataPath, JSON.stringify({ users }));
}
