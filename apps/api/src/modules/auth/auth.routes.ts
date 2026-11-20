import { Router } from 'express';
import { requireCsrfHeader, requireUser } from '../../shared/auth/http-auth';
import { type AuthCookieConfig, createAuthController } from './auth.controller';
import type { AuthService } from './auth.service';

/**
 * `/api/auth`. Mọi route ở đây đọc/ghi cookie xác thực nên đều yêu cầu header chống CSRF
 * (kể cả login/register, để chặn login CSRF).
 */
export function createAuthRouter(authService: AuthService, cookies: AuthCookieConfig): Router {
  const c = createAuthController(authService, cookies);
  const router = Router();
  router.use(requireCsrfHeader);

  router.post('/register', c.register);
  router.post('/login', c.login);
  router.post('/refresh', c.refresh);
  router.post('/logout', c.logout);
  router.post('/verify-email', c.verifyEmail);
  router.post('/verify-email/resend', requireUser, c.resendVerification);
  router.post('/forgot-password', c.forgotPassword);
  router.post('/reset-password', c.resetPassword);
  router.post('/change-password', requireUser, c.changePassword);
  router.post('/delete-account', requireUser, c.deleteAccount);
  router.post('/cancel-deletion', c.cancelDeletion);
  router.post('/guest', c.guest);
  return router;
}
