import type { Request, Response } from 'express';
import { env } from '../../config/env';

export const ACCESS_COOKIE = 'tt_at';
export const REFRESH_COOKIE = 'tt_rt';
export const CSRF_COOKIE = 'tt_csrf';
export const CUSTOMER_COOKIE = 'tt_customer';

const baseCookie = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax' as const,
  path: '/',
};

export interface IssuedCookies {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export function setAuthCookies(res: Response, tokens: IssuedCookies): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookie,
    expires: tokens.accessExpiresAt,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookie,
    path: '/api/v1/auth',
    expires: tokens.refreshExpiresAt,
  });
  res.cookie(CSRF_COOKIE, tokens.csrfToken, {
    httpOnly: false,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    expires: tokens.refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, baseCookie);
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie, path: '/api/v1/auth' });
  res.clearCookie(CSRF_COOKIE, { httpOnly: false, secure: env.isProduction, sameSite: 'lax', path: '/' });
  res.clearCookie(CUSTOMER_COOKIE, baseCookie);
}

export function setCsrfCookie(res: Response, csrfToken: string, expiresAt: Date): void {
  res.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function setCustomerCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(CUSTOMER_COOKIE, token, { ...baseCookie, expires: expiresAt });
}

export function clearCustomerCookie(res: Response): void {
  res.clearCookie(CUSTOMER_COOKIE, baseCookie);
}

/** Read a bearer token, falling back to the access cookie. */
export function readAccessToken(req: Request): string | undefined {
  const header = req.header('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    const token = header.slice(7).trim();
    if (token.length > 0) return token;
  }
  return req.cookies?.[ACCESS_COOKIE] as string | undefined;
}

export function readCustomerToken(req: Request): string | undefined {
  return req.cookies?.[CUSTOMER_COOKIE] as string | undefined;
}

export function usedCookieAuth(req: Request): boolean {
  const header = req.header('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return false;
  return Boolean(req.cookies?.[ACCESS_COOKIE] || req.cookies?.[CUSTOMER_COOKIE]);
}
