import {
  adminRoomListSchema,
  type AdminUser,
  type AdminUserList,
  auditLogListSchema,
  adminUserListSchema,
  adminUserSchema,
  type ListUsersQuery,
  type LockUserRequest,
  type Organization,
  organizationListSchema,
  type OrganizationRequest,
  organizationSchema,
  reportListSchema,
  type ReportStatus,
  reportViewSchema,
  type ResolveReportRequest,
  systemSettingsResponseSchema,
  type UpdateSystemSettings,
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

export function useResendVerificationEmail() {
  return useMutation({
    mutationFn: (userId: string) =>
      apiPost(`/admin/users/${userId}/verification-email`, undefined, { auth: true }),
  });
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
      apiPut(`/admin/organizations/${organizationId}/managers/${userId}`, undefined, {
        auth: true,
      }),
  );
}

export function useRemoveManager() {
  return useAdminMutation(
    ({ organizationId, userId }: { organizationId: string; userId: string }) =>
      apiDelete(`/admin/organizations/${organizationId}/managers/${userId}`, { auth: true }),
  );
}

// --- P7: cấu hình hệ thống, giám sát phòng, nhật ký, báo cáo vi phạm ---

export const p7Keys = {
  settings: ['admin', 'settings'] as const,
  rooms: ['admin', 'rooms'] as const,
  auditLogs: (query: { category: string; page: number }) => ['admin', 'audit-logs', query] as const,
  reports: (status: ReportStatus) => ['admin', 'reports', status] as const,
  allReports: ['admin', 'reports'] as const,
};

export function useSystemSettings() {
  return useQuery({
    queryKey: p7Keys.settings,
    queryFn: ({ signal }) =>
      apiGet('/admin/settings', { schema: systemSettingsResponseSchema, auth: true, signal }),
  });
}

export function useUpdateSystemSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateSystemSettings) =>
      apiPatch('/admin/settings', patch, { schema: systemSettingsResponseSchema, auth: true }),
    onSuccess: (data) => {
      queryClient.setQueryData(p7Keys.settings, data);
      return queryClient.invalidateQueries({ queryKey: ['settings', 'public'] });
    },
  });
}

export function useAdminRooms() {
  return useQuery({
    queryKey: p7Keys.rooms,
    queryFn: async ({ signal }) =>
      (await apiGet('/admin/rooms', { schema: adminRoomListSchema, auth: true, signal })).items,
    refetchInterval: 15_000,
  });
}

export function useCloseRoomAsStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, reason }: { roomId: string; reason: string }) =>
      apiPost(`/admin/rooms/${roomId}/close`, { reason }, { auth: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: p7Keys.rooms }),
  });
}

export function useAuditLogs(query: { category: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: p7Keys.auditLogs(query),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (query.category) params.set('category', query.category);
      params.set('page', String(query.page));
      params.set('pageSize', String(query.pageSize));
      return apiGet(`/admin/audit-logs?${params.toString()}`, {
        schema: auditLogListSchema,
        auth: true,
        signal,
      });
    },
    placeholderData: (previous) => previous,
  });
}

export function useReports(status: ReportStatus, { enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: p7Keys.reports(status),
    queryFn: ({ signal }) =>
      apiGet(`/moderation/reports?status=${status}`, {
        schema: reportListSchema,
        auth: true,
        signal,
      }),
  });
}

export function useResolveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, ...body }: ResolveReportRequest & { reportId: string }) =>
      (
        await apiPost(`/moderation/reports/${reportId}/resolve`, body, {
          schema: z.object({ report: reportViewSchema }),
          auth: true,
        })
      ).report,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: p7Keys.allReports }),
        queryClient.invalidateQueries({ queryKey: adminKeys.allUsers }),
      ]),
  });
}
