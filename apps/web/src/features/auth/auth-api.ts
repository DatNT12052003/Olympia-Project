import {
  authSessionResponseSchema,
  type ChangePasswordRequest,
  type CurrentUser,
  currentUserSchema,
  type LoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
  type UpdateProfileRequest,
} from '@olympia/shared';
import { z } from 'zod';
import { apiGet, apiPatch, apiPost } from '../../lib/api-client';
import { applySession, handleSessionExpired, updateCurrentUser } from '../../lib/auth-session';

const userEnvelopeSchema = z.object({ user: currentUserSchema });

export async function login(input: LoginRequest): Promise<CurrentUser> {
  const session = await apiPost('/auth/login', input, { schema: authSessionResponseSchema });
  applySession(session);
  return session.user;
}

export async function register(input: RegisterRequest): Promise<CurrentUser> {
  const session = await apiPost('/auth/register', input, { schema: authSessionResponseSchema });
  applySession(session);
  return session.user;
}

export async function verifyEmail(token: string): Promise<CurrentUser> {
  const { user } = await apiPost('/auth/verify-email', { token }, { schema: userEnvelopeSchema });
  updateCurrentUser(user);
  return user;
}

export function resendVerification(): Promise<undefined> {
  return apiPost('/auth/verify-email/resend', undefined, { auth: true });
}

export function forgotPassword(email: string): Promise<undefined> {
  return apiPost('/auth/forgot-password', { email });
}

export function resetPassword(input: ResetPasswordRequest): Promise<undefined> {
  return apiPost('/auth/reset-password', input);
}

export function changePassword(input: ChangePasswordRequest): Promise<undefined> {
  return apiPost('/auth/change-password', input, { auth: true });
}

export async function fetchMe(): Promise<CurrentUser> {
  const { user } = await apiGet('/me', { schema: userEnvelopeSchema, auth: true });
  updateCurrentUser(user);
  return user;
}

export async function updateProfile(input: UpdateProfileRequest): Promise<CurrentUser> {
  const { user } = await apiPatch('/me', input, { schema: userEnvelopeSchema, auth: true });
  updateCurrentUser(user);
  return user;
}

/**
 * Yêu cầu xóa tài khoản (DL-008): server thu hồi mọi phiên và gửi email kèm liên kết giữ lại tài
 * khoản; trình duyệt xóa phiên cục bộ.
 */
export async function deleteAccount(password: string): Promise<void> {
  await apiPost('/auth/delete-account', { password }, { auth: true });
  handleSessionExpired();
}

/** Giữ lại tài khoản bằng liên kết trong email (hủy yêu cầu xóa). */
export function cancelDeletion(token: string): Promise<undefined> {
  return apiPost('/auth/cancel-deletion', { token });
}
