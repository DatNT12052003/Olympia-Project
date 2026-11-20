import {
  ACCELERATION_PRESETS,
  type AccelerationView,
  DEFAULT_SCRIPT_SETTINGS,
  FINISH_PRESETS,
  type FinishRules,
  type FinishView,
  type HostCommand,
  MatchErrorCode,
  OBSTACLE_PRESETS,
  type ObstacleRules,
  type ObstacleView,
  type PlayerAnswer,
  type PlayerChoice,
  type QuestionAnswer,
  type ScriptRound,
  type ScriptSettings,
  type TiebreakView,
  WARMUP_PRESETS,
  type WarmupView,
} from '@olympia/shared';
import { applyInput, buildMatchView, createInitialState, type EngineInput } from './match-engine';
import { obstaclePlugin } from '../rounds/obstacle.plugin';
import type { EngineEffect, MatchQuestion, MatchState, ScriptSnapshot } from './match-state';

const T0 = 1_800_000_000_000;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

const mcq: QuestionAnswer = { type: 'mcq', options: ['2', '3', '4', '6'], correctIndex: 2 };

function short(answer: string): QuestionAnswer {
  return { type: 'short_answer', answer, acceptedAnswers: [], ignoreDiacritics: true };
}

function q(
  i: number,
  answer: QuestionAnswer = mcq,
  defaultPoints: number | null = null,
): MatchQuestion {
  return {
    sourceQuestionId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    content: `Câu hỏi ${i}`,
    answer,
    explanation: null,
    mediaId: i === 0 ? '11111111-1111-4111-8111-111111111111' : null,
    defaultPoints,
  };
}

function setup(
  rounds: { round: ScriptRound; questions: MatchQuestion[] }[],
  options: { players?: number; mode?: 'manual' | 'auto'; settings?: Partial<ScriptSettings> } = {},
) {
  const snapshot: ScriptSnapshot = {
    scriptId: null,
    name: 'Test',
    settings: { ...DEFAULT_SCRIPT_SETTINGS, ...options.settings },
    rounds,
  };
  const names = ['Minh Anh', 'Bảo Ngọc', 'Thùy Linh', 'Đức Huy'];
  let clock = T0;
  let current: MatchState = createInitialState({
    matchId: 'm1',
    roomId: 'r1',
    hostKey: 'u:host',
    snapshot,
    players: names.slice(0, options.players ?? 3).map((displayName, i) => ({
      seat: i + 1,
      displayName,
      kind: 'user',
      key: `u:p${i + 1}`,
    })),
    mode: options.mode ?? 'manual',
    now: clock,
  });
  const effects: EngineEffect[] = [];
  const game = {
    get state() {
      return current;
    },
    get now() {
      return clock;
    },
    advance(ms: number) {
      clock += ms;
    },
    apply(input: EngineInput) {
      const result = applyInput(current, snapshot, input, clock);
      current = result.state;
      effects.push(...result.effects);
      return result;
    },
    command(command: HostCommand) {
      return game.apply({ type: 'command', command });
    },
    answer(seat: number, answer: PlayerAnswer, ref?: string) {
      const view = game.view() as { question: { ref: string } | null };
      return game.apply({
        type: 'answer',
        seat,
        questionRef: ref ?? view.question!.ref,
        answer,
        receivedAt: clock,
      });
    },
    buzz(seat: number) {
      const view = game.view() as { question: { ref: string } | null };
      return game.apply({ type: 'buzz', seat, questionRef: view.question!.ref, receivedAt: clock });
    },
    choose(seat: number, choice: PlayerChoice) {
      return game.apply({ type: 'choice', seat, choice });
    },
    /** Kích hoạt đồng hồ hiện tại (giả lập hết giờ). */
    fire() {
      const timer = current.timer!;
      clock = timer.endsAt!;
      return game.apply({ type: 'timer', timerId: timer.id });
    },
    full(audience: 'host' | 'player' | 'spectator' = 'host', seat: number | null = null) {
      return buildMatchView(current, {
        audience,
        seat,
        presence: new Map(),
        media: new Map(),
        now: clock,
      });
    },
    view(audience: 'host' | 'player' | 'spectator' = 'host', seat: number | null = null) {
      return game.full(audience, seat).round;
    },
    score(seat: number) {
      return current.players.find((p) => p.seat === seat)!.score;
    },
    effects,
  };
  return game;
}

