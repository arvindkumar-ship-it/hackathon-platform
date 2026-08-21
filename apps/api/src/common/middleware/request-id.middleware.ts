import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export type RequestWithId = Request & {
  requestId: string;
};

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const requestId =
    request.header('x-request-id')?.slice(0, 120) ?? randomUUID();

  (request as RequestWithId).requestId = requestId;
  response.setHeader('x-request-id', requestId);

  next();
}