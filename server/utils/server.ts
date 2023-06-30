import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Response as NodeFetchResponse } from 'node-fetch';

export type RequestWithRawBody = Request & {
  rawBody: Buffer;
};

export function jsonMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    express.json({
      verify: (req, _res, buf) => {
        // Retain raw body for Slack event verification
        (req as RequestWithRawBody).rawBody = buf;
      },
    })(req, res, (error) => {
      next();
    });
  };
}

export function errorHandlerWrapper(
  handler: (req: Request, res: Response, next: NextFunction) => any,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (e) {
      return next(e);
    }
  };
}

export async function processJSONResponse(res: NodeFetchResponse) {
  if (res.ok) {
    return res.json();
  } else {
    const responseText = await res.text();
    throw new Error(
      `Error making API call: ${res.status} ${res.statusText} ${responseText}`,
    );
  }
}