// --- Vượt chướng ngại vật ---

function obstacleRound(patch: Partial<ObstacleRules> = {}): ScriptRound {
  return {
    type: 'obstacle',
    preset: 'olympia',
    source: null,
    rules: { ...OBSTACLE_PRESETS[0]!.rules, ...patch },
  };
}

function obstacleQuestions(): MatchQuestion[] {
  return [
    q(0, short('KHÔNG GIAN')),
    q(1, short('ĐỀU')),
    q(2, short('ĐƯỜNG CHÉO')),
    q(3, short('MẶT CẦU')),
    q(4, short('VUÔNG GÓC')),
    q(5, short('HÌNH HỌC')),
  ];
}

describe('Vòng Vượt chướng ngại vật', () => {
  const ov = (game: ReturnType<typeof setup>, ...args: Parameters<typeof game.view>) =>
    game.view(...args) as ObstacleView;

  it('bảng: số ký tự, ẩn đáp án với Player; Player đến lượt chọn hàng', () => {
    const game = setup([{ round: obstacleRound(), questions: obstacleQuestions() }]);
    const player = ov(game, 'player', 1);
    expect(player.phase).toBe('choosing');
    expect(player.turnSeat).toBe(1);
    expect(player.keyword).toMatchObject({ letters: 9, answer: null, points: 80 });
    expect(player.rows.map((r) => r.letters)).toEqual([3, 9, 6, 8, 7]);
    expect(player.rows.every((r) => r.answer === null && r.content === null)).toBe(true);
    expect(ov(game).keyword.answer).toBe('KHÔNG GIAN');

    expect(codeOf(() => game.choose(2, { type: 'row', row: 2 }))).toBe(MatchErrorCode.NotYourTurn);
    game.choose(1, { type: 'row', row: 2 });
    const view = ov(game, 'player', 2);
    expect(view.phase).toBe('row');
    expect(view.currentRow).toBe(2);
    expect(view.rows[1]).toMatchObject({ status: 'active', content: 'Câu hỏi 2' });
  });

  it('hàng ngang: cùng ghi đáp án (ghi đè), Host chấm rồi công bố, mở mảnh ảnh', () => {
    const game = setup([{ round: obstacleRound(), questions: obstacleQuestions() }]);
    game.choose(1, { type: 'row', row: 2 });
    game.command({ type: 'start_timer' });
    game.answer(1, { type: 'short_answer', text: 'duong cheo' });
    game.answer(2, { type: 'short_answer', text: 'canh ben' });
    game.answer(2, { type: 'short_answer', text: 'Đường chéo' });
    game.answer(3, { type: 'short_answer', text: 'mat phang' });
    // Chưa hết giờ: chưa công bố được bằng chấm từng người.
    expect(codeOf(() => game.command({ type: 'judge', seat: 3, correct: true }))).toBe(
      MatchErrorCode.InvalidState,
    );
    game.fire();
    // Host chấm Đúng cho cách diễn đạt tương đương của ghế 3.
    game.command({ type: 'judge', seat: 3, correct: true });
    game.command({ type: 'reveal' });
    expect([game.score(1), game.score(2), game.score(3)]).toEqual([10, 10, 10]);
    const view = ov(game, 'spectator');
    expect(view.rows[1]).toMatchObject({ status: 'solved', answer: 'ĐƯỜNG CHÉO', correctCount: 3 });
    expect(view.pieces).toEqual([false, true, false, false, false]);
    expect(view.keyword.points).toBe(80);
    // Lượt chọn chuyển sang ghế 2; hàng đã mở không chọn lại được.
    expect(view.turnSeat).toBe(2);
    expect(codeOf(() => game.choose(2, { type: 'row', row: 2 }))).toBe(MatchErrorCode.InvalidState);
  });

  it('đoán từ khóa: điểm theo số hàng đã mở; sai bị loại khỏi vòng; đúng kết thúc vòng', () => {
    const game = setup([{ round: obstacleRound(), questions: obstacleQuestions() }]);
    const keywordRef = ov(game).keyword.ref;
    game.choose(1, { type: 'row', row: 1 });
    game.command({ type: 'start_timer' });
    game.fire();
    game.command({ type: 'reveal' });
    game.choose(2, { type: 'row', row: 2 });
    // 2 hàng đã mở: 60 điểm.
    game.answer(3, { type: 'short_answer', text: 'hinh hoc' }, keywordRef);
    expect(ov(game).guesses[0]).toMatchObject({ seat: 3, points: 60, suggested: 'wrong' });
    expect(ov(game, 'player', 1).guesses[0]!.text).toBeNull();
    expect(
      codeOf(() => game.answer(3, { type: 'short_answer', text: 'khong gian' }, keywordRef)),
    ).toBe(MatchErrorCode.AlreadyAnswered);
    game.command({ type: 'judge_keyword', seat: 3, correct: false });
    expect(ov(game).outSeats).toEqual([3]);
    game.command({ type: 'start_timer' });
    expect(codeOf(() => game.answer(3, { type: 'short_answer', text: 'duong cheo' }))).toBe(
      MatchErrorCode.NotYourTurn,
    );

    game.answer(2, { type: 'short_answer', text: 'khong gian' }, keywordRef);
    game.command({ type: 'judge_keyword', seat: 2, correct: true });
    expect(game.score(2)).toBe(60);
    const view = ov(game, 'spectator');
    expect(view.phase).toBe('done');
    expect(view.keyword).toMatchObject({ answer: 'KHÔNG GIAN', solvedBy: 2, revealed: true });
    expect(view.pieces.every(Boolean)).toBe(true);
    expect(game.full().roundFinished).toBe(true);

    // Tóm tắt vòng (mục 14): hàng 1, 2 đã hiển thị; từ khóa ghi các lần đoán là giành quyền.
    const summary = obstaclePlugin.summary(game.state.round as never);
    expect(summary.map((s) => s.ref)).toEqual(['0.1', '0.2', keywordRef]);
    expect(summary[1]!.outcomes).toEqual([]);
    expect(summary[2]!.outcomes).toEqual([
      { seat: 2, result: 'correct', elapsedMs: null, buzzWon: true },
      { seat: 3, result: 'wrong', elapsedMs: null, buzzWon: true },
    ]);
  });

  it('mở hết hàng thì mở ô trung tâm (điểm CNV 10); không ai giải thì Host công bố từ khóa', () => {
    const game = setup([
      { round: obstacleRound({ rowSelection: 'order' }), questions: obstacleQuestions() },
    ]);
    for (let i = 0; i < 4; i += 1) {
      game.command({ type: 'next_question' });
      game.command({ type: 'skip_question' });
    }
    expect(ov(game).keyword.points).toBe(20);
    game.command({ type: 'next_question' });
    expect(ov(game).rows[4]!.status).toBe('active');
    expect(ov(game).keyword.points).toBe(10);
    game.command({ type: 'skip_question' });
    expect(ov(game).phase).toBe('keyword');
    game.command({ type: 'reveal_keyword' });
    expect(ov(game, 'player', 1).keyword.answer).toBe('KHÔNG GIAN');
    expect(game.full().roundFinished).toBe(true);
  });

  it('kiểm tra dạng câu hỏi: mọi câu của bảng phải là trả lời ngắn', () => {
    const questions = obstacleQuestions();
    expect(obstaclePlugin.validate!(obstacleRound(), questions)).toBeNull();
    questions[3] = q(3);
    expect(obstaclePlugin.validate!(obstacleRound(), questions)).toContain('Câu 4');
  });
});

