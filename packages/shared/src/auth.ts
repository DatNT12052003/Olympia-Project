import { z } from 'zod';

/**
 * Hợp đồng REST cho tài khoản và xác thực (đặc tả mục 3, DL-021).
 *
 * Access token trả trong body và client giữ trong bộ nhớ, gửi qua header `Authorization: Bearer`.
 * Refresh token nằm trong cookie HttpOnly; các endpoint dùng cookie yêu cầu header {@link CSRF_HEADER}.
 */

/** Header bắt buộc với endpoint đọc cookie (refresh, logout, phiên khách) để chống CSRF. */
export const CSRF_HEADER = 'x-olympia-csrf';

export const AuthErrorCode = {
  InvalidCredentials: 'INVALID_CREDENTIALS',
  AccountLocked: 'ACCOUNT_LOCKED',
  EmailTaken: 'EMAIL_TAKEN',
  EmailNotVerified: 'EMAIL_NOT_VERIFIED',
  EmailAlreadyVerified: 'EMAIL_ALREADY_VERIFIED',
  /** Token xác minh email / đặt lại mật khẩu không hợp lệ, đã dùng hoặc hết hạn. */
  InvalidActionToken: 'INVALID_ACTION_TOKEN',
  CsrfHeaderMissing: 'CSRF_HEADER_MISSING',
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

/** Vai trò hệ thống gắn với tài khoản (BR-ROLE-01). Host là quyền của mọi `member` đã xác minh. */
export const systemRoleSchema = z.enum(['member', 'manager', 'super_admin']);
export type SystemRole = z.infer<typeof systemRoleSchema>;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 32;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email quá dài.')
  .pipe(z.email('Email không hợp lệ.'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.`)
  .max(PASSWORD_MAX_LENGTH, `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự.`);

/** Tên hiển thị: bỏ khoảng trắng thừa, không chứa ký tự điều khiển. */
export const displayNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(DISPLAY_NAME_MIN_LENGTH, `Tên hiển thị tối thiểu ${DISPLAY_NAME_MIN_LENGTH} ký tự.`)
      .max(DISPLAY_NAME_MAX_LENGTH, `Tên hiển thị tối đa ${DISPLAY_NAME_MAX_LENGTH} ký tự.`)
      // eslint-disable-next-line no-control-regex -- chặn chủ đích ký tự điều khiển
      .regex(/^[^\u0000-\u001f\u007f]+$/, 'Tên hiển thị chứa ký tự không hợp lệ.'),
  );

/** Token một lần (xác minh email, đặt lại mật khẩu) gửi qua email. */
export const actionTokenSchema = z.string().min(20).max(200);

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  /** Đồng ý chính sách quyền riêng tư khi đăng ký (BR-DATA-02). */
  acceptPrivacyPolicy: z.literal(true, 'Bạn cần đồng ý chính sách quyền riêng tư.'),
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  // Không áp độ dài tối thiểu khi đăng nhập để không lộ chính sách mật khẩu cũ.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const verifyEmailRequestSchema = z.object({ token: actionTokenSchema });
export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export const resetPasswordRequestSchema = z.object({
  token: actionTokenSchema,
  password: passwordSchema,
});
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export const updateProfileRequestSchema = z
  .object({ displayName: displayNameSchema })
  .partial()
  .strict();
export const guestSessionRequestSchema = z.object({
  /** Bỏ trống để làm mới phiên khách hiện có (giữ tên cũ). */
  displayName: displayNameSchema.optional(),
});

export type RegisterRequest = z.input<typeof registerRequestSchema>;
export type LoginRequest = z.input<typeof loginRequestSchema>;
export type ResetPasswordRequest = z.input<typeof resetPasswordRequestSchema>;
export type ChangePasswordRequest = z.input<typeof changePasswordRequestSchema>;
export type UpdateProfileRequest = z.input<typeof updateProfileRequestSchema>;
export type GuestSessionRequest = z.input<typeof guestSessionRequestSchema>;

export const currentUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  emailVerified: z.boolean(),
  systemRole: systemRoleSchema,
  /** Super Admin có thể thu hồi quyền Host (BR-AUTH-01). */
  canHost: z.boolean(),
  organizationId: z.uuid().nullable(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const authSessionResponseSchema = z.object({
  accessToken: z.string(),
  /** Thời điểm hết hạn access token (ISO 8601). */
  accessTokenExpiresAt: z.iso.datetime(),
  user: currentUserSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const guestIdentitySchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
});
export type GuestIdentity = z.infer<typeof guestIdentitySchema>;

export const guestSessionResponseSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  /** Phiên khách hết hạn lúc này (BR-AUTH-05); sau đó cần vào lại bằng tên mới. */
  sessionExpiresAt: z.iso.datetime(),
  guest: guestIdentitySchema,
});
export type GuestSessionResponse = z.infer<typeof guestSessionResponseSchema>;
