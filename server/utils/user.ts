import { loadUsers } from './files';

export const getSlackUserIdFromCordExternalUserID = (cordExtID: string) => {
  const users = loadUsers();

  const user = users[cordExtID];

  return user?.slackID;
};

export const getCordExternalUserIDFromSlackID = (slackID: string) => {
  const users = loadUsers();

  const user = Object.entries(users).filter(
    ([id, user]) => user.slackID === slackID,
  )?.[0];

  return user?.[0];
};

export const getNameFromCordExtID = (cordExtID: string) => {
  const users = loadUsers();

  const name = users[cordExtID]?.name;

  return name ?? 'A user';
};