// --- Tăng tốc ---

function accelerationRound(): ScriptRound {
  return {
    type: 'acceleration',
    preset: 'olympia',
    source: null,
    rules: { ...ACCELERATION_PRESETS[0]!.rules, questionCount: 2 },
  };
}

describe('Vòng Tăng tốc', () => {
  const av = (game: ReturnType<typeof setup>, ...args: Parameters<typeof game.view>) =>
    game.view(...args) as AccelerationView;

  it('điểm theo thứ tự đúng nhanh nhất; cùng mili-giây cùng mức cao hơn (BR-R3-02)', () => {
    const game = setup([{ round: accelerationRound(), questions: [q(1), q(2), q(3)] }], {
      players: 4,
    });
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    game.advance(2000);
    game.answer(2, { type: 'mcq', index: 2 });
    game.answer(4, { type: 'mcq', index: 2 });
    game.advance(500);
    game.answer(1, { type: 'mcq', index: 1 });
    expect(codeOf(() => game.answer(1, { type: 'mcq', index: 2 }))).toBe(
      MatchErrorCode.AlreadyAnswered,
    );
    game.advance(500);
    game.answer(3, { type: 'mcq', index: 2 });
    // Mọi người đã gửi: khóa sớm. Đúng: ghế 2, 4 (cùng mili-giây, cùng 40), ghế 3 (hạng 3: 20).
    expect(av(game).question!.phase).toBe('judging');
    // Player khác chỉ thấy trạng thái đã gửi, không thấy nội dung.
    expect(av(game, 'player', 1).question!.answers.find((a) => a.seat === 2)).toMatchObject({
      state: 'answered',
      answer: null,
    });
    game.command({ type: 'reveal' });
    expect([1, 2, 3, 4].map((s) => game.score(s))).toEqual([0, 40, 20, 40]);
    const view = av(game, 'spectator');
    expect(view.question!.answers.find((a) => a.seat === 3)).toMatchObject({
      state: 'correct',
      elapsedMs: 3000,
      points: 20,
    });
  });

  it('chấm lại tính lại thứ hạng của cả câu', () => {
    const game = setup([{ round: accelerationRound(), questions: [q(1), q(2)] }]);
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    game.advance(1000);
    game.answer(1, { type: 'mcq', index: 0 });
    game.advance(1000);
    game.answer(2, { type: 'mcq', index: 2 });
    game.fire();
    game.command({ type: 'reveal' });
    expect([game.score(1), game.score(2)]).toEqual([0, 40]);
    const ref = av(game).question!.ref;
    game.command({ type: 'regrade', questionRef: ref, seat: 1, correct: true });
    expect([game.score(1), game.score(2)]).toEqual([40, 30]);
  });
});

