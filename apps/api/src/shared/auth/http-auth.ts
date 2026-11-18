import {
  AuthErrorCode,
  CSRF_HEADER,
  hasSystemPermission,
  type SystemPermission,
} from '@olympia/shared';
import type { Request, RequestHandler } from 'express';
import { ForbiddenError, UnauthenticatedError } from '../errors/app-error';
import type { AccessTokenResolver, Principal, UserPrincipal } from './principal';

declare module 'express-serve-static-core' {
  interface Request {
    /** Gắn bởi middleware `authenticate` khi request có access token hợp lệ. */
    principal?: Principal;
  }
}

const BEARER_PREFIX = 'Bearer ';

/**
 * Đọc `Authorization: Bearer <token>` nếu có. Token sai/hết hạn => 401 để client làm mới token;
 * không có token => request ẩn danh, các guard phía sau quyết định (mặc định từ chối).
 */
export function createAuthenticate(resolve: AccessTokenResolver): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header) {
      next();
      return;
    }
    if (!header.startsWith(BEARER_PREFIX)) {
      throw new UnauthenticatedError('Header Authorization không hợp lệ.');
    }
    req.principal = await resolve(header.slice(BEARER_PREFIX.length).trim());
    next();
  };
}

/** Bắt buộc đã đăng nhập (tài khoản hoặc khách). */
export const requireAuthenticated: RequestHandler = (req, _res, next) => {
  if (!req.principal) throw new UnauthenticatedError();
  next();
};

/** Bắt buộc đăng nhập bằng tài khoản (không chấp nhận khách). */
export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.principal) throw new UnauthenticatedError();
  if (req.principal.kind !== 'user') {
    throw new ForbiddenError('Chức năng này cần đăng nhập bằng tài khoản.');
  }
  next();
};

/** Bắt buộc có quyền hệ thống theo ma trận 2.2. */
export function requirePermission(permission: SystemPermission): RequestHandler {
  return (req, _res, next) => {
    if (!req.principal) throw new UnauthenticatedError();
    if (!hasSystemPermission(req.principal, permission)) throw new ForbiddenError();
    next();
  };
}

/**
 * Endpoint đọc cookie phải có header tùy biến: trình duyệt không tự gửi header này trong request
 * cross-site, và CORS chặn preflight từ origin lạ (kết hợp với SameSite=Strict).
 */
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (req.get(CSRF_HEADER) !== '1') {
    throw new ForbiddenError('Thiếu header chống CSRF.', AuthErrorCode.CsrfHeaderMissing);
  }
  next();
};

/** Lấy principal tài khoản sau `requireUser`/`requirePermission` dành cho tài khoản. */
export function userPrincipal(req: Request): UserPrincipal {
  const principal = req.principal;
  if (principal?.kind !== 'user') throw new UnauthenticatedError();
  return principal;
}

/** Lấy principal (tài khoản hoặc khách) sau `requireAuthenticated` hoặc `requireUser`. */
export function requestPrincipal(req: Request): Principal {
  if (!req.principal) throw new UnauthenticatedError();
  return req.principal;
}
