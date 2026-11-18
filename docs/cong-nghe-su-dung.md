# CÔNG NGHỆ SỬ DỤNG – OLYMPIA ONLINE

> Tài liệu liệt kê công nghệ dự kiến cho Olympia Online, dựa trên [đặc tả nghiệp vụ](dac-ta-nghiep-vu-olympia.md) và các skill dự án trong `.claude/skills/`.
>
> **Trạng thái:**
>
> - **Đã chốt**: đã xác định trong CLAUDE.md / skill dự án.
> - **Đề xuất**: cần review trước khi khởi tạo dự án.
>
> Phiên bản cụ thể của từng thư viện sẽ được chốt trong `package.json` khi khởi tạo; dùng bản ổn định/LTS mới nhất tại thời điểm đó.

---

## 1. Tổng quan kiến trúc

```
Trình duyệt (React SPA)
   │  REST (HTTPS)          │  Realtime (WebSocket)     │  Audio/Video (WebRTC)
   ▼                        ▼                           ▼
┌──────────────────────── apps/api (Node.js) ───────────────┐   ┌──────────────┐
│ Auth │ Room Management │ Question Bank │ Game Engine │ RT │   │ SFU (LiveKit)│
└──────────────────────────────────────────────────────────┘   └──────────────┘
   │                 │                         │
PostgreSQL        Redis                 Object Storage (S3)
```

- **Monorepo** gồm `apps/api`, `apps/web` và gói dùng chung `packages/shared` (kiểu dữ liệu, schema validation, hợp đồng sự kiện realtime).
- Backend là **modular monolith**: tách module Game Engine, Room Management, Question Bank, Realtime Communication (theo mục 16 đặc tả), triển khai chung một ứng dụng ở phiên bản đầu, có thể tách service sau.
- Audio/video đi qua **SFU riêng**, độc lập với kênh trạng thái trận (BR-AV-02).

---

## 2. Monorepo và công cụ chung

| Hạng mục            | Công nghệ                          | Trạng thái | Lý do / ghi chú                                                     |
| ------------------- | ---------------------------------- | :--------: | ------------------------------------------------------------------- |
| Ngôn ngữ            | TypeScript (strict)                |  Đã chốt   | Dùng chung cho backend, frontend và gói shared.                     |
| Runtime             | Node.js LTS                        |  Đã chốt   |                                                                     |
| Quản lý package     | npm workspaces                     |  Đã chốt   | Có sẵn cùng Node.js, không cần cài thêm công cụ.                    |
| Gói dùng chung      | `packages/shared`                  |  Đã chốt   | Chia sẻ type, schema Zod, tên/payload sự kiện realtime giữa api và web. |
| Lint / format       | ESLint + Prettier                  |  Đề xuất   |                                                                     |
| Git hooks           | Husky + lint-staged                |  Đề xuất   | Chạy lint/format trước khi commit. Có thể bỏ nếu CI đủ.             |

---

## 3. Backend – `apps/api`