// --- Về đích ---

function finishRound(patch: Partial<FinishRules> = {}): ScriptRound {
  return {
    type: 'finish',
    preset: 'olympia',
    source: null,
    rules: { ...FINISH_PRESETS[0]!.rules, questionsPerPlayer: 2, ...patch },
  };
}

function finishQuestions(): MatchQuestion[] {
  return [q(1, mcq, 20), q(2, mcq, 20), q(3, mcq, 30), q(4, mcq, 30), q(5), q(6), q(7)];
}

describe('Vòng Về đích', () => {
  const fv = (game: ReturnType<typeof setup>, ...args: Parameters<typeof game.view>) =>
    game.view(...args) as FinishView;

  it('điểm thấp thi trước; chọn gói; Ngôi sao hy vọng đúng ×2', () => {
    const game = setup([
      { round: accelerationRound(), questions: [q(1), q(2)] },
      { round: finishRound(), questions: finishQuestions() },
    ]);
    // Vòng 1: ghế 1 được 40, ghế 3 được 30.
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    game.answer(1, { type: 'mcq', index: 2 });
    game.advance(10);
    game.answer(3, { type: 'mcq', index: 2 });
    game.answer(2, { type: 'mcq', index: 0 });
    game.command({ type: 'reveal' });
    game.command({ type: 'next_question' });
    game.command({ type: 'skip_question' });
    game.command({ type: 'next_question' });
    game.command({ type: 'next_round' });

    const view = fv(game);
    expect(view.order).toEqual([2, 3, 1]);
    expect(view).toMatchObject({ phase: 'picking', turnSeat: 2 });
    expect(codeOf(() => game.choose(1, { type: 'pack', levels: [20, 30], star: null }))).toBe(
      MatchErrorCode.NotYourTurn,
    );
    game.choose(2, { type: 'pack', levels: [30, 20], star: 0 });
    game.command({ type: 'next_question' });
    // Câu 30 điểm lấy theo "Điểm mặc định".
    expect(fv(game).question!.content).toBe('Câu hỏi 3');
    expect(fv(game).pack![0]).toMatchObject({ points: 30, star: true, state: 'current' });
    game.command({ type: 'start_timer' });
    game.answer(2, { type: 'mcq', index: 2 });
    game.command({ type: 'judge', seat: 2, correct: true });
    expect(game.score(2)).toBe(60);
  });

  it('sai thì mở giành quyền: đúng lấy điểm từ Player chính; sai bị trừ một nửa', () => {
    const game = setup([{ round: finishRound(), questions: finishQuestions() }], {
      settings: { allowNegativeScore: true },
    });
    game.choose(1, { type: 'pack', levels: [20, 30], star: 1 });
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    game.fire();
    game.command({ type: 'judge', seat: 1, correct: false });
    expect(fv(game).steal).toMatchObject({ open: true, points: 20, penalty: 10 });
    expect(codeOf(() => game.buzz(1))).toBe(MatchErrorCode.InvalidState);
    expect(game.buzz(3).reply).toEqual({ won: true });
    expect(game.buzz(2).reply).toEqual({ won: false });
    game.answer(3, { type: 'mcq', index: 2 });
    game.command({ type: 'judge', seat: 3, correct: true });
    expect([game.score(1), game.score(3)]).toEqual([-20, 20]);
    expect(fv(game).pack![0]!.state).toBe('stolen');

    // Câu 2 (30 điểm, Ngôi sao hy vọng): sai trừ 30, người giành quyền sai trừ 15.
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    game.answer(1, { type: 'mcq', index: 0 });
    game.command({ type: 'judge', seat: 1, correct: false });
    game.buzz(2);
    game.command({ type: 'judge', seat: 2, correct: false });
    expect([game.score(1), game.score(2)]).toEqual([-50, -15]);
    // Hết gói: sang lượt ghế 2.
    game.command({ type: 'next_question' });
    expect(fv(game)).toMatchObject({ phase: 'picking', turnSeat: 2 });

    // Tóm tắt vòng: Player chính và người giành quyền đều có kết quả; chuông tính là giành quyền.
    game.command({ type: 'end_match' });
    const summary = game.effects.find((e) => e.kind === 'round_summary');
    expect(summary).toBeDefined();
    const items = (summary as Extract<EngineEffect, { kind: 'round_summary' }>).items;
    expect(items.map((i) => i.outcomes.map((o) => [o.seat, o.result, o.buzzWon]))).toEqual([
      [
        [1, 'skipped', false],
        [3, 'correct', true],
      ],
      [
        [1, 'wrong', false],
        [2, 'wrong', true],
      ],
    ]);
  });

  it('Ngôi sao hy vọng chỉ đổi được trước khi câu hiển thị', () => {
    const game = setup([{ round: finishRound(), questions: finishQuestions() }]);
    game.choose(1, { type: 'pack', levels: [20, 20], star: null });
    game.command({ type: 'next_question' });
    expect(codeOf(() => game.choose(1, { type: 'star', star: 0 }))).toBeDefined();
    game.choose(1, { type: 'star', star: 1 });
    expect(fv(game).pack!.map((i) => i.star)).toEqual([false, true]);
  });
});

