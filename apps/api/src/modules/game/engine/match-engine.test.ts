import {
  ANSWER_GRACE_MS,
  DEFAULT_SCRIPT_SETTINGS,
  type HostCommand,
  MatchErrorCode,
  type QuestionAnswer,
  WARMUP_PRESETS,
  type WarmupRules,
} from '@olympia/shared';
import { applyInput, buildMatchView, createInitialState, type EngineInput } from './match-engine';
import type { EngineEffect, MatchQuestion, MatchState, ScriptSnapshot } from './match-state';

const T0 = 1_800_000_000_000;

/** Mã lỗi nghiệp vụ mà `fn` ném ra (`undefined` nếu không lỗi). */
function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

function question(i: number, answer?: QuestionAnswer): MatchQuestion {
  return {
    sourceQuestionId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    content: `Câu hỏi ${i}`,
    answer: answer ?? { type: 'mcq', options: ['2', '3', '4', '6'], correctIndex: 2 },
    explanation: `Giải thích ${i}`,
    mediaId: null,
  };
}

function rules(patch: Partial<WarmupRules> = {}): WarmupRules {
  const base = structuredClone(WARMUP_PRESETS[0]!.rules);
  return {
    ...base,
    ...patch,
    individual: { ...base.individual, questionsPerPlayer: 2, ...patch.individual },
    shared: { ...base.shared, questionCount: 2, ...patch.shared },
  };
}

function setup(options: { rules?: WarmupRules; questions?: number; allowNegative?: boolean } = {}) {
  const snapshot: ScriptSnapshot = {
    scriptId: null,
    name: 'Kịch bản test',
    settings: { ...DEFAULT_SCRIPT_SETTINGS, allowNegativeScore: options.allowNegative ?? false },
    rounds: [
      {
        round: { type: 'warmup', preset: 'olympia', source: null, rules: options.rules ?? rules() },
        questions: Array.from({ length: options.questions ?? 7 }, (_, i) => question(i)),
      },
    ],
  };
  const state = createInitialState({
    matchId: 'm1',
    roomId: 'r1',
    hostKey: 'u:host',
    snapshot,
    players: [
      { seat: 1, displayName: 'Minh Anh', kind: 'user', key: 'u:p1' },
      { seat: 2, displayName: 'Bảo Ngọc', kind: 'guest', key: 'g:p2' },
    ],
    now: T0,
  });
  let current: MatchState = state;
  let clock = T0;
  const effects: EngineEffect[] = [];
  return {
    snapshot,
    get state() {
      return current;
    },
    advance(ms: number) {
      clock += ms;
    },
    get now() {
      return clock;
    },
    effects,
    apply(input: EngineInput) {
      const result = applyInput(current, snapshot, input, clock);
      current = result.state;
      effects.push(...result.effects);
      return result;
    },
    command(command: HostCommand) {
      return this.apply({ type: 'command', command });
    },
    view(audience: 'host' | 'player' | 'spectator' = 'host', seat: number | null = null) {
      return buildMatchView(current, {
        audience,
        seat,
        presence: new Map(),
        media: new Map(),
        now: clock,
      }).round;
    },
    score(seat: number) {
      return current.players.find((p) => p.seat === seat)!.score;
    },
  };
}

