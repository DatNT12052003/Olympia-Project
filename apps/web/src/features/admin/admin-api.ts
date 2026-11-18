import {
  type AdminUser,
  type AdminUserList,
  adminUserListSchema,
  adminUserSchema,
  type ListUsersQuery,
  type LockUserRequest,
  type Organization,
  organizationListSchema,
  type OrganizationRequest,
  organizationSchema,
  type UpdateUserRequest,
} from '@olympia/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../lib/api-client';

const userEnvelope = z.object({ user: adminUserSchema });
const organizationEnvelope = z.object({ organization: organizationSchema });

export const adminKeys = {
  users: (query: ListUsersQuery) => ['admin', 'users', query] as const,
  allUsers: ['admin', 'users'] as const,
  organizations: ['admin', 'organizations'] as const,
};

function toSearchParams(query: ListUsersQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' || typeof value === 'number') {
      if (value !== '') params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function useAdminUsers(query: ListUsersQuery, { enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: adminKeys.users(query),
    queryFn: ({ signal }): Promise<AdminUserList> =>
      apiGet(`/admin/users${toSearchParams(query)}`, {
        schema: adminUserListSchema,
        auth: true,
        signal,
      }),
    placeholderData: (previous) => previous,
  });
}

export function useOrganizations() {
  return useQuery({
    queryKey: adminKeys.organizations,
    queryFn: async ({ signal }): Promise<Organization[]> =>
      (await apiGet('/admin/organizations', { schema: organizationListSchema, auth: true, signal }))
        .items,
  });
}

/** Mutation quản trị; thành công thì làm mới danh sách tài khoản và tổ chức. */
function useAdminMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.allUsers }),
        queryClient.invalidateQueries({ queryKey: adminKeys.organizations }),
      ]),
  });
}

export function useLockUser() {
  return useAdminMutation(
    async ({ userId, ...body }: LockUserRequest & { userId: string }): Promise<AdminUser> =>
      (await apiPost(`/admin/users/${userId}/lock`, body, { schema: userEnvelope, auth: true }))
        .user,
  );
}

export function useUnlockUser() {
  return useAdminMutation(
    async (userId: string): Promise<AdminUser> =>
      (
        await apiPost(`/admin/users/${userId}/unlock`, undefined, {
          schema: userEnvelope,
          auth: true,
        })
      ).user,
  );
}

export function useUpdateUser() {
  return useAdminMutation(
    async ({ userId, ...body }: UpdateUserRequest & { userId: string }): Promise<AdminUser> =>
      (await apiPatch(`/admin/users/${userId}`, body, { schema: userEnvelope, auth: true })).user,
  );
}

export function useSendPasswordReset() {
  return useMutation({
    mutationFn: (userId: string) =>
      apiPost(`/admin/users/${userId}/password-reset`, undefined, { auth: true }),
  });
}

export function useCreateOrganization() {
  return useAdminMutation(
    async (body: OrganizationRequest): Promise<Organization> =>
      (await apiPost('/admin/organizations', body, { schema: organizationEnvelope, auth: true }))
        .organization,
  );
}

export function useAssignManager() {
  return useAdminMutation(
    ({ organizationId, userId }: { organizationId: string; userId: string }) =>
      apiPut(`/admin/organizations/${organizationId}/managers/${userId}`, { auth: true }),
  );
}

export function useRemoveManager() {
  return useAdminMutation(
    ({ organizationId, userId }: { organizationId: string; userId: string }) =>
      apiDelete(`/admin/organizations/${organizationId}/managers/${userId}`, { auth: true }),
  );
}
