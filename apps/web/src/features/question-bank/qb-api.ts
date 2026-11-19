import {
  createUploadResponseSchema,
  MEDIA_RULES,
  type MediaView,
  mediaKindOf,
  mediaViewSchema,
  publicSetDetailSchema,
  publicSetListSchema,
  type QuestionInput,
  questionFacetsSchema,
  type QuestionListQuery,
  questionListSchema,
  type QuestionSetDetail,
  questionSetDetailSchema,
  type QuestionSetInput,
  questionSetListSchema,
  questionViewSchema,
  type RandomFillRequest,
  reviewDetailSchema,
  reviewQueueSchema,
  type RoundKey,
} from '@olympia/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from '../../lib/api-client';

const questionEnvelope = z.object({ question: questionViewSchema });
const setEnvelope = z.object({ set: questionSetDetailSchema });
const setChangeEnvelope = z.object({ added: z.number().int(), set: questionSetDetailSchema });

export const qbKeys = {
  all: ['question-bank'] as const,
  questions: (query: QuestionListQuery) => ['question-bank', 'questions', query] as const,
  question: (id: string) => ['question-bank', 'question', id] as const,
  facets: ['question-bank', 'facets'] as const,
  sets: ['question-bank', 'sets'] as const,
  set: (id: string) => ['question-bank', 'set', id] as const,
  publicSets: (q: string) => ['question-bank', 'public', q] as const,
  publicSet: (id: string) => ['question-bank', 'public-set', id] as const,
  reviewQueue: ['question-bank', 'review-queue'] as const,
  review: (id: string) => ['question-bank', 'review', id] as const,
};

function toQueryString(
  query: Record<string, string | number | boolean | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

// --- Câu hỏi ---

export function useQuestions(query: QuestionListQuery) {
  return useQuery({
    queryKey: qbKeys.questions(query),
    queryFn: () =>
      apiGet(`/questions${toQueryString(query)}`, { schema: questionListSchema, auth: true }),
    placeholderData: keepPreviousData,
  });
}

export function useQuestionFacets() {
  return useQuery({
    queryKey: qbKeys.facets,
    queryFn: () => apiGet('/questions/facets', { schema: questionFacetsSchema, auth: true }),
  });
}

export function useQuestion(id: string | undefined) {
  return useQuery({
    queryKey: qbKeys.question(id ?? ''),
    queryFn: async () =>
      (await apiGet(`/questions/${id}`, { schema: questionEnvelope, auth: true })).question,
    enabled: Boolean(id),
  });
}

/** Mutation trong ngân hàng câu hỏi; làm mới mọi dữ liệu ngân hàng sau khi thành công. */
function useQbMutation<V, R>(fn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qbKeys.all }),
  });
}

export function useSaveQuestion(id: string | undefined) {
  return useQbMutation(async (input: QuestionInput) => {
    const result = id
      ? await apiPut(`/questions/${id}`, input, { schema: questionEnvelope, auth: true })
      : await apiPost('/questions', input, { schema: questionEnvelope, auth: true });
    return result.question;
  });
}

export function useDeleteQuestions() {
  return useQbMutation((ids: string[]) =>
    apiPost(
      '/questions/delete',
      { ids },
      { schema: z.object({ deleted: z.number() }), auth: true },
    ),
  );
}

// --- Media (BR-QB-02) ---

/** Kiểm tra định dạng/dung lượng phía trình duyệt; server kiểm tra lại sau khi upload. */
export function mediaProblem(file: File): string | null {
  const kind = mediaKindOf(file.type);
  if (!kind)
    return 'Định dạng không được hỗ trợ. Dùng ảnh JPG, PNG, WEBP; video MP4; âm thanh MP3.';
  const max = MEDIA_RULES[kind].maxBytes;
  if (file.size > max) {
    return `Tệp vượt dung lượng cho phép (tối đa ${Math.round(max / (1024 * 1024))} MB).`;
  }
  return null;
}

/** Upload thẳng lên object storage qua presigned URL rồi nhờ server kiểm tra tệp. */
export async function uploadMedia(file: File): Promise<MediaView> {
  const upload = await apiPost(
    '/media/uploads',
    { fileName: file.name, contentType: file.type, sizeBytes: file.size },
    { schema: createUploadResponseSchema, auth: true },
  );
  let response: Response;
  try {
    response = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: upload.headers,
      body: file,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Không tải được tệp lên máy chủ lưu trữ.');
  }
  if (!response.ok) {
    throw new ApiError(response.status, 'UPLOAD_FAILED', 'Tải tệp lên thất bại. Vui lòng thử lại.');
  }
  const { media } = await apiPost(`/media/${upload.mediaId}/complete`, undefined, {
    schema: z.object({ media: mediaViewSchema }),
    auth: true,
  });
  return media;
}

