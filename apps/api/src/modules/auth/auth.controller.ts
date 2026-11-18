import {
  type AuthSessionResponse,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  type GuestSessionResponse,
  guestSessionRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
} from '@olympia/shared';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { userPrincipal } from '../../shared/auth/http-auth';
import type { AuthService, IssuedSession, RequestMeta } from './auth.service';

export const REFRESH_COOKIE = 'olympia_rt';
export const GUEST_COOKIE = 'olympia_guest';
/** Cookie chỉ gửi tới các endpoint xác thực, không đi kèm mọi request API. */
const AUTH_COOKIE_PATH = '/api/auth';

export interface AuthCookieConfig {
  secure: boolean;
}

function requestMeta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function createAuthController(authService: AuthService, cookies: AuthCookieConfig) {
  const baseCookie: CookieOptions = {
    httpOnly: true,
    secure: cookies.secure,
    sameSite: 'strict',
    path: AUTH_COOKIE_PATH,
  };

  function sendSession(res: Response, issued: IssuedSession, status = 200): void {
    res.cookie(REFRESH_COOKIE, issued.refreshToken, {
      ...baseCookie,
      expires: issued.refreshTokenExpiresAt,
    });
    const body: AuthSessionResponse = {
      accessToken: issued.accessToken,
      accessTokenExpiresAt: issued.accessTokenExpiresAt.toISOString(),
      user: issued.user,
    };
    res.status(status).json(body);
  }

  function clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, baseCookie);
  }

  const register: RequestHandler = async (req, res) => {
    const input = registerRequestSchema.parse(req.body);
    sendSession(res, await authService.register(input, requestMeta(req)), 201);
  };

  const login: RequestHandler = async (req, res) => {
    const input = loginRequestSchema.parse(req.body);
    sendSession(res, await authService.login(input, requestMeta(req)));
  };

  const refresh: RequestHandler = async (req, res) => {
    try {
      sendSession(res, await authService.refresh(readCookie(req, REFRESH_COOKIE)));
    } catch (error) {
      clearRefreshCookie(res);
      throw error;
    }
  };

  const logout: RequestHandler = async (req, res) => {
    await authService.logout(readCookie(req, REFRESH_COOKIE));
    clearRefreshCookie(res);
    res.status(204).end();
  };

  const verifyEmail: RequestHandler = async (req, res) => {
    const { token } = verifyEmailRequestSchema.parse(req.body);
    res.json({ user: await authService.verifyEmail(token) });
  };

  const resendVerification: RequestHandler = async (req, res) => {
    await authService.resendVerification(userPrincipal(req), requestMeta(req));
    res.status(202).end();
  };

  const forgotPassword: RequestHandler = async (req, res) => {
    const { email } = forgotPasswordRequestSchema.parse(req.body);
    await authService.forgotPassword(email, requestMeta(req));
    res.status(202).end();
  };

  const resetPassword: RequestHandler = async (req, res) => {
    const input = resetPasswordRequestSchema.parse(req.body);
    await authService.resetPassword(input);
    clearRefreshCookie(res);
    res.status(204).end();
  };

  const changePassword: RequestHandler = async (req, res) => {
    const input = changePasswordRequestSchema.parse(req.body);
    await authService.changePassword(userPrincipal(req), input);
    res.status(204).end();
  };

  const guest: RequestHandler = (req, res) => {
    const input = guestSessionRequestSchema.parse(req.body ?? {});
    const issued = authService.issueGuestSession(readCookie(req, GUEST_COOKIE), input);
    res.cookie(GUEST_COOKIE, issued.sessionToken, {
      ...baseCookie,
      expires: issued.sessionExpiresAt,
    });
    const body: GuestSessionResponse = {
      accessToken: issued.accessToken,
      accessTokenExpiresAt: issued.accessTokenExpiresAt.toISOString(),
      sessionExpiresAt: issued.sessionExpiresAt.toISOString(),
      guest: issued.guest,
    };
    res.json(body);
  };

  return {
    register,
    login,
    refresh,
    logout,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    changePassword,
    guest,
  };
}
