import type { SystemRole } from './auth.js';

/**
 * Ma trận phân quyền (đặc tả mục 2.2), dạng hàm thuần để backend và frontend dùng chung.
 *
 * Backend là nơi quyết định (BR-ROLE-05); frontend chỉ dùng để ẩn/hiện giao diện.
 * Quyền không xác định luôn bị từ chối (BR-ROLE-06).
 */

/** Quyền ở cấp hệ thống, gắn với tài khoản. */
export const SystemPermission = {
  /** Quản lý tài khoản, phân quyền. Manager chỉ trong tổ chức mình quản lý. */
  ManageUsers: 'users.manage',
  /** Cấu hình hệ thống. */
  ConfigureSystem: 'system.configure',
  /** Giám sát mọi phòng thi. Manager chỉ trong phạm vi tổ chức. */
  MonitorRooms: 'rooms.monitor',
  /** Đóng phòng, khóa người dùng vi phạm. */
  EnforceModeration: 'moderation.enforce',
  /** Kiểm duyệt bộ câu hỏi public. */
  ModerateQuestionSets: 'question-sets.moderate',
  /** Tạo/sửa/xóa câu hỏi của mình. */
  ManageOwnQuestions: 'questions.manage-own',
  /** Dùng bộ câu hỏi public. */
  UsePublicQuestionSets: 'question-sets.use-public',
  /** Tạo phòng, kịch bản. */
  CreateRooms: 'rooms.create',
  /** Xem lịch sử trận của mình. */
  ViewOwnHistory: 'history.view-own',
  /** Gửi báo cáo vi phạm (khách không được, BR-AUTH-06). */
  SubmitReports: 'reports.submit',
} as const;

export type SystemPermission = (typeof SystemPermission)[keyof typeof SystemPermission];

/** Thông tin tối thiểu về chủ thể để quyết định quyền hệ thống. */
export type PermissionSubject =
  | {
      kind: 'user';
      systemRole: SystemRole;
      emailVerified: boolean;
      canHost: boolean;
    }
  | { kind: 'guest' };

const STAFF_ROLES: readonly SystemRole[] = ['manager', 'super_admin'];

/** Quyền tạo nội dung của Host: cần email đã xác minh (BR-AUTH-01) và chưa bị thu hồi quyền Host. */
function canCreateContent(subject: Extract<PermissionSubject, { kind: 'user' }>): boolean {
  if (!subject.emailVerified) return false;
  return STAFF_ROLES.includes(subject.systemRole) || subject.canHost;
}

export function hasSystemPermission(
  subject: PermissionSubject | null | undefined,
  permission: SystemPermission,
): boolean {
  if (!subject) return false;

  if (subject.kind === 'guest') {
    // Khách chỉ xem được lịch sử trong phiên khách (BR-AUTH-06).
    return permission === SystemPermission.ViewOwnHistory;
  }

  const role = subject.systemRole;
  switch (permission) {
    case SystemPermission.ConfigureSystem:
      return role === 'super_admin';
    case SystemPermission.ManageUsers:
    case SystemPermission.MonitorRooms:
    case SystemPermission.EnforceModeration:
    case SystemPermission.ModerateQuestionSets:
      return STAFF_ROLES.includes(role);
    case SystemPermission.ManageOwnQuestions:
    case SystemPermission.UsePublicQuestionSets:
    case SystemPermission.CreateRooms:
      return canCreateContent(subject);
    case SystemPermission.ViewOwnHistory:
    case SystemPermission.SubmitReports:
      return true;
    default:
      return false;
  }
}

/**
 * Vai trò trong một phòng/trận (BR-ROLE-01). `monitor` là Super Admin/Manager vào giám sát
 * (BR-ROLE-04): xem như Spectator nhưng không gửi reaction theo ma trận 2.2.
 */
export const roomRoleValues = ['host', 'player', 'spectator', 'monitor'] as const;
export type RoomRole = (typeof roomRoleValues)[number];

export const RoomPermission = {
  /** Điều khiển trận đấu (chỉ Host của phòng). */
  ControlMatch: 'match.control',
  /** Trả lời, giành quyền. */
  Answer: 'match.answer',
  /** Bật camera/micro, phát biểu. */
  PublishMedia: 'media.publish',
  /** Xem video, nghe âm thanh. */
  SubscribeMedia: 'media.subscribe',
  SendReaction: 'reaction.send',
  ViewScoreboard: 'scoreboard.view',
} as const;

export type RoomPermission = (typeof RoomPermission)[keyof typeof RoomPermission];

const ROOM_MATRIX: Record<RoomPermission, readonly RoomRole[]> = {
  [RoomPermission.ControlMatch]: ['host'],
  [RoomPermission.Answer]: ['player'],
  [RoomPermission.PublishMedia]: ['host', 'player'],
  [RoomPermission.SubscribeMedia]: ['host', 'player', 'spectator', 'monitor'],
  [RoomPermission.SendReaction]: ['host', 'player', 'spectator'],
  [RoomPermission.ViewScoreboard]: ['host', 'player', 'spectator', 'monitor'],
};

export function hasRoomPermission(
  role: RoomRole | null | undefined,
  permission: RoomPermission,
): boolean {
  if (!role) return false;
  return ROOM_MATRIX[permission]?.includes(role) ?? false;
}
