import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../config/env.ts';
import { UnauthorizedError } from '../errors/UnauthorizedError.ts';
import { verifyToken, type AuthUser } from '../services/tokenService.ts';

/**
 * Token dibaca dari cookie httpOnly (bukan header Authorization, bukan localStorage).
 * Browser mengirim cookie otomatis selama frontend memakai `withCredentials: true`.
 */
export function extractToken(req: Request): string | null {
  const token = req.cookies?.[env.authCookieName];
  if (typeof token !== 'string') return null;

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Middleware autentikasi: memastikan request membawa cookie sesi yang valid,
 * lalu menaruh pemilik sesi di `req.user`.
 */
export const authenticate: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    return next(new UnauthorizedError('Silakan login terlebih dahulu.'));
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch {
    return next(new UnauthorizedError('Sesi login tidak valid atau sudah kedaluwarsa.'));
  }
};

/**
 * Pembaca `req.user` yang aman. Melempar 401 jika tidak ada user.
 */
export function getUser(req: Request): AuthUser {
  if (!req.user) {
    throw new UnauthorizedError('Endpoint ini membutuhkan sesi login.');
  }
  return req.user;
}