// --- Chế độ tự động và câu hỏi phụ ---

function warmupRound(): ScriptRound {
  const base = structuredClone(WARMUP_PRESETS[0]!.rules);
  return {
    type: 'warmup',
    preset: 'olympia',
    source: null,
    rules: {
      ...base,
      individual: { ...base.individual, questionsPerPlayer: 1 },
      shared: { ...base.shared, enabled: false },
    },
  };
}

describe('Chế độ tự động (8.4)', () => {
  it('tự hiển thị câu, tính giờ, chấm câu xác định, chuyển câu và chuyển vòng', () => {
    const game = setup(
      [
        { round: warmupRound(), questions: [q(1), q(2)] },
        { round: accelerationRound(), questions: [q(3), q(4)] },
      ],
      { players: 2, mode: 'auto' },
    );
    let view = game.view() as WarmupView;
    expect(view.question?.phase).toBe('showing');
    expect(game.state.timer?.purpose).toBe('auto');
    game.fire(); // hết thời gian đọc
    expect((game.view() as WarmupView).question?.phase).toBe('answering');
    game.answer(1, { type: 'mcq', index: 2 });
    // Đáp án xác định: chấm ngay, không chờ Host.
    expect(game.score(1)).toBe(10);
    view = game.view() as WarmupView;
    expect(view.question?.phase).toBe('revealed');
    game.fire(); // hết thời gian xem đáp án → câu của ghế 2
    expect((game.view() as WarmupView).turnSeat).toBe(2);
    game.fire();
    game.fire(); // ghế 2 hết giờ không trả lời → bỏ qua
    expect((game.view() as WarmupView).question?.answers[0]?.state).toBe('skipped');
    game.fire(); // hết vòng → nghỉ giữa vòng
    expect(game.full().roundFinished).toBe(true);
    expect(game.state.timer?.purpose).toBe('break');
    game.fire();
    expect(game.state.roundIndex).toBe(1);
    expect((game.view() as AccelerationView).question?.phase).toBe('showing');
  });

  it('trả lời ngắn không khớp: chờ Host xác nhận, không tự chuyển câu (BR-GAME-05)', () => {
    const game = setup([{ round: warmupRound(), questions: [q(1, short('Hà Nội')), q(2)] }], {
      players: 2,
      mode: 'auto',
    });
    game.fire();
    game.answer(1, { type: 'short_answer', text: 'Huế' });
    expect(game.full().awaitingHost).toBe(true);
    expect(game.state.timer).toBeNull();
    game.command({ type: 'judge', seat: 1, correct: false });
    expect(game.full().awaitingHost).toBe(false);
    expect(game.state.timer?.purpose).toBe('auto');
  });

  it('Host tạm dừng giữ nguyên thời gian còn lại của bước tự động', () => {
    const game = setup([{ round: warmupRound(), questions: [q(1), q(2)] }], {
      players: 2,
      mode: 'auto',
    });
    game.advance(1000);
    game.command({ type: 'pause' });
    expect(game.state.timer?.remainingMs).toBe(2000);
    game.command({ type: 'resume' });
    expect(game.state.timer?.purpose).toBe('auto');
  });
});

