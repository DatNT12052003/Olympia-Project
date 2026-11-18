import { z } from 'zod';
import { systemRoleSchema } from './auth.js';

/** Hợp đồng REST quản trị tài khoản và tổ chức (đặc tả mục 15, DL-005). */

export const AdminErrorCode = {
  /** Không thao tác được trên chính tài khoản của mình (khóa, hạ vai trò). */
  SelfModification: 'SELF_MODIFICATION',
  /** Người được gán làm Manager của tổ chức chưa có vai trò Manager. */
  NotAManager: 'NOT_A_MANAGER',
  OrganizationNameTaken: 'ORGANIZATION_NAME_TAKEN',
} as const;

export const userStatusSchema = z.enum(['active', 'locked']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const ADMIN_PAGE_SIZE_MAX = 100;

export const listUsersQuerySchema = z.object({
  /** Tìm theo email hoặc tên hiển thị. */
  search: z.string().trim().max(100).optional(),
  organizationId: z.uuid().optional(),
  status: userStatusSchema.optional(),
  systemRole: systemRoleSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(ADMIN_PAGE_SIZE_MAX).default(20),
});
export type ListUsersQuery = z.input<typeof listUsersQuerySchema>;

export const adminUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  emailVerified: z.boolean(),
  systemRole: systemRoleSchema,
  canHost: z.boolean(),
  status: userStatusSchema,
  lockedAt: z.iso.datetime().nullable(),
  lockedReason: z.string().nullable(),
  organizationId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserListSchema = z.object({
  items: z.array(adminUserSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type AdminUserList = z.infer<typeof adminUserListSchema>;

export const lockUserRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Cần nhập lý do khóa.').max(500),
});

/** Chỉ Super Admin: cấp vai trò, thu hồi quyền Host, gán tổ chức. */
export const updateUserRequestSchema = z
  .object({
    systemRole: systemRoleSchema,
    canHost: z.boolean(),
    organizationId: z.uuid().nullable(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một thay đổi.');

export type LockUserRequest = z.input<typeof lockUserRequestSchema>;
export type UpdateUserRequest = z.input<typeof updateUserRequestSchema>;

export const organizationNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(2, 'Tên tổ chức tối thiểu 2 ký tự.').max(120, 'Tên tổ chức quá dài.'));

export const organizationRequestSchema = z.object({ name: organizationNameSchema });
export type OrganizationRequest = z.input<typeof organizationRequestSchema>;

export const organizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  managerIds: z.array(z.uuid()),
  memberCount: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const organizationListSchema = z.object({ items: z.array(organizationSchema) });