describe('Game Engine – vòng Khởi động', () => {
  it('chia câu: mỗi người chơi một lượt riêng, sau đó phần thi chung, còn lại là dự phòng', () => {
    const game = setup();
    expect(game.view().reserves).toBe(1);
    game.command({ type: 'next_question' });
    const view = game.view();
    expect(view.part).toBe('individual');
    expect(view.turnSeat).toBe(1);
    expect(view.questionNo).toBe(1);
    expect(view.questionTotal).toBe(2);
    expect(view.question?.phase).toBe('showing');
  });

  it('phần thi riêng: chỉ người đến lượt trả lời, chấm tự động gợi ý, Host xác nhận mới cộng điểm', () => {
    const game = setup();
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    const ref = game.view().question!.ref;

    expect(
      codeOf(() =>
        game.apply({
          type: 'answer',
          seat: 2,
          questionRef: ref,
          answer: { type: 'mcq', index: 2 },
          receivedAt: game.now,
        }),
      ),
    ).toBe(MatchErrorCode.NotYourTurn);

    game.advance(1234);
    const result = game.apply({
      type: 'answer',
      seat: 1,
      questionRef: ref,
      answer: { type: 'mcq', index: 2 },
      receivedAt: game.now,
    });
    expect(result.reply).toEqual({ elapsedMs: 1234 });
    expect(game.view().question?.phase).toBe('judging');
    expect(game.view().question?.answers[0]?.suggested).toBe('correct');
    expect(game.score(1)).toBe(0);

    game.command({ type: 'judge', seat: 1, correct: true });
    expect(game.score(1)).toBe(10);
    expect(game.view().question?.phase).toBe('revealed');
    expect(game.effects.filter((e) => e.kind === 'answer')).toHaveLength(1);
    expect(game.effects.filter((e) => e.kind === 'score')).toEqual([
      expect.objectContaining({ seat: 1, delta: 10, reason: 'correct', questionRef: ref }),
    ]);
  });

  it('chỉ nhận một đáp án mỗi người mỗi câu (BR-GAME-03)', () => {
    const game = setup();
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    const ref = game.view().question!.ref;
    const answer: EngineInput = {
      type: 'answer',
      seat: 1,
      questionRef: ref,
      answer: { type: 'mcq', index: 0 },
      receivedAt: game.now,
    };
    game.apply(answer);
    expect(codeOf(() => game.apply(answer))).toBe(MatchErrorCode.AnswerClosed);
  });

  it('từ chối đáp án đến sau hết giờ quá sai số mạng (BR-GAME-02)', () => {
    const game = setup();
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    const ref = game.view().question!.ref;
    const endsAt = game.state.timer!.endsAt!;
    expect(
      codeOf(() =>
        game.apply({
          type: 'answer',
          seat: 1,
          questionRef: ref,
          answer: { type: 'mcq', index: 2 },
          receivedAt: endsAt + ANSWER_GRACE_MS + 1,
        }),
      ),
    ).toBe(MatchErrorCode.AnswerClosed);
    // Trong sai số vẫn nhận.
    game.apply({
      type: 'answer',
      seat: 1,
      questionRef: ref,
      answer: { type: 'mcq', index: 2 },
      receivedAt: endsAt + ANSWER_GRACE_MS,
    });
  });

  it('hết giờ: khóa trả lời, chờ Host chấm; không trả lời tính là bỏ qua', () => {
    const game = setup();
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    const timerId = game.state.timer!.id;
    game.apply({ type: 'timer', timerId });
    expect(game.view().question?.phase).toBe('judging');
    game.command({ type: 'judge', seat: 1, correct: false });
    expect(game.view().question?.answers[0]?.state).toBe('skipped');
    // Đồng hồ cũ không còn hiệu lực.
    expect(game.apply({ type: 'timer', timerId }).changed).toBe(false);
  });

  it('tạm dừng giữ thời gian còn lại, tiếp tục đếm tiếp (BR-GAME-04)', () => {
    const game = setup();
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    game.advance(2000);
    game.command({ type: 'pause' });
    expect(game.state.timer).toEqual(expect.objectContaining({ endsAt: null, remainingMs: 3000 }));
    const ref = game.view().question!.ref;
    expect(
      codeOf(() =>
        game.apply({
          type: 'answer',
          seat: 1,
          questionRef: ref,
          answer: { type: 'mcq', index: 2 },
          receivedAt: game.now,
        }),
      ),
    ).toBe(MatchErrorCode.Paused);
    expect(codeOf(() => game.command({ type: 'next_question' }))).toBe(MatchErrorCode.Paused);
    game.advance(60_000);
    game.command({ type: 'resume' });
    expect(game.state.timer?.endsAt).toBe(game.now + 3000);
  });

  it('chuyển lượt theo thứ tự ghế rồi sang phần thi chung', () => {
    const game = setup();
    const finishQuestion = () => {
      game.command({ type: 'next_question' });
      game.command({ type: 'skip_question' });
    };
    finishQuestion();
    finishQuestion();
    game.command({ type: 'next_question' });
    expect(game.view().turnSeat).toBe(2);
    game.command({ type: 'skip_question' });
    finishQuestion();
    game.command({ type: 'next_question' });
    expect(game.view().part).toBe('shared');
    expect(game.view().buzz).toEqual({ open: false, winnerSeat: null, attemptedSeats: [] });
  });

  function toShared(game: ReturnType<typeof setup>) {
    for (let i = 0; i < 4; i += 1) {
      game.command({ type: 'next_question' });
      game.command({ type: 'skip_question' });
    }
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    return game.view().question!.ref;
  }

  it('phần thi chung: người bấm chuông đầu tiên giành quyền, người sau không', () => {
    const game = setup();
    const ref = toShared(game);
    const first = game.apply({ type: 'buzz', seat: 2, questionRef: ref, receivedAt: game.now });
    const second = game.apply({ type: 'buzz', seat: 1, questionRef: ref, receivedAt: game.now });
    expect(first.reply).toEqual({ won: true });
    expect(second.reply).toEqual({ won: false });
    expect(second.changed).toBe(false);
    expect(game.view().question?.answeringSeat).toBe(2);
  });

  it('trả lời sai bị trừ điểm nhưng không âm, chuông mở lại cho người còn lại (7.1, BR-SCORE-03)', () => {
    const game = setup();
    const ref = toShared(game);
    game.apply({ type: 'buzz', seat: 2, questionRef: ref, receivedAt: game.now });
    game.command({ type: 'judge', seat: 2, correct: false });
    expect(game.score(2)).toBe(0);
    expect(game.effects.at(-1)).toEqual(
      expect.objectContaining({ kind: 'score', seat: 2, delta: 0, nominal: -5 }),
    );
    expect(game.view().question?.phase).toBe('buzzing');
    expect(
      codeOf(() => game.apply({ type: 'buzz', seat: 2, questionRef: ref, receivedAt: game.now })),
    ).toBe(MatchErrorCode.AlreadyAnswered);
    game.apply({ type: 'buzz', seat: 1, questionRef: ref, receivedAt: game.now });
    game.command({ type: 'judge', seat: 1, correct: true });
    expect(game.score(1)).toBe(10);
    expect(game.view().question?.phase).toBe('revealed');
  });

  it('cho phép điểm âm khi kịch bản bật', () => {
    const game = setup({ allowNegative: true });
    const ref = toShared(game);
    game.apply({ type: 'buzz', seat: 1, questionRef: ref, receivedAt: game.now });
    game.command({ type: 'judge', seat: 1, correct: false });
    expect(game.score(1)).toBe(-5);
  });

  it('afterWrong = next: trả lời sai thì kết thúc câu', () => {
    const base = rules();
    const game = setup({ rules: { ...base, shared: { ...base.shared, afterWrong: 'next' } } });
    const ref = toShared(game);
    game.apply({ type: 'buzz', seat: 1, questionRef: ref, receivedAt: game.now });
    game.command({ type: 'judge', seat: 1, correct: false });
    expect(game.view().question?.phase).toBe('revealed');
  });

  it('không ai bấm chuông: hết giờ thì công bố đáp án', () => {
    const game = setup();
    toShared(game);
    game.apply({ type: 'timer', timerId: game.state.timer!.id });
    expect(game.view('player', 1).question?.phase).toBe('revealed');
    expect(game.view('player', 1).question?.correctAnswer).not.toBeNull();
  });

  it('hủy câu lỗi: hoàn điểm và thay bằng câu dự phòng (8.5)', () => {
    const game = setup();
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    const ref = game.view().question!.ref;
    game.apply({
      type: 'answer',
      seat: 1,
      questionRef: ref,
      answer: { type: 'mcq', index: 2 },
      receivedAt: game.now,
    });
    game.command({ type: 'judge', seat: 1, correct: true });
    expect(game.score(1)).toBe(10);
    game.command({ type: 'void_question' });
    expect(game.score(1)).toBe(0);
    const view = game.view();
    expect(view.question?.ref).not.toBe(ref);
    expect(view.question?.phase).toBe('showing');
    expect(view.questionNo).toBe(1);
    expect(view.reserves).toBe(0);
    expect(
      game.effects.some((e) => e.kind === 'intervention' && e.action === 'void_question'),
    ).toBe(true);
  });

  it('chấm lại: điểm được tính lại và ghi nhật ký can thiệp (8.5, BR-GAME-07)', () => {
    const game = setup();
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    const ref = game.view().question!.ref;
    game.apply({
      type: 'answer',
      seat: 1,
      questionRef: ref,
      answer: { type: 'mcq', index: 0 },
      receivedAt: game.now,
    });
    game.command({ type: 'judge', seat: 1, correct: false });
    expect(game.score(1)).toBe(0);
    game.command({ type: 'regrade', questionRef: ref, seat: 1, correct: true });
    expect(game.score(1)).toBe(10);
    game.command({ type: 'regrade', questionRef: ref, seat: 1, correct: false });
    expect(game.score(1)).toBe(0);
    const scoreSum = game.effects
      .filter((e) => e.kind === 'score' && e.seat === 1)
      .reduce((sum, e) => sum + (e.kind === 'score' ? e.delta : 0), 0);
    expect(scoreSum).toBe(game.score(1));
    expect(
      game.effects.filter((e) => e.kind === 'intervention' && e.action === 'regrade'),
    ).toHaveLength(2);
  });

  it('điều chỉnh điểm thủ công cần lý do và ghi sổ điểm', () => {
    const game = setup();
    game.command({ type: 'adjust_score', seat: 2, delta: 15, reason: 'Thưởng tinh thần' });
    expect(game.score(2)).toBe(15);
    expect(game.state.players[1]!.roundScores).toEqual([15]);
    expect(game.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'score',
          reason: 'adjust',
          note: 'Thưởng tinh thần',
          actor: 'host',
        }),
        expect.objectContaining({ kind: 'intervention', action: 'adjust_score' }),
      ]),
    );
  });

  it('không gửi đáp án đúng/câu trả lời cho Player, Spectator trước khi công bố (BR-RT-01)', () => {
    const game = setup();
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    const ref = game.view().question!.ref;
    game.apply({
      type: 'answer',
      seat: 1,
      questionRef: ref,
      answer: { type: 'mcq', index: 1 },
      receivedAt: game.now,
    });
    expect(game.view('host').question?.correctAnswer).not.toBeNull();
    expect(game.view('host').question?.answers[0]?.answer).toEqual({ type: 'mcq', index: 1 });
    for (const [audience, seat] of [
      ['player', 2],
      ['spectator', null],
    ] as const) {
      const view = game.view(audience, seat);
      expect(view.question?.correctAnswer).toBeNull();
      expect(view.question?.explanation).toBeNull();
      expect(view.question?.answers[0]).toEqual(
        expect.objectContaining({ state: 'answered', answer: null, suggested: null }),
      );
      expect(view.history).toEqual([]);
    }
    // Người trả lời thấy đáp án của chính mình.
    expect(game.view('player', 1).question?.answers[0]?.answer).toEqual({ type: 'mcq', index: 1 });
    game.command({ type: 'judge', seat: 1, correct: false });
    expect(game.view('spectator').question?.correctAnswer).not.toBeNull();
  });

  it('trả lời bằng lời: không nhận đáp án trên thiết bị, Host chấm (DL-004)', () => {
    const game = setup({ rules: { ...rules(), answerMode: 'verbal' } });
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    const ref = game.view().question!.ref;
    expect(
      codeOf(() =>
        game.apply({
          type: 'answer',
          seat: 1,
          questionRef: ref,
          answer: { type: 'mcq', index: 2 },
          receivedAt: game.now,
        }),
      ),
    ).toBe(MatchErrorCode.VerbalAnswer);
    game.command({ type: 'judge', seat: 1, correct: true });
    expect(game.score(1)).toBe(10);
  });

  it('Host mất kết nối: trận tạm dừng; quá hạn thì kết thúc bất thường (4.5)', () => {
    const game = setup();
    game.apply({ type: 'presence', who: 'host', connected: false });
    expect(game.state.status).toBe('paused');
    expect(game.state.pause?.reason).toBe('host_disconnected');
    game.apply({ type: 'host_timeout' });
    expect(game.state.status).toBe('finished');
    expect(game.state.endReason).toBe('abnormal');
    expect(game.effects.at(-1)).toEqual({ kind: 'finished' });
  });

  it('Player đến lượt mất kết nối: tạm dừng theo cấu hình (8.5)', () => {
    const game = setup();
    game.command({ type: 'next_question' });
    game.apply({ type: 'presence', who: 2, connected: false });
    expect(game.state.status).toBe('running');
    game.apply({ type: 'presence', who: 1, connected: false });
    expect(game.state.status).toBe('paused');
    expect(game.state.pause?.reason).toBe('player_disconnected');
  });

  it('người chơi bị loại không được trả lời và bị bỏ qua lượt', () => {
    const game = setup();
    game.command({ type: 'eliminate_player', seat: 1 });
    game.command({ type: 'next_question' });
    expect(game.view().turnSeat).toBe(2);
  });

  it('hết câu thì vòng kết thúc; vòng cuối không chuyển vòng được', () => {
    const base = rules();
    const game = setup({
      rules: { ...base, shared: { ...base.shared, enabled: false } },
      questions: 4,
    });
    for (let i = 0; i < 4; i += 1) {
      game.command({ type: 'next_question' });
      game.command({ type: 'skip_question' });
    }
    expect(codeOf(() => game.command({ type: 'next_round' }))).toBe(MatchErrorCode.InvalidState);
    game.command({ type: 'next_question' });
    expect(game.view().part).toBe('done');
    expect(codeOf(() => game.command({ type: 'next_round' }))).toBe(MatchErrorCode.InvalidState);
    game.command({ type: 'end_match' });
    expect(game.state.status).toBe('finished');
    expect(codeOf(() => game.command({ type: 'pause' }))).toBe(MatchErrorCode.NoActiveMatch);
  });
});
