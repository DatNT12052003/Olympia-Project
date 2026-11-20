import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test';

/**
 * Trận đầy đủ 4 vòng với backend thật (P8, tiêu chí nghiệm thu mục 5): Host đăng nhập, hai
 * người chơi khách vào phòng từ hai trình duyệt riêng, trận chạy ở chế độ tự động qua Khởi
 * động → Vượt chướng ngại vật → Tăng tốc → Về đích, rồi xem trang tổng kết.
 *
 * Dữ liệu (câu hỏi, bộ đề, kịch bản, phòng) tạo qua REST bằng tài khoản Host do
 * `npm run e2e:server -w @olympia/api` tạo sẵn.
 */

const HOST = { email: 'host@e2e.olympia.test', password: 'E2e-Host-Pass-123' };
const CSRF = { 'x-olympia-csrf': '1' };

async function hostToken(api: APIRequestContext): Promise<string> {
  const res = await api.post('/api/auth/login', { headers: CSRF, data: HOST });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/** Tạo câu hỏi, bộ đề, kịch bản 4 vòng thu gọn và phòng tự động; trả id và mã phòng. */
async function seedMatch(api: APIRequestContext, token: string, tag: string) {
  const auth = { Authorization: `Bearer ${token}` };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await api.post(`/api${path}`, { headers: auth, data });
    expect(res.ok(), `${path}: ${await res.text()}`).toBe(true);
    return (await res.json()) as T;
  }
  // Đóng phòng còn mở từ lần chạy trước để không vượt giới hạn phòng mở của Host (BR-ROOM-03).
  const mine = await api.get('/api/rooms?status=open', { headers: auth });
  for (const old of ((await mine.json()) as { items: { id: string }[] }).items) {
    await api.post(`/api/rooms/${old.id}/close`, { headers: auth });
  }

  async function question(content: string, answer: object) {
    return (await post<{ question: { id: string } }>('/questions', { content, answer })).question
      .id;
  }
  async function set(round: string, questionIds: string[]) {
    const { set } = await post<{ set: { id: string } }>('/question-sets', {
      name: `E2E ${tag} ${round}`,
    });
    await post(`/question-sets/${set.id}/items`, { questionIds, round });
    return { kind: 'set', setId: set.id };
  }
  const yes = { type: 'true_false', correct: true };
  const short = (text: string) => ({
    type: 'short_answer',
    answer: text,
    acceptedAnswers: [],
    ignoreDiacritics: true,
  });

  const warmup = await set('warmup', [
    await question(`[${tag}] Thủ đô của Việt Nam là Hà Nội?`, yes),
    await question(`[${tag}] Nước sôi ở 100°C (áp suất thường)?`, yes),
    await question(`[${tag}] Trái Đất quay quanh Mặt Trời?`, yes),
  ]);
  const obstacle = await set('obstacle', [
    await question(`[${tag}] Từ khóa`, short('OLYMPIA')),
    await question(`[${tag}] Hàng 1: Thủ đô nước Pháp?`, short('PARIS')),
  ]);
  const acceleration = await set('acceleration', [await question(`[${tag}] 2 + 2 = 4?`, yes)]);
  const finish = await set('finish', [
    await question(`[${tag}] Về đích 1: 3 × 3 = 9?`, yes),
    await question(`[${tag}] Về đích 2: 10 − 4 = 6?`, yes),
  ]);

  const { script } = await post<{ script: { id: string } }>('/scripts', {
    name: `Kịch bản E2E ${tag}`,
    settings: {
      breakSeconds: 0,
      soundEffects: true,
      allowNegativeScore: false,
      onTurnDisconnect: 'skip',
      autoReadSeconds: 0,
      autoRevealSeconds: 1,
      tiebreakEnabled: false,
      revealAnswersAfterMatch: true,
    },
    rounds: [
      {
        type: 'warmup',
        preset: 'e2e',
        source: warmup,
        rules: {
          answerMode: 'device',
          individual: { enabled: true, questionsPerPlayer: 1, timeSeconds: 10, pointsCorrect: 10 },
          shared: {
            enabled: true,
            questionCount: 1,
            buzzSeconds: 2,
            answerSeconds: 3,
            pointsCorrect: 10,
            pointsWrong: 5,
            afterWrong: 'next',
          },
        },
      },
      {
        type: 'obstacle',
        preset: 'e2e',
        source: obstacle,
        rules: {
          rowCount: 1,
          centerEnabled: false,
          rowSelection: 'order',
          rowSeconds: 3,
          rowPoints: 10,
          keywordStartPoints: 40,
          keywordStep: 10,
          keywordCenterPoints: 10,
        },
      },
      {
        type: 'acceleration',
        preset: 'e2e',
        source: acceleration,
        rules: { questionCount: 1, timeSeconds: 3, rankPoints: [40, 30], allowResubmit: false },
      },
      {
        type: 'finish',
        preset: 'e2e',
        source: finish,
        rules: {
          answerMode: 'device',
          order: 'seat',
          questionsPerPlayer: 1,
          levels: [{ points: 20, seconds: 3 }],
          starEnabled: false,
          steal: {
            enabled: false,
            buzzSeconds: 2,
            answerSeconds: 3,
            takeFromMain: false,
            wrongPenaltyPercent: 0,
          },
        },
      },
    ],
  });

  const { room } = await post<{ room: { id: string; code: string } }>('/rooms', {
    name: `Phòng E2E ${tag}`,
    maxPlayers: 2,
    visibility: 'private',
    autoApprove: true,
    controlMode: 'auto',
    scriptId: script.id,
    open: true,
  });
  return room;
}

