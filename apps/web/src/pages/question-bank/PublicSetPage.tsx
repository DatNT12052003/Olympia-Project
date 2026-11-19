import { ROUND_KEYS, type RoundKey } from '@olympia/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Badge, Spinner } from '../../components/Card';
import { ChevronLeftIcon } from '../../components/icons';
import { QuestionSummary } from '../../features/question-bank/QuestionSummary';
import { useCopyPublicSet, usePublicSet } from '../../features/question-bank/qb-api';
import { formatDate, ROUND_LABELS } from '../../features/question-bank/qb-format';
import { errorMessage } from '../../lib/api-client';

const GROUPS: (RoundKey | null)[] = [...ROUND_KEYS, null];

/** Xem bộ câu hỏi public và sao chép về ngân hàng (5.4, BR-QB-05). */
export function PublicSetPage() {
  const { versionId } = useParams();
  const navigate = useNavigate();
  const set = usePublicSet(versionId);
  const copy = useCopyPublicSet();
  const [error, setError] = useState<string | null>(null);

  if (set.isPending) return <Spinner />;
  if (set.isError) return <Alert tone="error">{errorMessage(set.error)}</Alert>;
  const data = set.data;

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/ngan-hang?tab=public"
        className="inline-flex items-center gap-1 self-start text-sm font-medium"
      >
        <ChevronLeftIcon size={16} />
        Bộ public
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="break-words text-[28px] font-bold leading-tight">{data.name}</h1>
            {data.mine && <Badge tone="brand">Của bạn</Badge>}
          </div>
          <p className="mt-1.5 text-[15px] text-slate-600">
            {data.ownerName} · {data.questionCount} câu
            {data.subject ? ` · ${data.subject}` : ''}
            {data.grade ? ` · Lớp ${data.grade}` : ''} · phiên bản {data.versionNo}, duyệt{' '}
            {formatDate(data.approvedAt)}
          </p>
          {data.description && (
            <p className="mt-2 max-w-2xl text-sm text-slate-700">{data.description}</p>
          )}
        </div>
        {!data.mine && (
          <Button
            loading={copy.isPending}
            loadingText="Đang sao chép…"
            onClick={() => {
              setError(null);
              copy.mutate(data.versionId, {
                onSuccess: (result) => void navigate(`/ngan-hang/bo-de/${result.setId}`),
                onError: (err) => setError(errorMessage(err)),
              });
            }}
          >
            Sao chép về ngân hàng
          </Button>
        )}
      </header>
      <p className="text-sm text-slate-600">
        Bản sao thuộc về bạn: sửa thoải mái, thay đổi của bản gốc không ảnh hưởng bản sao.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      {GROUPS.map((round) => {
        const entries = data.items
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.round === round);
        if (entries.length === 0) return null;
        return (
          <section key={round ?? 'none'} className="flex flex-col gap-2.5">
            <h2 className="text-base font-bold">
              {round ? ROUND_LABELS[round] : 'Chưa xếp vòng'}{' '}
              <span className="font-medium text-slate-500">· {entries.length} câu</span>
            </h2>
            {entries.map(({ item, index }) => (
              <QuestionSummary key={index} question={item.question} index={index + 1} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
