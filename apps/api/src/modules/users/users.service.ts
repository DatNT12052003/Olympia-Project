import type { CurrentUser, updateProfileRequestSchema } from '@olympia/shared';
import type { DataSource } from 'typeorm';
import type { z } from 'zod';
import { NotFoundError } from '../../shared/errors/app-error';
import { UserEntity } from './user.entity';
import { toCurrentUser } from './user.mapper';

/** Hồ sơ của chính người dùng đang đăng nhập (`/api/me`). */
export function createUsersService(dataSource: DataSource) {
  const users = dataSource.getRepository(UserEntity);

  async function load(userId: string): Promise<UserEntity> {
    const user = await users.findOneBy({ id: userId });
    if (!user) throw new NotFoundError('Không tìm thấy tài khoản.');
    return user;
  }

  return {
    async getMe(userId: string): Promise<CurrentUser> {
      return toCurrentUser(await load(userId));
    },

    /** Ảnh đại diện được bổ sung khi có object storage (DL-025). */
    async updateProfile(
      userId: string,
      input: z.output<typeof updateProfileRequestSchema>,
    ): Promise<CurrentUser> {
      const user = await load(userId);
      if (input.displayName !== undefined) user.displayName = input.displayName;
      await users.save(user);
      return toCurrentUser(user);
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
