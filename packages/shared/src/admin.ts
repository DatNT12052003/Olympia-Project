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

export const userStatusSchema = z.enum(['active', 'locked', 'pending_deletion', 'deleted']);
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
  /** Thời điểm người dùng yêu cầu xóa tài khoản (DL-008). */
  deletionRequestedAt: z.iso.datetime().nullable(),
  /** Số lần bị cảnh báo khi xử lý báo cáo vi phạm (DL-050). */
  warningCount: z.number().int(),
  organizationId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  /** Lần gần nhất tài khoản đăng nhập hoặc làm mới phiên; `null` nếu chưa đăng nhập. */
  lastActiveAt: z.iso.datetime().nullable(),
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

// --- Giám sát phòng (15.1, 15.2) ---

export const adminRoomSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  status: z.enum(['open', 'in_match']),
  visibility: z.enum(['public', 'private']),
  hostId: z.uuid(),
  hostName: z.string(),
  organizationName: z.string().nullable(),
  playerCount: z.number().int(),
  spectatorCount: z.number().int(),
  openedAt: z.iso.datetime().nullable(),
});
export type AdminRoom = z.infer<typeof adminRoomSchema>;

export const adminRoomListSchema = z.object({ items: z.array(adminRoomSchema) });
export type AdminRoomList = z.infer<typeof adminRoomListSchema>;

export const closeRoomRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Cần nhập lý do đóng phòng.').max(500),
});
export type CloseRoomRequest = z.input<typeof closeRoomRequestSchema>;

// --- Nhật ký quản trị (15.1, BR-DATA-05) ---

export const auditLogQuerySchema = z.object({
  /** Lọc theo nhóm hành động (tiền tố trước dấu chấm, ví dụ `user`, `match`). */
  category: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().trim().max(32).optional(),
  ),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(ADMIN_PAGE_SIZE_MAX).default(50),
});
export type AuditLogQuery = z.input<typeof auditLogQuerySchema>;

export const auditLogEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  actorName: z.string().nullable(),
  targetType: z.string(),
  targetId: z.uuid().nullable(),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const auditLogListSchema = z.object({
  items: z.array(auditLogEntrySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type AuditLogList = z.infer<typeof auditLogListSchema>;

/** Tên hiển thị của các hành động quản trị. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'user.lock': 'Khóa tài khoản',
  'user.unlock': 'Mở khóa tài khoản',
  'user.update': 'Cập nhật vai trò/tổ chức',
  'user.password_reset_requested': 'Gửi email đặt lại mật khẩu',
  'user.verification_email_sent': 'Gửi lại email xác minh',
  'user.warn': 'Cảnh báo người dùng',
  'organization.create': 'Tạo tổ chức',
  'organization.rename': 'Đổi tên tổ chức',
  'organization.manager_add': 'Gán Manager',
  'organization.manager_remove': 'Bỏ Manager',
  'question_set.approve': 'Duyệt bộ public',
  'question_set.reject': 'Từ chối bộ public',
  'question_set.takedown': 'Gỡ bộ public',
  'match.void': 'Hủy kết quả trận',
  'room.close': 'Đóng phòng vi phạm',
  'room.monitor': 'Vào giám sát phòng',
  'report.resolve': 'Xử lý báo cáo vi phạm',
  'system.settings_update': 'Cập nhật cấu hình hệ thống',
};
