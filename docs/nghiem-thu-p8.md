# BÁO CÁO NGHIỆM THU P8 – OLYMPIA ONLINE

> Kết quả P8 (hoàn thiện, kiểm thử tải, nghiệm thu, phát hành) đối chiếu với [tiêu chí nghiệm thu mục 5 của kế hoạch](ke-hoach-trien-khai.md#5-tiêu-chí-nghiệm-thu-phát-hành). Ngày đánh giá: 2026-11-20. Môi trường: máy phát triển (Windows, Docker Desktop). Chưa có staging hay production.

## 1. Tóm tắt

| Tiêu chí (mục 5) | Kết quả | Ghi chú |
| ---------------- | ------- | ------- |
| E2E các luồng chính chạy xanh trong CI | **Đạt một phần** | E2E trận đầy đủ 4 vòng (Host + 2 Player + khán giả) chạy với backend thật trên Chromium và Firefox; giao diện cơ bản chạy trên 5 cấu hình trình duyệt. Các luồng quản lý (ngân hàng câu hỏi, kịch bản, quản trị) mới có test component và test API, chưa có E2E riêng. |
| Không còn lỗi nghiêm trọng/cao | **Đạt** (trong phạm vi đã kiểm tra) | Review bảo mật không phát hiện lỗi mức Critical/High. Kiểm thử tải phát hiện 2 lỗi mức cao, cả hai đã sửa và có test hồi quy (mục 3). |
| Đạt chỉ tiêu mục 16 trong kiểm thử tải | **Chưa kết luận** | Bài tải 40 phòng / 440 kết nối trên máy dev cho p95 đồng bộ 318 ms (chỉ tiêu 300 ms). Phải đo lại trên staging bằng bản build production và máy sinh tải riêng (mục 3.1). |
| Tắt một instance giữa trận: khôi phục ≤ 30 giây, không mất điểm | **Đạt** | Khôi phục khoảng 9,6 giây; điểm giữ nguyên (mục 3.2). |
| Đáp án không xuất hiện trước khi công bố | **Đạt** | Test API (BR-RT-01) cho Player, khán giả và người giám sát; luồng âm thanh/hiệu ứng chỉ dùng dữ liệu đã gửi. |
| Chơi thử 4 vòng trên desktop, tablet, điện thoại (Chrome, Edge, Safari, Firefox) | **Đạt một phần** | E2E chạy người chơi ở khung điện thoại, khán giả ở khung tablet, có kiểm tra không tràn ngang. Chưa chơi thử trên thiết bị thật; Safari mới chạy qua WebKit của Playwright ở bộ E2E cơ bản. |
| Rà soát pháp lý chính sách quyền riêng tư | **Chưa làm** | Cần người có chuyên môn pháp lý (BR-DATA-06). |

## 2. Review bảo mật

Phạm vi: toàn bộ `apps/api` (middleware, xác thực, phân quyền REST/Socket.IO, truy vấn SQL, upload media, log, cấu hình), cấu hình web và cấu hình triển khai. Phương pháp: đọc code và chạy test. Không có kiểm thử xâm nhập từ bên ngoài.

### 2.1. Đã kiểm tra, không phát hiện vấn đề

- **Xác thực:**
  - Mật khẩu băm bằng Argon2id.
  - Access token ngắn hạn, refresh token xoay vòng trong cookie `HttpOnly`, `SameSite=Strict`, `Secure` ở production, phạm vi `/api/auth`.
  - Mọi route `/api/auth` và route vào phòng (có ghi cookie) yêu cầu header `x-olympia-csrf`.
  - Đăng nhập sai bị giới hạn theo email+IP, theo email và theo IP; đăng nhập thành công không bị tính.
  - Socket dùng chung access token; phiên bị thu hồi thì socket bị ngắt.
- **Phân quyền:**
  - Câu hỏi, bộ đề, media và kịch bản đều lọc theo người sở hữu, tài nguyên của người khác trả 404 (không lộ tài nguyên có tồn tại).
  - Lệnh trận kiểm tra vai trò ở server, có test cho khán giả, Host, người giám sát và Player sai lượt.
  - Phạm vi của Manager theo tổ chức áp dụng cho quản trị người dùng, danh sách phòng, đóng phòng và giám sát.
- **Lộ đáp án (BR-RT-01, BR-SPEC-03):** view theo đối tượng, có test cho Player, khán giả và người giám sát.
- **SQL injection:** mọi truy vấn viết tay đều dùng tham số. Các đoạn ghép chuỗi chỉ ghép hằng số hoặc placeholder `$n`.
- **XSS:** không dùng `dangerouslySetInnerHTML` hay `innerHTML`; email HTML có escape. Production thêm Content-Security-Policy chặt (`deploy/Caddyfile`).
- **Upload media:** URL presigned có thời hạn, giới hạn loại và dung lượng tệp. Server kiểm tra lại chữ ký định dạng sau khi upload; key lưu trữ do server sinh nên không có path traversal.
- **Lộ dữ liệu:**
  - Log che `authorization`, `cookie`, `set-cookie` và các trường `password`/`token`.
  - Lỗi không xác định được ẩn thành 500 chung.
  - Token xác minh email và đặt lại mật khẩu gửi trong body POST, không nằm trên URL của API.
- **Dependency:** `npm audit --omit=dev` cho kết quả 0 lỗ hổng.
- **Cấu hình:** production từ chối `JWT_SECRET` mẫu, khóa S3 mẫu và khóa LiveKit ngắn.

### 2.2. Phát hiện và đã sửa (DL-055)

| Mức | Vị trí | Kịch bản | Cách sửa | Test |
| --- | ------ | -------- | -------- | ---- |
| Medium | `POST /api/rooms/:id/join` | Một máy tạo hàng loạt phiên khách để lấp đầy chỗ khán giả hoặc spam yêu cầu làm người chơi, khiến phòng không dùng được | Giới hạn 15 lượt/phút/IP/phòng | `lobby.routes.test.ts` "Chống lấp phòng bằng khách ảo" |
| Medium | Toàn bộ REST | Không có giới hạn chung, một IP có thể gửi request dồn dập vào các endpoint đọc DB | `API_RATE_LIMIT_PER_MINUTE` (600/phút/IP, trả 429 kèm `Retry-After`) | `api-rate-limit.test.ts` |
| Low | Socket.IO `room:subscribe`, `match:sync`; kích thước gói tin | Gửi dồn dập sự kiện đọc DB; gói tin mặc định tới 1 MB | 20 lần/10 giây/danh tính; `maxHttpBufferSize` 64 KB | Test realtime hiện có vẫn đạt |
| Low | Cấu hình production | Có thể chạy production với CORS/APP_URL http hoặc LiveKit `ws://` (trình duyệt chặn, cookie lộ qua http) | Kiểm tra lúc khởi động: bắt buộc https/wss | `env.test.ts` |

### 2.3. Ghi nhận, chưa xử lý

- Header bảo mật và CSP của web tĩnh nằm ở Caddy (production). Môi trường dev không có, vì Vite tự phục vụ.
- Tài khoản giám sát ẩn với người trong phòng (DL-051); việc vào giám sát được ghi nhật ký quản trị.
- Chưa có kiểm thử xâm nhập độc lập. Nên thuê kiểm thử trước khi mở cho số đông.

## 3. Kiểm thử tải và khôi phục (DL-052)

### 3.1. Kiểm thử tải

Lệnh: `npm run load:test -w @olympia/api`. Mỗi phòng có 1 Host, 4 Player (khách) và 6 khán giả, chơi vòng Tăng tốc ở chế độ thủ công, 3 câu: Host mở câu → bắt đầu giờ → 4 Player trả lời cùng lúc → công bố.

| Lần chạy | Phòng / kết nối | Hoàn tất | Lỗi | Đồng bộ p50 / p95 / p99 (ms) | Ack trả lời p95 (ms) |
| -------- | --------------- | -------- | --- | ---------------------------- | -------------------- |
| 1 (trước khi sửa) | 20 / 88 | 8/20 | 12 phòng lỗi 500 khi tạo | 31 / 59 / 66 | 173 |
| 2 (trước khi sửa) | 40 | API treo | Cạn pool kết nối DB | – | – |
| 3 (sau khi sửa) | 40 / 440 | 40/40 | 0 | 173 / 318 / 387 | 635 |

Lần 3 chạy API ở chế độ dev (`tsx`, chưa build) trên cùng laptop với 440 client giả lập, PostgreSQL và Redis, và mọi phòng thao tác cùng một thời điểm. Đây là kịch bản bùng tải xấu hơn thực tế, nên **chưa dùng để kết luận** chỉ tiêu 300 ms. Phải chạy lại trên staging theo [van-hanh.md mục 8.1](van-hanh.md#81-kiểm-thử-tải).

**Lỗi tìm ra nhờ kiểm thử tải (đã sửa, có test hồi quy):**

1. **Deadlock khi một Host tạo nhiều phòng cùng lúc (mức cao, trả 500).** Transaction tạo phòng chèn dòng `rooms` trước, nên khóa ngoại lấy khóa KEY SHARE trên dòng Host; sau đó nó mới xin khóa `FOR UPDATE` trên chính dòng đó để kiểm tra giới hạn phòng. Hai transaction chờ nhau. Sửa: khóa Host trước khi chèn. Test: `rooms.routes.test.ts` "tạo-và-mở phòng đồng thời không deadlock", trả 500 nếu không có bản sửa.
2. **Cạn pool kết nối DB khi nhiều trận bắt đầu cùng lúc (mức cao, toàn bộ API treo).** `beginMatch` giữ transaction và khóa phòng, rồi bên trong lại đọc kịch bản và câu hỏi qua kết nối khác. Từ khoảng 10 trận đồng thời trở lên, mọi kết nối trong pool đều chờ một kết nối thứ hai. Sửa: đọc kịch bản và câu hỏi trước transaction, trong transaction kiểm tra lại kịch bản không đổi. Thêm `DATABASE_POOL_SIZE` (mặc định 20). Test: `match.routes.test.ts` "nhiều trận bắt đầu cùng lúc … không treo" (12 trận).

Rà soát thêm sau khi sửa: không còn transaction nào khác gọi `dataSource` hoặc service khác trong lúc đang giữ transaction.

### 3.2. Kiểm thử khôi phục

Lệnh: `npm run load:recovery -w @olympia/api`. Chạy 2 instance API dùng chung PostgreSQL và Redis. Trận mở trên instance A, câu 1 có điểm (`1:40, 2:0`). Sau đó bắt đầu đồng hồ câu 2 (5 giây) và tắt cứng A.

| Chỉ số | Kết quả |
| ------ | ------- |
| Client đồng bộ lại trên B | 134 ms |
| Đồng hồ câu 2 kết thúc trên B | 14,6 giây sau khi tắt A (đồng hồ còn ~5 giây, chờ lease của A hết hạn) |
| Host điều khiển tiếp được | Có |
| Điểm sau khôi phục | `1:40, 2:0`, giữ nguyên |
| Thời gian khôi phục (vượt quá thời gian còn lại của đồng hồ) | khoảng 9,6 giây, **đạt** (≤ 30 giây) |

### 3.3. Lỗi khác tìm ra khi chạy lại toàn bộ test

- **Đóng phòng nhàn rỗi bị "kẹt" (mức trung bình).** Job đóng phòng không hoạt động lấy tối đa 100 phòng, không sắp xếp. Phòng nhàn rỗi nhưng còn người online bị bỏ qua mà vẫn chiếm cửa sổ 100 phòng đó mãi. Sửa: duyệt theo trang `(lastActivityAt, id)`. Test: `room-realtime.test.ts`, 101 phòng bận cộng 1 phòng nhàn rỗi. Test cũ của job này cũng được sửa để không tua đồng hồ chung (nó từng làm phòng của các suite khác chạy song song bị đóng theo).

## 4. E2E và trình duyệt

| Bộ | Lệnh | Phạm vi | Kết quả |
| -- | ---- | ------- | ------- |
| Giao diện cơ bản (API giả lập) | `npm run test:e2e` | Trang chủ, đăng nhập, đăng ký, 404, không tràn ngang; Chrome/Firefox/Safari (WebKit) desktop, Android (Chromium), iPhone (WebKit) | 25/25 đạt |
| Trận đầy đủ (backend thật) | `npm run test:e2e:full` | Host đăng nhập → 2 Player khách (khung điện thoại) và 1 khán giả (khung tablet) vào phòng → trận tự động 4 vòng → kết quả giống nhau ở mọi màn → trang tổng kết có câu của cả 4 vòng; kiểm tra không tràn ngang ở sảnh, màn trả lời, màn khán giả, màn Host, kết quả | Chromium và Firefox đạt (mỗi lần khoảng 2 phút) |

CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) chạy cả hai bộ. Bộ trận đầy đủ dùng PostgreSQL và Redis làm service của GitHub Actions.

## 5. Việc còn lại trước phát hành

1. Dựng staging (VPS + tên miền) theo [van-hanh.md](van-hanh.md). Chạy lại kiểm thử tải ở quy mô ≥ 200 phòng / 5.000 kết nối, đo video (≤ 500 ms, ≥ 100 phòng có video) và thử gọi video qua 4G (còn treo từ P6).
2. Chơi thử trọn trận trên thiết bị thật: iPhone (Safari), iPad, Android, Edge.
3. Rà soát pháp lý chính sách quyền riêng tư (BR-DATA-06).
4. (Nên làm) E2E cho các luồng quản lý: ngân hàng câu hỏi, kịch bản, quản trị.
5. Xác nhận DL-052 (công cụ kiểm thử tải).