| Hạng mục              | Công nghệ                                       | Trạng thái | Lý do / ghi chú                                                                                         |
| --------------------- | ----------------------------------------------- | :--------: | ------------------------------------------------------------------------------------------------------- |
| Web framework         | Express                                         |  Đã chốt   | Phân lớp routes → controllers → services/use cases → repositories.                                      |
| Cơ sở dữ liệu         | PostgreSQL                                      |  Đã chốt   | Dữ liệu quan hệ: tài khoản, phòng, câu hỏi, kịch bản, kết quả, nhật ký.                                 |
| ORM / migration       | TypeORM                                         |  Đã chốt   | Dùng migration, không dùng `synchronize` ngoài môi trường dev.                                          |
| Cache / trạng thái nóng | Redis                                         |  Đã chốt   | Trạng thái trận đang diễn ra, rate limit, phiên khách, pub/sub giữa các instance.                       |
| Validation DTO        | Zod                                             |  Đã chốt   | Schema dùng chung với frontend qua `packages/shared`. Thay thế: class-validator.                       |
| Realtime              | Socket.IO + `@socket.io/redis-adapter`          |  Đã chốt   | Room/namespace, tự kết nối lại, ack (chống gửi trùng BR-GAME-03), mở rộng ngang qua Redis. Thay thế: `ws` thuần. |
| Xác thực              | JWT access token ngắn hạn + refresh token xoay vòng trong cookie `HttpOnly`, `Secure`, `SameSite` |  Đề xuất   | Thu hồi được phiên khi khóa tài khoản (BR-AUTH-02). Refresh token lưu hash trong DB.                   |
| Băm mật khẩu          | Argon2id                                        |  Đề xuất   | Theo skill security-review. Thay thế: bcrypt.                                                           |
| Rate limit            | `rate-limiter-flexible` (Redis)                 |  Đề xuất   | Đăng nhập sai (BR-AUTH-03), reaction (BR-SPEC-02), API chung.                                           |
| Bảo mật HTTP          | Helmet, CORS giới hạn origin                    |  Đề xuất   |                                                                                                         |
| Lưu trữ media         | S3-compatible + presigned URL (dịch vụ dev: xem T8) |  Đề xuất   | Upload trực tiếp từ trình duyệt, giới hạn dung lượng theo BR-QB-02; phục vụ qua CDN.                    |
| Email                 | Nodemailer + SMTP (Mailpit khi dev)             |  Đề xuất   | Xác minh email, quên mật khẩu.                                                                          |
| Hàng đợi / job        | BullMQ (Redis)                                  |  Đề xuất   | Gửi email, đóng phòng không hoạt động (BR-ROOM-02), xóa dữ liệu (BR-DATA-03). Đồng hồ câu hỏi **không** chạy qua queue. |
| Logging               | Pino                                            |  Đề xuất   | Log JSON có cấu trúc, không ghi token/mật khẩu.                                                         |
| Tài liệu API          | OpenAPI (sinh từ schema Zod)                    |  Đề xuất   |                                                                                                         |
| Import Excel/CSV      | SheetJS hoặc `csv-parse`                        |  Đề xuất   | Giai đoạn sau (mục 5.3 đặc tả).                                                                         |

### 3.1. Game Engine và đồng hồ phía server

- Mỗi trận đang diễn ra do **một instance sở hữu** (khóa phân phối trong Redis); instance đó chạy đồng hồ và xử lý tuần tự các hành động của trận để đảm bảo thứ tự và không ghi đè điểm.
- Trạng thái trận được ghi vào Redis sau mỗi chuyển trạng thái (kèm số phiên bản – BR-RT-03) và lưu bền vào PostgreSQL ở các mốc quan trọng, để instance khác tiếp quản khi instance cũ lỗi (khôi phục ≤ 30 giây).
- Luật vòng thi là các module plugin cài đặt chung một interface (BR-ROUND-01).

---

## 4. Frontend – `apps/web`

| Hạng mục              | Công nghệ                         | Trạng thái | Lý do / ghi chú                                                     |
| --------------------- | --------------------------------- | :--------: | ------------------------------------------------------------------- |
| UI library            | React (function components + hooks) | Đã chốt  |                                                                     |
| Build tool            | Vite                              |  Đã chốt   |                                                                     |
| Styling               | Tailwind CSS                      |  Đã chốt   | Responsive desktop/tablet/điện thoại.                               |
| Routing               | React Router                      |  Đề xuất   |                                                                     |
| Dữ liệu từ server (REST) | TanStack Query                 |  Đề xuất   | Cache, loading/error state cho các trang quản lý.                   |
| State trận realtime   | Zustand                           |  Đề xuất   | Store nhẹ, nhận snapshot/patch từ socket, bỏ qua bản cũ theo version. |
| Form                  | React Hook Form + Zod             |  Đề xuất   | Dùng lại schema từ `packages/shared`.                               |
| Realtime client       | `socket.io-client`                |  Đã chốt   | Theo lựa chọn Socket.IO ở backend.                                  |
| Video client          | `livekit-client` + `@livekit/components-react` |  Đề xuất   | Theo lựa chọn LiveKit (mục 5).                     |
| Hiệu ứng / âm thanh   | Framer Motion, Howler.js          |  Đề xuất   | Hiệu ứng điểm, công bố kết quả, âm thanh đúng/sai.                  |
| Icon                  | Lucide                            |  Đề xuất   |                                                                     |

---

## 5. Video call và voice chat

