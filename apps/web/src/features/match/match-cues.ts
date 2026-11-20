import type { MatchQuestionView, MatchView, RoundView } from '@olympia/shared';
import { useEffect, useRef, useState } from 'react';
import { type MatchCue, playCue, readSoundMuted, writeSoundMuted } from './sound';

/** Kết quả của chính người chơi vừa được công bố: hiệu ứng nháy màn hình. */
export type ResultFlash = 'correct' | 'wrong';

export interface DetectedCues {
  cues: MatchCue[];
  flash: ResultFlash | null;
}

function questionOf(round: RoundView): MatchQuestionView | null {
  return round.question;
}

/** Ghế vừa giành quyền trả lời (chuông Khởi động/câu phụ, cướp điểm Về đích). */
function buzzWinnerOf(round: RoundView): number | null {
  if ('buzz' in round && round.buzz) return round.buzz.winnerSeat;
  if (round.type === 'finish' && round.steal) return round.steal.winnerSeat;
  return null;
}

/**
 * So sánh hai bản trạng thái trận liên tiếp để biết cần phát âm thanh/hiệu ứng nào. Hàm thuần,
 * chỉ dựa trên dữ liệu server đã gửi cho người xem nên không lộ gì thêm (BR-RT-01).
 */
export function detectCues(prev: MatchView | null, next: MatchView): DetectedCues {
  const none: DetectedCues = { cues: [], flash: null };
  if (!prev || prev.matchId !== next.matchId || next.version <= prev.version) return none;

  if (prev.status !== 'finished' && next.status === 'finished') {
    return { cues: next.endReason === 'abnormal' ? [] : ['win'], flash: null };
  }

  const cues: MatchCue[] = [];
  let flash: ResultFlash | null = null;
  const before = questionOf(prev.round);
  const after = questionOf(next.round);

  if (after && after.ref !== before?.ref && after.phase !== 'skipped' && after.phase !== 'voided') {
    cues.push('question');
  }

  if (
    after &&
    before?.ref === after.ref &&
    before.phase !== 'revealed' &&
    after.phase === 'revealed'
  ) {
    const mine = next.mySeat === null ? null : after.answers.find((a) => a.seat === next.mySeat);
    if (mine && (mine.state === 'correct' || mine.state === 'wrong')) {
      cues.push(mine.state);
      flash = mine.state;
    } else if (after.answers.some((a) => a.state === 'correct')) {
      cues.push('correct');
    } else if (after.answers.some((a) => a.state === 'wrong')) {
      cues.push('wrong');
    }
  }

  if (prev.round.type === next.round.type) {
    const winner = buzzWinnerOf(next.round);
    if (winner !== null && buzzWinnerOf(prev.round) === null) cues.push('buzz');
  }

  if (prev.round.type === 'obstacle' && next.round.type === 'obstacle') {
    const solver = next.round.keyword.solvedBy;
    if (solver !== null && prev.round.keyword.solvedBy === null) {
      cues.push('correct');
      if (solver === next.mySeat) flash = 'correct';
    }
  }

  return { cues, flash };
}

const TICK_SECONDS = 5;

/**
 * Phát âm thanh/hiệu ứng theo diễn biến trận (11.4). Tắt khi kịch bản tắt hiệu ứng âm thanh hoặc
 * người xem tự tắt; nháy màn hình kết quả vẫn hiện (trừ khi giảm chuyển động).
 */
export function useMatchCues(view: MatchView | null, clockOffset: number) {
  const [muted, setMutedState] = useState(readSoundMuted);
  const [flash, setFlash] = useState<{ result: ResultFlash; key: number } | null>(null);
  const previous = useRef<MatchView | null>(null);
  const soundOn = Boolean(view?.soundEffects) && !muted;
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    if (!view) return;
    const detected = detectCues(previous.current, view);
    if (!previous.current || view.version >= previous.current.version) previous.current = view;
    if (soundOnRef.current) for (const cue of detected.cues) playCue(cue);
    if (detected.flash) setFlash({ result: detected.flash, key: view.version });
  }, [view]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(timer);
  }, [flash]);

  // Tích tắc trong 5 giây cuối của đồng hồ trả lời/giành quyền.
  const timer = view?.status === 'running' ? view.timer : null;
  const ticking = timer && timer.endsAt !== null && ['answer', 'buzz'].includes(timer.purpose);
  const endsAt = ticking ? timer.endsAt : null;
  useEffect(() => {
    if (endsAt === null) return;
    let last = Number.POSITIVE_INFINITY;
    const interval = setInterval(() => {
      const left = Math.ceil((endsAt - (Date.now() + clockOffset)) / 1000);
      if (left > 0 && left <= TICK_SECONDS && left < last) {
        last = left;
        if (soundOnRef.current) playCue('tick');
      }
    }, 200);
    return () => clearInterval(interval);
  }, [endsAt, clockOffset]);

  return {
    flash,
    /** Kịch bản cho phép âm thanh (nút tắt/bật chỉ hiện khi có). */
    available: Boolean(view?.soundEffects),
    muted,
    setMuted: (value: boolean) => {
      writeSoundMuted(value);
      setMutedState(value);
    },
  };
}
