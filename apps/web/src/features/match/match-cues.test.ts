import type { MatchQuestionView, MatchView, WarmupView } from '@olympia/shared';
import { describe, expect, it } from 'vitest';
import { detectCues } from './match-cues';

function question(overrides: Partial<MatchQuestionView> = {}): MatchQuestionView {
  return {
    ref: 'q1',
    phase: 'answering',
    content: 'Câu hỏi',
    answerType: 'true_false',
    options: null,
    media: null,
    points: { correct: 10, wrong: 0 },
    correctAnswer: null,
    explanation: null,
    answeringSeat: 1,
    answers: [
      { seat: 1, state: 'answered', answer: null, elapsedMs: 1200, suggested: null },
      { seat: 2, state: 'answered', answer: null, elapsedMs: 1500, suggested: null },
    ],
    ...overrides,
  };
}

function warmup(overrides: Partial<WarmupView> = {}): WarmupView {
  return {
    type: 'warmup',
    part: 'shared',
    turnSeat: null,
    questionNo: 1,
    questionTotal: 6,
    question: question(),
    buzz: null,
    history: [],
    ...overrides,
  } as WarmupView;
}

function view(overrides: Partial<MatchView> = {}): MatchView {
  return {
    matchId: 'm1',
    roomId: 'r1',
    version: 1,
    audience: 'player',
    mySeat: 1,
    mode: 'manual',
    status: 'running',
    endReason: null,
    pause: null,
    rounds: [{ type: 'warmup', title: 'Khởi động' }],
    roundIndex: 0,
    roundFinished: false,
    nextStep: 'finish',
    awaitingHost: false,
    tiebreakWinner: null,
    soundEffects: true,
    players: [],
    timer: null,
    round: warmup(),
    log: [],
    serverTime: 0,
    ...overrides,
  };
}

describe('Âm thanh/hiệu ứng theo diễn biến trận (11.4)', () => {
  it('kết quả của chính người chơi: âm thanh và nháy màn hình theo đúng/sai', () => {
    const revealed = (state: 'correct' | 'wrong') =>
      view({
        version: 2,
        round: warmup({
          question: question({
            phase: 'revealed',
            answers: [
              { seat: 1, state, answer: null, elapsedMs: 1200, suggested: null },
              { seat: 2, state: 'correct', answer: null, elapsedMs: 1500, suggested: null },
            ],
          }),
        }),
      });

    expect(detectCues(view(), revealed('correct'))).toEqual({
      cues: ['correct'],
      flash: 'correct',
    });
    expect(detectCues(view(), revealed('wrong'))).toEqual({ cues: ['wrong'], flash: 'wrong' });
  });

  it('khán giả nghe âm "đúng" khi có người trả lời đúng, không nháy màn hình', () => {
    const next = view({
      version: 2,
      audience: 'spectator',
      mySeat: null,
      round: warmup({
        question: question({
          phase: 'revealed',
          answers: [{ seat: 2, state: 'correct', answer: null, elapsedMs: 1, suggested: null }],
        }),
      }),
    });

    expect(detectCues(view({ audience: 'spectator', mySeat: null }), next)).toEqual({
      cues: ['correct'],
      flash: null,
    });
  });

  it('câu mới, giành quyền và kết thúc trận', () => {
    const fresh = view({ version: 2, round: warmup({ question: question({ ref: 'q2' }) }) });
    expect(detectCues(view(), fresh).cues).toEqual(['question']);

    const buzzed = view({
      version: 2,
      round: warmup({ buzz: { open: false, winnerSeat: 2, attemptedSeats: [2] } }),
    });
    expect(
      detectCues(
        view({ round: warmup({ buzz: { open: true, winnerSeat: null, attemptedSeats: [] } }) }),
        buzzed,
      ).cues,
    ).toEqual(['buzz']);

    expect(detectCues(view(), view({ version: 2, status: 'finished' })).cues).toEqual(['win']);
    expect(
      detectCues(view(), view({ version: 2, status: 'finished', endReason: 'abnormal' })).cues,
    ).toEqual([]);
  });

  it('bỏ qua bản cũ hơn, bản đầu tiên và trận khác', () => {
    const next = view({ version: 2, round: warmup({ question: question({ ref: 'q2' }) }) });
    expect(detectCues(null, next).cues).toEqual([]);
    expect(detectCues(view({ version: 3 }), next).cues).toEqual([]);
    expect(detectCues(view({ matchId: 'other' }), next).cues).toEqual([]);
  });
});