/** Khung màn hình (mục 16 Responsive): người chơi dùng điện thoại, khán giả dùng tablet. */
const PHONE = { width: 412, height: 915 };
const TABLET = { width: 820, height: 1180 };

async function joinRoomAs(
  browser: Browser,
  code: string,
  name: string,
  role: 'Người chơi' | 'Khán giả',
  viewport: { width: number; height: number },
): Promise<Page> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`/vao-phong/${code}`);
  await page.getByLabel('Tên hiển thị').fill(name);
  await page.getByRole('radio', { name: new RegExp(role) }).check();
  await page.getByRole('button', { name: 'Vào phòng' }).click();
  if (role === 'Người chơi') {
    await expect(page.getByRole('button', { name: 'Tôi đã sẵn sàng' })).toBeVisible();
  } else {
    await expect(page.getByText(/vai trò khán giả/)).toBeVisible();
  }
  return page;
}

/** Không có cuộn ngang trên khung màn hình đang dùng. */
async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `Tràn ngang ở ${where}`).toBeLessThanOrEqual(0);
}

test('trận đầy đủ 4 vòng ở chế độ tự động: Host, 2 người chơi, tổng kết', async ({
  browser,
  page: hostPage,
  request,
}, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const token = await hostToken(request);
  const room = await seedMatch(request, token, tag);

  // Host đăng nhập qua giao diện rồi mở sảnh chờ.
  await hostPage.goto('/dang-nhap');
  await hostPage.getByLabel('Email').fill(HOST.email);
  await hostPage.getByLabel('Mật khẩu').fill(HOST.password);
  await hostPage.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(hostPage).not.toHaveURL(/dang-nhap/);
  await hostPage.goto(`/phong/${room.id}`);
  await expect(hostPage.getByText(room.code)).toBeVisible();

  const minhAnh = await joinRoomAs(browser, room.code, 'Minh Anh', 'Người chơi', PHONE);
  const baoNgoc = await joinRoomAs(browser, room.code, 'Bảo Ngọc', 'Người chơi', PHONE);
  const spectator = await joinRoomAs(browser, room.code, 'Lớp 12A1', 'Khán giả', TABLET);
  await expect(hostPage.getByRole('article', { name: 'Vị trí 1: Minh Anh' })).toBeVisible();
  await expect(hostPage.getByRole('article', { name: 'Vị trí 2: Bảo Ngọc' })).toBeVisible();
  await expectNoHorizontalOverflow(minhAnh, 'sảnh chờ (điện thoại)');
  await expectNoHorizontalOverflow(spectator, 'sảnh chờ (tablet)');

  await hostPage.getByLabel('Bắt đầu không cần chờ tất cả Sẵn sàng').check();
  await hostPage.getByRole('button', { name: 'Bắt đầu trận' }).click();

  // Khởi động: Minh Anh trả lời đúng câu của mình; Bảo Ngọc để hết giờ.
  await minhAnh.getByRole('button', { name: /^Đúng/ }).click({ timeout: 30_000 });
  await expectNoHorizontalOverflow(minhAnh, 'màn trả lời (điện thoại)');
  await expectNoHorizontalOverflow(spectator, 'màn khán giả trong trận (tablet)');
  await expectNoHorizontalOverflow(hostPage, 'màn điều khiển của Host');
  await minhAnh.getByRole('button', { name: /^Gửi đáp án/ }).click();

  // Đáp án đúng không có trong dữ liệu gửi tới người chơi trước khi công bố (BR-RT-01) đã có
  // test API; ở đây kiểm tra trận chạy hết các vòng và kết quả nhất quán ở mọi màn hình.
  const finished = { timeout: 200_000 };
  await expect(hostPage.getByRole('dialog', { name: 'Trận đấu kết thúc' })).toBeVisible(finished);
  for (const viewer of [minhAnh, baoNgoc, spectator]) {
    const dialog = viewer.getByRole('dialog', { name: 'Trận đấu kết thúc' });
    await expect(dialog).toBeVisible(finished);
    await expect(dialog).toContainText('Người chiến thắng: Minh Anh');
  }
  await expectNoHorizontalOverflow(minhAnh, 'kết quả trận (điện thoại)');

  // Trang tổng kết (9.4).
  await hostPage.getByRole('link', { name: 'Xem tổng kết' }).click();
  await expect(hostPage).toHaveURL(/\/tran\//);
  await expect(hostPage.getByRole('heading', { name: 'Minh Anh về đích đầu tiên' })).toBeVisible();
  await hostPage.getByRole('button', { name: 'Xem đáp án và giải thích' }).click();
  // Câu đã dùng ở cả 4 vòng được lưu lại (DL-047).
  for (const text of ['Thủ đô nước Pháp?', '2 + 2 = 4?', 'Về đích']) {
    await expect(
      hostPage.getByText(new RegExp(`\\[${tag}\\].*${text.replace(/[+?]/g, '\\$&')}`)).first(),
    ).toBeVisible();
  }
});