describe('Hòa điểm và câu hỏi phụ (9.3)', () => {
  function tiedGame(settings: Partial<ScriptSettings> = {}) {
    const game = setup([{ round: warmupRound(), questions: [q(1), q(2), q(3), q(4)] }], {
      players: 2,
      settings,
    });
    for (const seat of [1, 2]) {
      game.command({ type: 'next_question' });
      game.command({ type: 'start_timer' });
      game.answer(seat, { type: 'mcq', index: 2 });
      game.command({ type: 'judge', seat, correct: true });
    }
    game.command({ type: 'next_question' });
    return game;
  }

  it('dẫn đầu hòa điểm: thi câu hỏi phụ bằng câu dư, người đúng đầu tiên thắng', () => {
    const game = tiedGame();
    expect(game.full().nextStep).toBe('tiebreak');
    game.command({ type: 'next_round' });
    expect(game.full().rounds.at(-1)).toEqual({ type: 'tiebreak', title: 'Câu hỏi phụ' });
    game.command({ type: 'next_question' });
    game.command({ type: 'start_timer' });
    game.buzz(2);
    game.answer(2, { type: 'mcq', index: 0 });
    game.command({ type: 'judge', seat: 2, correct: false });
    // Mở chuông lại cho người còn lại.
    expect((game.view() as TiebreakView).buzz?.open).toBe(true);
    game.buzz(1);
    game.command({ type: 'judge', seat: 1, correct: true });
    expect((game.view() as TiebreakView).winnerSeat).toBe(1);
    // Câu hỏi phụ không cộng điểm.
    expect([game.score(1), game.score(2)]).toEqual([10, 10]);
    game.command({ type: 'next_round' });
    expect(game.state.status).toBe('finished');
    expect(game.state.tiebreakWinner).toBe(1);
    expect(game.state.endReason).toBe('completed');
  });

  it('tắt câu hỏi phụ: đồng hạng, kết thúc trận', () => {
    const game = tiedGame({ tiebreakEnabled: false });
    expect(game.full().nextStep).toBe('finish');
  });
});
