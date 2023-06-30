import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import https from 'https';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
import {
  processIncomingSlackEvent,
  verifySlackEvent,
} from './handlers/slackEvents';

import {
  processIncomingCordEvent,
  verifyCordEvent,
} from './handlers/cordEvents';
import { slackAuthRedirectHandler } from './handlers/slackAuthRedirect';
import { shareToSlackHandler } from './handlers/shareToSlack';
import { getCordUserToken } from './utils/cord';
import { deleteSlackInfo, loadSlackData } from './utils/files';
import {
  RequestWithRawBody,
  errorHandlerWrapper,
  jsonMiddleware,
} from './utils/server';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const CORD_APP_ID = process.env.CORD_APP_ID!;
export const CORD_SIGNING_SECRET = process.env.CORD_SIGNING_SECRET!;

if (!CORD_APP_ID || !CORD_SIGNING_SECRET) {
  throw new Error('Missing Cord App ID or Signing Secret from env vars');
}

const port = 3001;
export const FRONT_END_HOST = 'https://localhost:3000';

function main() {
  const app = express();

  app.use(jsonMiddleware());
  app.use(cors({ origin: FRONT_END_HOST }));
  app.use((req, _, next) => {
    console.log('Request:', req.method, req.originalUrl);
    return next();
  });

  // Supply client token for front-end Cord UI
  app.get('/userToken', (_, res) => {
    res.send(getCordUserToken());
  });

  // Redirect URL for your Slack app (configured on 'OAuth & Permissions' tab
  // at https://api.slack.com/apps/ for your app).  NB Slack will not allow you
  // to use a localhost address as a redirect URL, so you may need to deploy to
  // a test environment, or use a tool like ngrok (https://ngrok.com/) in development.
  app.get('/auth', errorHandlerWrapper(slackAuthRedirectHandler));

  app.get(
    '/slackClientID',
    errorHandlerWrapper((req, res) => {
      const SLACK_APP_CLIENT_ID = process.env.SLACK_APP_CLIENT_ID;

      res.send(SLACK_APP_CLIENT_ID);
    }),
  );

  // Send channels to the front end so user can choose where to share the thread
  // to, if they want to share it.  We also make the simplistic assumption that if
  // the front end cannot load any Slack channels, Slack has not been integrated.
  app.get('/slackChannels', async (req, res) => {
    const { channels } = loadSlackData();

    res.send({ channels });
  });

  // Endpoint to share a Cord thread to Slack channel
  app.post('/shareToSlack', errorHandlerWrapper(shareToSlackHandler));

  // Endpoint to receive events from Slack.  You will need to configure where Slack
  // sends your app's events from the 'Event subscriptions' tab at https://api.slack.com/apps/
  // You will need to select the 'message.channels' event type, which requires the
  // 'channels:history' permission.  NB you will not be able to use a localhost
  // address as an events URL, so you may need to deploy to a test environment,
  // or use a tool like ngrok (https://ngrok.com/) in development.
  app.post(
    '/slackEvents',
    errorHandlerWrapper((req, res) => {
      // This code is needed to set up the endpoint with Slack.  See https://api.slack.com/events/url_verification
      if (req.body?.type === 'url_verification') {
        res.send(req.body.challenge);
        return;
      }

      res.sendStatus(200);

      // Verify that the event definitely came from Slack
      verifySlackEvent(req as RequestWithRawBody);

      return processIncomingSlackEvent(req.body);
    }),
  );

  // Endpoint to receive events from Cord.  You can set an endpoint to receive events
  // on an application level at https://console.cord.com.  NB you will not be able to
  // use a localhost address as an events URL, so you may need to deploy to a test
  // environment, or use a tool like ngrok (https://ngrok.com/) in development.
  app.post(
    '/cordEvents',
    errorHandlerWrapper(async function (req: Request, res: Response) {
      res.sendStatus(200);

      // Verify that the event definitely came from Cord
      await verifyCordEvent(req);

      // Handle the event
      return processIncomingCordEvent(req.body);
    }),
  );

  app.post(
    '/removeSlackIntegration',
    errorHandlerWrapper((req, res) => {
      deleteSlackInfo();
      res.send();
    }),
  );

  // Catch errors and log them
  app.use(
    '/',
    (error: unknown, req: Request, res: Response, _next: NextFunction) => {
      console.log('😢 An error occurred', error);

      if (!res.headersSent) {
        res.status(500).send({
          error: 'error',
          message: 'Internal server error - check the server logs',
        });
      }
    },
  );

  // Fetch certificate to run https locally.  Run ./scripts/generate-localhost-cert.sh
  // to generate these files
  const server = https.createServer(
    {
      key: fs.readFileSync(
        path.join(__dirname, '..', 'localhost', 'localhost.key'),
      ),
      cert: fs.readFileSync(
        path.join(__dirname, '..', 'localhost', 'localhost.crt'),
      ),
    },
    app,
  );

  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

main();
