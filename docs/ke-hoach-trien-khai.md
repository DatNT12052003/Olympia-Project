# KẾ HOẠCH TRIỂN KHAI – OLYMPIA ONLINE

> Kế hoạch triển khai phiên bản đầu của Olympia Online.
>
> Tài liệu liên quan: [Đặc tả nghiệp vụ](dac-ta-nghiep-vu-olympia.md) · [Công nghệ sử dụng](cong-nghe-su-dung.md) · [Decision log](decision-log.md)
>
> **Thiết kế giao diện:** canvas [Olympia Online – Bộ màn hình](https://claude.ai/artifact/HKmpC4F1bxyket69iq7Yw8). Mỗi màn hình trong canvas ghi rõ giai đoạn (P1…P7); khi làm giao diện của một giai đoạn, đọc các màn tương ứng và màn `Main` (nền tảng giao diện: font, màu, nút, ô nhập) rồi làm theo. Màn chưa có thiết kế thì theo `Main`.

---

## 1. Phạm vi và giả định

### 1.1. Phạm vi phiên bản đầu

Toàn bộ mục 1–16 của đặc tả nghiệp vụ, trừ:

- Các nội dung ở mục 17 (giải đấu, xếp hạng, AI, ghi hình…).
- Nhập/xuất câu hỏi qua Excel/CSV và câu hỏi âm thanh: làm nếu còn thời gian, nếu không chuyển sang giai đoạn sau.
- Đa ngôn ngữ (chỉ tiếng Việt).

### 1.2. Giả định

| #  | Giả định                                                                                   |
| -- | ------------------------------------------------------------------------------------------ |
| A1 | Nhóm **2–3 lập trình viên full-stack**, làm toàn thời gian. Thời lượng các giai đoạn ước lượng theo giả định này. |
| A2 | Mỗi tuần có một buổi demo/review với Product Owner.                                        |
| A3 | Các quyết định ở trạng thái **Đề xuất** trong [decision log](decision-log.md) được xác nhận đúng hạn ghi ở mục 4. |
| A4 | Có môi trường staging từ giai đoạn P3 để thử với nhiều thiết bị thật.                      |

Nếu quy mô nhóm khác, cần ước lượng lại thời lượng ở mục 2.

---

## 2. Tổng quan các giai đoạn

| Giai đoạn | Nội dung                                   | Thời lượng ước lượng | Phụ thuộc   | Mốc         |
| --------- | ------------------------------------------ | :------------------: | ----------- | ----------- |
| P0        | Khởi tạo nền tảng                          | 1–2 tuần             | –           |             |
| P1        | Tài khoản, xác thực, phân quyền            | 2 tuần               | P0          |             |
| P2        | Ngân hàng câu hỏi và bộ đề                 | 2 tuần               | P1          |             |
| P3        | Phòng thi và realtime nền                  | 2 tuần               | P1          | **M1**      |
| P4        | Game Engine lõi, kịch bản, vòng Khởi động  | 3 tuần               | P2, P3      | **M2**      |
| P5        | Ba vòng còn lại, chế độ tự động            | 3 tuần               | P4          |             |
| P6        | Video call và voice chat                   | 2 tuần               | P3          | **M3** (cùng P5) |
| P7        | Kết quả, lịch sử, thống kê, quản trị       | 2 tuần               | P4          |             |
| P8        | Hoàn thiện, kiểm thử tải, nghiệm thu, phát hành | 2 tuần          | P5, P6, P7  | **M4**      |

**Tổng:** khoảng 19–20 tuần nếu làm tuần tự; khoảng **13–14 tuần** khi chạy song song P2 ∥ P3, P6 ∥ P4, P7 ∥ P5. Nên dự phòng thêm 2–3 tuần cho phát sinh, tức mục tiêu thực tế **15–17 tuần**.

```
Tuần:  1   3   5   7   9   11  13
P0     ████
P1         ████
P2             ████
P3             ████              ← M1 (hết tuần 6)
P4                 ██████        ← M2 (hết tuần 9)
P5                       ██████  ← M3 (hết tuần 12)
P6                   ████
P7                       ████
P8                             ████  ← M4 (hết tuần 14)
```

### 2.1. Các mốc

| Mốc | Nội dung                                                                                      | Cách kiểm chứng                                    |
| --- | --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| M1  | Host tạo phòng, Player/Spectator (kể cả khách) vào phòng, xếp vị trí, kết nối lại được.        | Demo trên staging với 4 thiết bị.                  |
| M2  | **Demo đầu tiên:** chơi trọn vòng Khởi động ở chế độ thủ công, điểm đồng bộ realtime.          | Demo với PO; E2E test Host + 2 Player.             |
| M3  | Trận đầy đủ 4 vòng, cả chế độ thủ công và tự động, có video/voice.                            | Chơi thử nội bộ với người dùng thật.               |
| M4  | Phát hành phiên bản đầu.                                                                      | Đạt tiêu chí nghiệm thu mục 5.                     |

---

## 3. Chi tiết từng giai đoạn

Mỗi hạng mục trong một giai đoạn chỉ được coi là xong khi: có test (unit/integration, E2E cho luồng chính), có kiểm tra phân quyền ở backend, giao diện dùng được ở desktop và điện thoại, và đã review code.

### P0 – Khởi tạo nền tảng (1–2 tuần)

**Điều kiện bắt đầu:** chốt DL-018, DL-020, DL-022.

- Monorepo npm workspaces: `apps/api`, `apps/web`, `packages/shared`.
- TypeScript strict, ESLint, Prettier, cấu hình test (Jest, Vitest, Playwright).
- Docker Compose: PostgreSQL, Redis, LiveKit, Mailpit (object storage chuyển sang P2, xem DL-025).
- Khung `apps/api`: Express, phân lớp, xử lý lỗi tập trung, logging Pino, cấu hình theo env, healthcheck, migration TypeORM đầu tiên.
- Khung `apps/web`: Vite, Tailwind, React Router, TanStack Query, layout responsive cơ bản.
- Khung realtime: Socket.IO gateway có xác thực, Redis adapter.
- CI GitHub Actions: lint, type-check, test, build.
- Cập nhật CLAUDE.md với các lệnh build/lint/test thực tế.

**Kết quả:** `docker compose up` + một lệnh dev chạy được cả api và web; CI xanh.

### P1 – Tài khoản, xác thực, phân quyền (2 tuần)

- Đăng ký, xác minh email, đăng nhập/đăng xuất, quên/đặt lại mật khẩu, cập nhật hồ sơ (mục 3).
- JWT + refresh token xoay vòng, thu hồi phiên khi khóa tài khoản (BR-AUTH-02).
- Giới hạn đăng nhập sai (BR-AUTH-03).
- Phiên khách (BR-AUTH-05, BR-AUTH-06).
- Mô hình vai trò hệ thống và Tổ chức (DL-005); middleware phân quyền dùng chung cho REST và socket (BR-ROLE-05, BR-ROLE-06).

**Kết quả:** Ma trận phân quyền mục 2.2 có test tự động cho từng vai trò.

### P2 – Ngân hàng câu hỏi và bộ đề (2 tuần)

- CRUD câu hỏi theo 5.1; các loại câu hỏi và cách chấm 5.2; so khớp câu trả lời ngắn (BR-QB-01).
- Upload media qua presigned URL, giới hạn dung lượng/định dạng (BR-QB-02).
- Xóa mềm (BR-QB-03); lọc theo môn/chủ đề/lớp/độ khó/vòng/tag.
- Bộ đề, chọn câu ngẫu nhiên theo tiêu chí (5.3).
- Chia sẻ public: chờ duyệt → duyệt/từ chối, sao chép, phiên bản (5.4, BR-QB-05…10).

**Kết quả:** Host chuẩn bị được bộ đề đủ cho 4 vòng; Manager duyệt được bộ public.

### P3 – Phòng thi và realtime nền (2 tuần, song song P2)

- Thuộc tính phòng, công khai/riêng tư, mật khẩu, link mời (4.1, 4.2).
- Vòng đời phòng Draft → Open → In Match → Closed, tự đóng phòng không hoạt động, giới hạn số phòng/Host (4.3).
- Sảnh chờ, duyệt, xếp vị trí, Sẵn sàng, đổi vai trò, kick/ban (4.4, 4.5).
- Đồng bộ trạng thái có version (BR-RT-03), trạng thái kết nối, kết nối lại và một kết nối/tài khoản (mục 12).
- Reaction và giới hạn tần suất (mục 13).

**Kết quả:** Mốc **M1**.

### P4 – Game Engine lõi, kịch bản, vòng Khởi động (3 tuần)

**Điều kiện bắt đầu:** chốt DL-013.

- Kịch bản: chọn vòng, thứ tự, luật theo preset, kiểm tra hợp lệ, lưu mẫu, chốt snapshot khi bắt đầu (mục 6, DL-003).
- Interface plugin vòng thi (DL-012).
- Máy trạng thái trận và câu hỏi (8.1, 8.2); đồng hồ phía server, tạm dừng/tiếp tục (BR-GAME-01…04).
- Nhận câu trả lời/bấm chuông tuần tự, idempotent; ghi nhận thời điểm ở server.
- Sổ điểm: mỗi thay đổi điểm một bản ghi, tính lại được (9.1).
- Chế độ thủ công đầy đủ (8.3); can thiệp của Host và audit log (8.5).
- Sở hữu trận theo instance, lưu trạng thái Redis/PostgreSQL, khôi phục khi instance lỗi (DL-013).
- Plugin **vòng Khởi động**: thi riêng, thi chung, hai hình thức trả lời (DL-004).
- Giao diện: màn hình Host điều khiển, màn hình Player, màn hình Spectator, bảng điểm realtime.

**Kết quả:** Mốc **M2**. Test đồng thời: nhiều Player bấm chuông/gửi đáp án cùng lúc không mất, không trùng điểm.

### P5 – Ba vòng còn lại và chế độ tự động (3 tuần)

- Plugin **Vượt chướng ngại vật** (7.2): hàng ngang, ô trung tâm, mảnh ảnh, giành quyền CNV, loại người sai.
- Plugin **Tăng tốc** (7.3): điểm theo thứ tự đúng nhanh nhất, hiển thị thời gian trả lời.
- Plugin **Về đích** (7.4): chọn gói, Ngôi sao hy vọng, giành quyền bổ sung.
- Chế độ tự động (8.4): tự chuyển câu/vòng, chấm tự động, chờ Host xác nhận (BR-GAME-05, BR-GAME-06).
- Xử lý hòa điểm và câu hỏi phụ (9.3).

**Kết quả:** Cùng P6 đạt mốc **M3**.

### P6 – Video call và voice chat (2 tuần, song song P4)

- Tích hợp LiveKit: backend cấp token theo vai trò trong phòng; Spectator chỉ nhận (BR-AV-04).
- Bật/tắt camera/micro, trạng thái thiết bị và chất lượng kết nối (11.1).
- Quyền Host: khóa mic/cam Player, "chỉ người đến lượt được nói", tắt tiếng toàn phòng (11.2).
- Tham gia không có camera/micro (BR-AV-01); lỗi video không ảnh hưởng trận (BR-AV-02).
- TURN cho mạng hạn chế.

**Kết quả:** Video 4 Player + Host + Spectator chạy ổn định trên staging, kể cả qua 4G.

### P7 – Kết quả, lịch sử, thống kê, quản trị (2 tuần, song song P5)

- Tổng kết trận, thống kê từng Player, hiển thị đáp án/giải thích (9.4).
- Lịch sử trận cho Host/Player, thống kê Player/Host, hủy kết quả bởi Super Admin (mục 14).
- Dữ liệu cá nhân: xóa tài khoản và ẩn danh, thời hạn lưu nhật ký (14.1).
- Quản trị Super Admin, Manager theo tổ chức, báo cáo vi phạm (mục 15).

### P8 – Hoàn thiện, kiểm thử tải, nghiệm thu, phát hành (2 tuần)

**Điều kiện bắt đầu:** chốt DL-023, DL-024.

- Hoàn thiện responsive, hiệu ứng, âm thanh (11.4).
- E2E nhiều trình duyệt cho trận đầy đủ 4 vòng.
- Kiểm thử tải theo mục 16 (BR-NFR-01); kiểm thử khôi phục khi tắt instance giữa trận.
- Review bảo mật (skill security-review): phân quyền, lộ đáp án (BR-RT-01), rate limit, cookie/CORS.
- Rà soát pháp lý chính sách quyền riêng tư (BR-DATA-06).
- Dựng production, giám sát (Sentry, Prometheus/Grafana), sao lưu DB, hướng dẫn vận hành.

**Kết quả:** Mốc **M4**.

---

## 4. Quyết định cần chốt theo tiến độ

| Hạn chốt         | Quyết định                                    |
| ---------------- | --------------------------------------------- |
| Trước P0         | DL-018, DL-020, DL-022 (đã chốt 2026-11-18)   |
| Trước P1         | DL-001, DL-002, DL-005 (khách, Host, tổ chức), DL-021 (xác thực) |
| Trước P2         | DL-006 (kiểm duyệt public), DL-025 (object storage dev) |
| Trước P4         | DL-003, DL-004, DL-013                         |
| Trước P6         | DL-007, DL-019                                 |
| Trước P7         | DL-008                                         |
| Trước P8         | DL-009, DL-023, DL-024                         |

---

## 5. Tiêu chí nghiệm thu phát hành

- Toàn bộ luồng chính của đặc tả mục 3–15 có E2E test chạy xanh trong CI.
- Không còn lỗi mức nghiêm trọng/cao mở; lỗi bảo mật đã được xử lý.
- Đạt các chỉ tiêu mục 16 trong kiểm thử tải.
- Tắt một instance backend giữa trận: trận khôi phục trong ≤ 30 giây, không mất điểm.
- Đáp án không xuất hiện trong bất kỳ dữ liệu nào gửi tới Player/Spectator trước khi công bố.
- Chơi thử trọn trận 4 vòng trên desktop, tablet, điện thoại (Chrome, Edge, Safari, Firefox).
- Chính sách quyền riêng tư đã được rà soát.

---

## 6. Rủi ro

| Rủi ro                                                         | Ảnh hưởng | Giảm thiểu                                                                 |
| -------------------------------------------------------------- | :-------: | -------------------------------------------------------------------------- |
| Lỗi đồng thời làm sai điểm khi nhiều Player trả lời cùng lúc   | Cao       | Xử lý tuần tự theo trận (DL-013), idempotency, test đồng thời ngay từ P4.  |
| Video không ổn định trên mạng trường học/4G                    | Cao       | TURN, thử sớm trên staging (P6), video độc lập trận (BR-AV-02).            |
| Ước lượng Game Engine thiếu do luật vòng phức tạp              | Trung bình | Làm vòng Khởi động trước để chốt interface plugin; demo M2 sớm.           |
| Quyết định nghiệp vụ chưa được xác nhận đúng hạn               | Trung bình | Theo dõi bảng mục 4 trong buổi review hằng tuần.                           |
| Chi phí hạ tầng video vượt dự kiến                             | Trung bình | Đo tải thực tế ở P6; giới hạn Spectator (DL-007); cân nhắc dịch vụ cloud.  |
| Lộ đáp án qua payload realtime                                 | Cao       | Tách DTO theo vai trò người nhận; test tự động kiểm tra payload.           |
| Phòng công khai bị phá bởi khách                               | Thấp      | Host duyệt, kick/ban, tùy chọn tắt khách (DL-001).                          |
