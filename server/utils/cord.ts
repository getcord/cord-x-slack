import { getClientAuthToken, getServerAuthToken } from '@cord-sdk/server';
import { CORD_APP_ID, CORD_SIGNING_SECRET } from '../server';
import { loadUsers } from './files';

export const ORG_ID = 'my_org';
const ORG_NAME = 'My test Cord org';

// Cycle through different sample users on refresh, to give an idea of what using
// the tool is like with multiple users
let loginAsUserIndex = 0;

// This function returns a client token to log a user into Cord
export function getCordUserToken() {
  const users = loadUsers();

  const userID = Object.keys(users)[loginAsUserIndex];
  loginAsUserIndex =
    loginAsUserIndex + 1 >= Object.keys(users).length
      ? 0
      : loginAsUserIndex + 1;

  const token = getClientAuthToken(CORD_APP_ID, CORD_SIGNING_SECRET, {
    user_id: userID,
    organization_id: ORG_ID,
    user_details: {
      email: users[userID].email,
      name: users[userID].name,
      profilePictureURL: users[userID].profilePictureURL,
    },
    organization_details: {
      name: ORG_NAME,
    },
  });

  return {
    userID,
    token,
  };
}

// This function returns a sever token to make authorized server-to-server API
// calls to Cord
export function getCordServerToken() {
  return getServerAuthToken(CORD_APP_ID, CORD_SIGNING_SECRET);
}
