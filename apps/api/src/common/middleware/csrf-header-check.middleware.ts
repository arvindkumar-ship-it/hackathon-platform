import { ForbiddenException, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Lightweight CSRF defense-in-depth: for any state-changing request that
// carries our auth refresh cookie, require a custom header that a
// cross-site form/simple-request cannot attach. This does not replace
// SameSite=lax (already set on the cookie) — it's a second layer.
export class CsrfHeaderCheckMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    const cookieName = this.config.get<string>(
      'AUTH_COOKIE_NAME',
      'hackathon_refresh',
    );

    const cookies = req.cookies as Record<string, string> | undefined;
    const hasAuthCookie = Boolean(cookies?.[cookieName]);

    if (!hasAuthCookie) {
      // No cookie-based credential in play (e.g. pure Bearer-token API
      // call) — not a CSRF-relevant request, skip the check.
      return next();
    }

    const requestedWith = req.headers['x-requested-with'];

    if (requestedWith !== 'XMLHttpRequest') {
      throw new ForbiddenException('Missing required CSRF header');
    }

    return next();
  }
}