// --- Bộ đề ---

export function useQuestionSets() {
  return useQuery({
    queryKey: qbKeys.sets,
    queryFn: async () =>
      (await apiGet('/question-sets', { schema: questionSetListSchema, auth: true })).items,
  });
}

export function useQuestionSet(id: string | undefined) {
  return useQuery({
    queryKey: qbKeys.set(id ?? ''),
    queryFn: async () =>
      (await apiGet(`/question-sets/${id}`, { schema: setEnvelope, auth: true })).set,
    enabled: Boolean(id),
  });
}

export function useCreateSet() {
  return useQbMutation(
    async (input: QuestionSetInput) =>
      (await apiPost('/question-sets', input, { schema: setEnvelope, auth: true })).set,
  );
}

/** Thao tác trên một bộ đề; trả về bộ đề sau thay đổi. */
export function useSetMutation<V>(
  fn: (variables: V) => Promise<QuestionSetDetail | { added: number; set: QuestionSetDetail }>,
) {
  return useQbMutation(fn);
}

export const setApi = {
  update: async (id: string, input: QuestionSetInput) =>
    (await apiPut(`/question-sets/${id}`, input, { schema: setEnvelope, auth: true })).set,
  remove: (id: string) => apiDelete(`/question-sets/${id}`, { auth: true }),
  replaceItems: async (id: string, items: { questionId: string; round: RoundKey | null }[]) =>
    (await apiPut(`/question-sets/${id}/items`, { items }, { schema: setEnvelope, auth: true }))
      .set,
  append: (id: string, questionIds: string[], round: RoundKey | null) =>
    apiPost(
      `/question-sets/${id}/items`,
      { questionIds, round },
      { schema: setChangeEnvelope, auth: true },
    ),
  random: (id: string, input: RandomFillRequest) =>
    apiPost(`/question-sets/${id}/random`, input, { schema: setChangeEnvelope, auth: true }),
  publish: async (id: string) =>
    (await apiPost(`/question-sets/${id}/publish`, undefined, { schema: setEnvelope, auth: true }))
      .set,
  unpublish: async (id: string) =>
    (
      await apiPost(`/question-sets/${id}/unpublish`, undefined, {
        schema: setEnvelope,
        auth: true,
      })
    ).set,
};

// --- Bộ public ---

export function usePublicSets(q: string) {
  return useQuery({
    queryKey: qbKeys.publicSets(q),
    queryFn: async () =>
      (
        await apiGet(`/public-question-sets${toQueryString({ q })}`, {
          schema: publicSetListSchema,
          auth: true,
        })
      ).items,
    placeholderData: keepPreviousData,
  });
}

export function usePublicSet(versionId: string | undefined) {
  return useQuery({
    queryKey: qbKeys.publicSet(versionId ?? ''),
    queryFn: async () =>
      (
        await apiGet(`/public-question-sets/${versionId}`, {
          schema: z.object({ set: publicSetDetailSchema }),
          auth: true,
        })
      ).set,
    enabled: Boolean(versionId),
  });
}

export function useCopyPublicSet() {
  return useQbMutation((versionId: string) =>
    apiPost(`/public-question-sets/${versionId}/copy`, undefined, {
      schema: z.object({ setId: z.uuid() }),
      auth: true,
    }),
  );
}

// --- Kiểm duyệt ---

export function useReviewQueue(enabled = true) {
  return useQuery({
    queryKey: qbKeys.reviewQueue,
    queryFn: async () =>
      (await apiGet('/moderation/question-sets', { schema: reviewQueueSchema, auth: true })).items,
    enabled,
    refetchInterval: 60_000,
  });
}

export function useReviewDetail(versionId: string | undefined) {
  return useQuery({
    queryKey: qbKeys.review(versionId ?? ''),
    queryFn: async () =>
      (
        await apiGet(`/moderation/question-sets/${versionId}`, {
          schema: z.object({ version: reviewDetailSchema }),
          auth: true,
        })
      ).version,
    enabled: Boolean(versionId),
  });
}

export function useReviewAction() {
  return useQbMutation(
    ({
      versionId,
      action,
      reason,
    }: {
      versionId: string;
      action: 'approve' | 'reject';
      reason?: string;
    }) =>
      apiPost(
        `/moderation/question-sets/${versionId}/${action}`,
        action === 'reject' ? { reason } : undefined,
        { auth: true },
      ),
  );
}
