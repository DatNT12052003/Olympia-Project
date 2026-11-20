import {
  type CreateReportRequest,
  createReportRequestSchema,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  type ReportCategory,
} from '@olympia/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/TextField';
import { apiPost, errorMessage } from '../../lib/api-client';
import { type FieldErrors, zodFieldErrors } from '../../lib/form-errors';

export type ReportTarget =
  | { kind: 'question_set_version'; versionId: string; label: string }
  | {
      kind: 'room';
      roomId: string;
      label: string;
      /** Người có thể bị báo cáo; `id: null` là Host/phòng. */
      people: { id: string | null; name: string }[];
    };

/** Gửi báo cáo vi phạm (mục 15.3): câu hỏi public hoặc hành vi trong phòng. */
export function ReportDialog({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const categories = REPORT_CATEGORIES[target.kind === 'room' ? 'room' : 'question_set_version'];
  const [category, setCategory] = useState<ReportCategory>(categories[0]!);
  const [participantId, setParticipantId] = useState<string>(
    target.kind === 'room' ? (target.people[0]?.id ?? '') : '',
  );
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useMutation({
    mutationFn: (body: CreateReportRequest) => apiPost('/reports', body, { auth: true }),
  });

  function submit() {
    const body: CreateReportRequest =
      target.kind === 'room'
        ? {
            targetType: 'room',
            targetId: target.roomId,
            participantId: participantId || null,
            category,
            description,
          }
        : { targetType: 'question_set_version', targetId: target.versionId, category, description };
    const parsed = createReportRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    mutation.mutate(body);
  }

  return (
    <Modal
      title="Báo cáo vi phạm"
      description={
        target.kind === 'room'
          ? `Phòng “${target.label}”. Manager/Super Admin sẽ xem xét báo cáo.`
          : `Bộ câu hỏi “${target.label}”. Manager/Super Admin sẽ xem xét báo cáo.`
      }
      onClose={onClose}
    >
      {mutation.isSuccess ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success" title="Đã gửi báo cáo">
            Cảm ơn bạn. Báo cáo sẽ được xử lý trong thời gian sớm nhất.
          </Alert>
          <div className="flex justify-end">
            <Button onClick={onClose}>Đóng</Button>
          </div>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3.5 text-slate-900"
        >
          {target.kind === 'room' && (
            <SelectField
              label="Người bị báo cáo"
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
            >
              {target.people.map((p) => (
                <option key={p.id ?? 'host'} value={p.id ?? ''}>
                  {p.name}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField
            label="Loại vi phạm"
            value={category}
            onChange={(e) => setCategory(e.target.value as ReportCategory)}
            error={errors.category}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {REPORT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </SelectField>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-description" className="text-sm font-semibold">
              Mô tả
            </label>
            <textarea
              id="report-description"
              rows={4}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={errors.description ? 'report-description-error' : undefined}
              placeholder="Mô tả cụ thể vi phạm (câu nào, lúc nào, ai)…"
              className="resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px]"
            />
            {errors.description && (
              <p id="report-description-error" className="text-[13px] text-orange-800">
                {errors.description}
              </p>
            )}
          </div>
          {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={mutation.isPending} loadingText="Đang gửi…">
              Gửi báo cáo
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