| Hạng mục    | Công nghệ                         | Trạng thái | Lý do / ghi chú                                                                                                   |
| ----------- | --------------------------------- | :--------: | ----------------------------------------------------------------------------------------------------------------- |
| SFU         | LiveKit (tự host, mã nguồn mở)    |  Đề xuất   | Token cấp quyền theo vai trò: Spectator `canPublish = false` (BR-AV-04); server tắt mic/cam của Player qua API (mục 11.2); tự điều chỉnh chất lượng theo băng thông. Thay thế: mediasoup (linh hoạt hơn nhưng tự xây nhiều hơn), Jitsi. |
| TURN        | TURN tích hợp của LiveKit hoặc coturn |  Đề xuất   | Cần cho người dùng sau NAT/firewall chặt (mạng trường học, 4G).                                                   |

- Backend cấp token LiveKit sau khi kiểm tra quyền trong phòng; frontend không tự cấp quyền.
- Không bật tính năng ghi hình (BR-AV-03).

---

## 6. Kiểm thử

| Loại                | Công nghệ                          | Trạng thái | Ghi chú                                                                 |
| ------------------- | ---------------------------------- | :--------: | ----------------------------------------------------------------------- |
| Unit/integration API | Jest + Supertest                  |  Đã chốt   | Test luật vòng thi, chấm điểm, phân quyền.                              |
| DB cho integration  | Testcontainers (PostgreSQL, Redis) |  Đề xuất   | Test trên DB thật thay vì mock.                                         |
| Component frontend  | React Testing Library + Vitest     |  Đã chốt   | Vitest tích hợp sẵn với Vite. Thay thế: Jest.              |
| End-to-end          | Playwright                         |  Đã chốt   | Mô phỏng nhiều trình duyệt (Host + 2–4 Player + Spectator) trong một trận. |
| Kiểm thử tải        | k6 (hoặc Artillery cho Socket.IO)  |  Đề xuất   | Nghiệm thu chỉ tiêu mục 16 (BR-NFR-01).                                 |

---

## 7. Hạ tầng, triển khai và vận hành

| Hạng mục           | Công nghệ                                   | Trạng thái | Ghi chú                                                                 |
| ------------------ | ------------------------------------------- | :--------: | ----------------------------------------------------------------------- |
| Container          | Docker                                      |  Đã chốt   |                                                                         |
| Môi trường dev     | Docker Compose: PostgreSQL, Redis, LiveKit, Mailpit (object storage: xem T8) |  Đã chốt   | Một lệnh dựng đủ dịch vụ phụ thuộc.                       |
| Reverse proxy / TLS | Caddy (hoặc Nginx)                         |  Đề xuất   | TLS tự động, hỗ trợ WebSocket.                                          |
| CI                 | GitHub Actions                              |  Đề xuất   | Lint, type-check, test, build image.                                    |
| CDN                | CDN trước object storage                    |  Đề xuất   | Media câu hỏi (mục 16).                                                 |
| Giám sát lỗi       | Sentry                                      |  Đề xuất   | Cả frontend và backend.                                                 |
| Metrics            | Prometheus + Grafana                        |  Đề xuất   | Số phòng, số kết nối, độ trễ đồng bộ, độ sẵn sàng.                      |

---

## 8. Điểm cần chốt khi review

| #  | Nội dung                                                                 | Phương án đề xuất          | Phương án thay thế              |
| -- | ------------------------------------------------------------------------ | -------------------------- | ------------------------------- |
| T1 | Thư viện realtime                                                        | Socket.IO                  | `ws` thuần                      |
| T2 | SFU cho video call                                                       | LiveKit tự host            | mediasoup; dịch vụ cloud trả phí |
| T3 | Validation                                                               | Zod (dùng chung FE/BE)     | class-validator                 |
| T4 | Cơ chế xác thực                                                          | JWT + refresh token cookie | Session lưu Redis               |
| T5 | Test runner frontend                                                     | Vitest                     | Jest                            |
| T6 | Nơi triển khai (VPS tự quản / cloud / Kubernetes)                        | Chưa đề xuất – cần thông tin ngân sách và quy mô | –      |
| T7 | Object storage và CDN khi production                                     | Chưa đề xuất – phụ thuộc T6 | –                              |
| T8 | Object storage S3-compatible cho dev (MinIO đã ngừng phát hành Docker image cộng đồng) | Chưa đề xuất – chốt trước P2 | SeaweedFS, Garage, LocalStack |
