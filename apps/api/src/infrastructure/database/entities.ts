import { AdminAuditLogEntity } from '../../modules/audit/admin-audit-log.entity';
import { MediaAssetEntity } from '../../modules/media/media-asset.entity';
import { QuestionSetItemEntity } from '../../modules/question-bank/question-set-item.entity';
import { QuestionSetVersionEntity } from '../../modules/question-bank/question-set-version.entity';
import { QuestionSetEntity } from '../../modules/question-bank/question-set.entity';
import { QuestionEntity } from '../../modules/question-bank/question.entity';
import { AuthSessionEntity } from '../../modules/auth/auth-session.entity';
import { RefreshTokenEntity } from '../../modules/auth/refresh-token.entity';
import { UserActionTokenEntity } from '../../modules/auth/user-action-token.entity';
import { OrganizationManagerEntity } from '../../modules/organizations/organization-manager.entity';
import { OrganizationEntity } from '../../modules/organizations/organization.entity';
import { RoomBanEntity } from '../../modules/rooms/room-ban.entity';
import { RoomParticipantEntity } from '../../modules/rooms/room-participant.entity';
import { RoomEntity } from '../../modules/rooms/room.entity';
import { UserEntity } from '../../modules/users/user.entity';

/** Khai báo tường minh (không dùng glob) để tsx, Jest và bản build nạp giống nhau. */
export const entities = [
  UserEntity,
  OrganizationEntity,
  OrganizationManagerEntity,
  AuthSessionEntity,
  RefreshTokenEntity,
  UserActionTokenEntity,
  AdminAuditLogEntity,
  RoomEntity,
  RoomParticipantEntity,
  RoomBanEntity,
  MediaAssetEntity,
  QuestionEntity,
  QuestionSetEntity,
  QuestionSetItemEntity,
  QuestionSetVersionEntity,
];
