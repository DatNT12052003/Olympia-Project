# Olympia Online

Nền tảng tổ chức cuộc thi kiến thức trực tuyến theo format gameshow: nhiều phòng thi, bốn vòng thi cấu hình được, bảng điểm và trạng thái trận đồng bộ theo thời gian thực, video/voice giữa người chơi.

## Tài liệu

| Tài liệu                                             | Nội dung                                   |
| ---------------------------------------------------- | ------------------------------------------ |
| [Mô tả dự án](docs/mo-ta-du-an-olympia.md)           | Tổng quan sản phẩm                         |
| [Đặc tả nghiệp vụ](docs/dac-ta-nghiep-vu-olympia.md) | Quy tắc nghiệp vụ (`BR-*`), luồng, vai trò |
| [Công nghệ sử dụng](docs/cong-nghe-su-dung.md)       | Stack và lý do lựa chọn                    |
| [Decision log](docs/decision-log.md)                 | Các quyết định (`DL-*`) và trạng thái      |
| [Kế hoạch triển khai](docs/ke-hoach-trien-khai.md)   | Giai đoạn P0–P8, mốc, rủi ro               |

## Cấu trúc

```
apps/api          Backend: Express + TypeScript, TypeORM (PostgreSQL), Redis, Socket.IO
apps/web          Frontend: React + Vite + Tailwind CSS
packages/shared   Schema/kiểu dữ liệu dùng chung (Zod), hợp đồng sự kiện realtime
docs              Tài liệu dự án
```

## Yêu cầu

- Node.js 24 (xem `.nvmrc`)
- Docker Desktop (hoặc Docker Engine + Compose)

## Bắt đầu

```bash
npm install
npm run services:up                       # PostgreSQL, Redis, LiveKit, Mailpit
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run dev                               # API: http://localhost:3000 · Web: http://localhost:5173
```

Các dịch vụ phụ thuộc chỉ mở trên `localhost`, dùng cổng riêng để không trùng dự án khác:

| Dịch vụ    | Cổng máy                          | Ghi chú                                    |
| ---------- | --------------------------------- | ------------------------------------------ |
| PostgreSQL | 5440                              | user/password/db: `olympia`                |
| Redis      | 6380                              |                                            |
| LiveKit    | 7880 (+ 7881 TCP, 7882 UDP)       | chế độ dev, key `devkey` / secret `secret` |
| Mailpit    | 1026 (SMTP), 8026 (giao diện web) | http://localhost:8026                      |

Đổi cổng bằng biến môi trường `POSTGRES_PORT`, `REDIS_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT` (hoặc file `.env` ở thư mục gốc), đồng thời sửa `apps/api/.env`.

## Lệnh thường dùng

| Lệnh                    | Tác dụng                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| `npm run dev`           | Chạy API và web ở chế độ phát triển                                        |
| `npm run lint`          | ESLint toàn repo                                                           |
| `npm run format`        | Định dạng code bằng Prettier                                               |
| `npm run typecheck`     | Kiểm tra kiểu TypeScript mọi workspace                                     |
| `npm test`              | Unit/integration test (Jest cho API, Vitest cho web)                       |
| `npm run test:e2e`      | E2E Playwright (lần đầu: `cd apps/web && npx playwright install chromium`) |
| `npm run build`         | Build shared → api → web                                                   |
| `npm run db:migrate`    | Áp dụng migration database                                                 |
| `npm run services:down` | Dừng các dịch vụ Docker                                                    |

Kiểm tra API: `GET /api/health/live` (tiến trình còn chạy) và `GET /api/health/ready` (kết nối PostgreSQL, Redis).
