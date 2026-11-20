# TRIỂN KHAI NHANH BẰNG DỊCH VỤ MIỄN PHÍ – OLYMPIA ONLINE

> Cách deploy để chơi thử với nhóm nhỏ (gia đình, một lớp học) khi chưa có VPS: **Render** (API + Redis), **Vercel** (giao diện web), **Neon** (PostgreSQL), **LiveKit Cloud** (video/voice), **Backblaze B2** (ảnh/video câu hỏi, không bắt buộc). Khi có VPS, chuyển sang [van-hanh.md](van-hanh.md).
>
> Gói miễn phí của các dịch vụ trên thay đổi theo thời gian. Kiểm tra giới hạn hiện tại trên trang giá của từng dịch vụ trước khi dùng.

## 1. Sơ đồ

```
Trình duyệt ──► Vercel (web tĩnh) ──rewrite /api/*──► Render: olympia-api ──► Neon (PostgreSQL)
     │                                                     │
     ├──── WebSocket (Socket.IO) ── thẳng tới Render ──────┤──► Render Key Value (Redis)
     │                                                     │
     └──── video/voice ── thẳng tới LiveKit Cloud ◄── token┘──► Backblaze B2 (media)
```

- REST đi qua rewrite của Vercel nên trình duyệt coi web và API là **cùng một tên miền**. Nhờ đó cookie đăng nhập (`SameSite=Strict`) hoạt động bình thường.
- Vercel không chuyển tiếp WebSocket, nên Socket.IO kết nối thẳng tới Render qua biến `VITE_SOCKET_URL`. Kết nối này xác thực bằng token, không dùng cookie.

## 2. Những điều cần biết trước

- **Render gói free "ngủ" sau khoảng 15 phút không có truy cập.** Lần mở đầu tiên sau đó mất khoảng 1 phút để thức dậy. Nên mở trang trước giờ chơi một chút. Muốn API luôn thức thì nâng lên gói trả phí thấp nhất của Render.
- Trận đang chơi không mất khi API khởi động lại: trạng thái được lưu trong PostgreSQL và người chơi tự kết nối lại.
- Redis gói free của Render không lưu xuống đĩa. Nếu Redis khởi động lại, trận được khôi phục từ PostgreSQL.
- Chỉ **Host** cần tài khoản. Các cháu vào phòng bằng mã phòng dưới dạng khách, không cần đăng ký.
- Bản này chạy được đầy đủ cho nhóm nhỏ, nhưng **chưa phải cấu hình production chính thức**: chưa có sao lưu tự động và giám sát như [van-hanh.md](van-hanh.md).

## 3. Chuẩn bị

1. Đẩy code lên GitHub (repo riêng tư cũng được). Render và Vercel deploy từ GitHub.
2. Tạo khóa ngẫu nhiên khi cần, ví dụ chạy `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

Ghi các giá trị sau vào một chỗ an toàn (không commit). Bạn sẽ điền chúng ở bước 7.

| Giá trị | Lấy ở bước |
| ------- | ---------- |
| `DATABASE_URL` | 4 – Neon |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | 5 – LiveKit Cloud |
| `S3_*` | 6 – Backblaze B2 (không bắt buộc) |
| `SMTP_URL`, `MAIL_FROM` | 8 – Gmail (không bắt buộc) |

## 4. Neon (PostgreSQL)

1. Đăng ký tại [neon.tech](https://neon.tech) và tạo project. **Region chọn Singapore** (AWS ap-southeast-1) để gần Render Singapore.
2. Vào **Connect** và chọn connection string **không có** `-pooler` (Pooled connection: tắt). Chuỗi có dạng:

   ```
   postgresql://neondb_owner:xxxx@ep-xxx-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

   Nếu chuỗi có thêm `&channel_binding=require`, hãy **xóa phần đó** và giữ `?sslmode=require`. Đây là `DATABASE_URL`.
3. Không cần tạo bảng: API tự chạy migration mỗi lần khởi động.

## 5. LiveKit Cloud (video/voice)

1. Đăng ký tại [cloud.livekit.io](https://cloud.livekit.io) và tạo project.
2. Vào **Settings → Keys** và tạo API key. Ghi lại:
   - `LIVEKIT_URL`: URL dạng `wss://ten-project-xxxx.livekit.cloud`
   - `LIVEKIT_API_KEY`: API Key
   - `LIVEKIT_API_SECRET`: API Secret (dài trên 32 ký tự, đúng yêu cầu của API)

Không cần cấu hình gì thêm. Nếu LiveKit lỗi hoặc hết hạn mức, trận vẫn chơi được và chỉ không có video (BR-AV-02).

## 6. Backblaze B2 (ảnh/video trong câu hỏi – không bắt buộc)

Bỏ qua bước này nếu câu hỏi chỉ có chữ. Khi đó vẫn phải điền giá trị giả ở bước 7 (xem ghi chú ở đó), và chức năng tải ảnh/video lên sẽ báo lỗi.

API chỉ cần một object storage **tương thích S3** có presigned URL và CORS, nên dịch vụ nào đáp ứng được cũng dùng được. Hướng dẫn này dùng Backblaze B2 vì gói miễn phí (10 GB) **không cần thẻ thanh toán**. Cloudflare R2 cũng dùng được nhưng đòi thẻ ngay cả khi dùng trong hạn mức miễn phí.

1. **Đăng ký** tại [backblaze.com/sign-up/cloud-storage](https://www.backblaze.com/sign-up/cloud-storage): chỉ cần email, mật khẩu và **Region**. Chọn **US West** (B2 không có vùng châu Á). Region không đổi được sau này. Bấm link xác nhận trong email Backblaze gửi tới.
   - Khi đăng nhập, chọn tab **Individual Account**. Tab **Organization** dành cho đăng nhập SSO của công ty và sẽ báo "Please enter a valid organization".
   - Không có thẻ thì B2 chặn khi chạm hạn mức miễn phí hằng ngày (dung lượng tải xuống, số lượt gọi API) chứ không tính tiền. Xem ở mục **Caps & Alerts**.
2. **Tạo bucket**: **B2 Cloud Storage → Buckets → Create a Bucket**.
   - Tên bucket phải là duy nhất trên toàn B2, ví dụ `olympia-media-<ten-ban>`.
   - **Files in Bucket: Private**. Không cần Public vì API phát presigned URL cho cả upload lẫn tải về.
   - Ghi lại **Endpoint** hiện ở thẻ bucket, dạng `s3.us-west-004.backblazeb2.com`.
3. **Tạo khóa**: **Application Keys → Add a New Application Key**. Phần **Allow access to Bucket(s)** chọn bucket vừa tạo, **Type of Access** chọn **Read and Write**. Ghi lại **keyID** và **applicationKey** (khóa này chỉ hiện một lần).
4. **Đặt CORS** để trình duyệt upload thẳng lên bucket. Giao diện web của B2 không cho chọn quyền upload (`PUT`), nên phải dùng [B2 CLI](https://www.backblaze.com/docs/cloud-storage-command-line-tools). Cài bằng `pip install b2`, hoặc tải bản `b2-windows.exe` ở trang release của B2 CLI trên GitHub. Tạo file `cors.json` (thay bằng tên miền Vercel ở bước 9; nếu chưa biết thì tạm để `"*"` rồi sửa lại sau):

   ```json
   [
     {
       "corsRuleName": "olympia-web",
       "allowedOrigins": ["https://ten-du-an.vercel.app"],
       "allowedOperations": ["s3_put", "s3_get", "s3_head"],
       "allowedHeaders": ["*"],
       "exposeHeaders": ["ETag"],
       "maxAgeSeconds": 3600
     }
   ]
   ```

   Sau đó chạy lệnh dưới đây **trong Git Bash** (PowerShell làm hỏng dấu nháy của JSON):

   ```bash
   b2 account authorize <keyID> <applicationKey>
   b2 bucket update --cors-rules "$(cat cors.json)" olympia-media-<ten-ban> allPrivate
   ```

   Bản B2 CLI cũ dùng `b2 authorize-account` và `b2 update-bucket` thay cho hai lệnh trên.
5. Các giá trị cần điền ở bước 7:
   - `S3_ENDPOINT` và `S3_PUBLIC_ENDPOINT`: `https://` + Endpoint ở bước 2, ví dụ `https://s3.us-west-004.backblazeb2.com`
   - `S3_REGION`: phần giữa của Endpoint, ví dụ `us-west-004`. **Phải khớp**, nếu không B2 sẽ từ chối chữ ký của presigned URL.
   - `S3_BUCKET`: tên bucket
   - `S3_ACCESS_KEY_ID`: keyID. `S3_SECRET_ACCESS_KEY`: applicationKey.

## 7. Render (API + Redis)

Repo đã có sẵn [`render.yaml`](../render.yaml), khai báo:

- API chạy bằng Docker từ `deploy/Dockerfile.api`, region Singapore, tự chạy migration khi khởi động;
- Redis (Key Value) gói free;
- `JWT_SECRET` do Render tự sinh.

1. Đăng ký [render.com](https://render.com) và kết nối GitHub.
2. Chọn **New → Blueprint**, chọn repo. Render đọc `render.yaml` và hiện danh sách biến cần nhập:

   | Biến | Giá trị |
   | ---- | ------- |
   | `DATABASE_URL` | Chuỗi Neon ở bước 4 |
   | `APP_URL` | `https://ten-du-an.vercel.app`. Tạm điền tên bạn định đặt cho dự án Vercel, sửa lại sau ở bước 9 nếu khác. |
   | `CORS_ORIGINS` | Giống `APP_URL` |
   | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Bước 5 |
   | `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Bước 6. Nếu bỏ qua bước 6: `S3_ENDPOINT` và `S3_PUBLIC_ENDPOINT` = `https://example.invalid`, `S3_REGION` = `auto`, `S3_BUCKET` = `olympia-media`, hai khóa điền chuỗi bất kỳ khác `dev` |
   | `SMTP_URL`, `MAIL_FROM` | Bước 8. Nếu chưa có: `SMTP_URL` = `smtp://localhost:25`, `MAIL_FROM` = `Olympia <no-reply@example.com>` |

3. Bấm **Apply** và chờ build xong (lần đầu khoảng 5–10 phút).
4. Ghi lại URL của API, dạng `https://olympia-api.onrender.com` (Render có thể thêm hậu tố nếu tên đã có người dùng, ví dụ `olympia-api-ab12.onrender.com`).
5. Kiểm tra: mở `https://<url-render>/api/health/live`, kết quả phải là `{"status":"ok"}`. Trang `/api/health/ready` báo lỗi object storage khi bỏ qua bước 6, như vậy là bình thường. Nếu đã cấu hình B2 mà trang này vẫn báo lỗi object storage, hãy kiểm tra lại `S3_ENDPOINT`, `S3_REGION`, tên bucket và khóa.

Nếu deploy lỗi, xem **Logs** của service `olympia-api`:

- `Biến môi trường không hợp lệ`: kiểm tra `APP_URL`/`CORS_ORIGINS` có `https://`, `LIVEKIT_URL` có `wss://`.
- Lỗi kết nối database: kiểm tra chuỗi Neon (đã bỏ `-pooler` và `channel_binding` chưa).

## 8. Gửi email (không bắt buộc)

Tài khoản Host phải **xác minh email** mới tạo được phòng và câu hỏi. Có hai cách:

- **Dùng Gmail.** Bật xác minh 2 bước cho tài khoản Google, tạo **App password** (Tài khoản Google → Bảo mật → Mật khẩu ứng dụng), rồi trong Render → `olympia-api` → **Environment** đặt:

  ```
  SMTP_URL=smtps://ten.ban%40gmail.com:matkhauungdung16kytu@smtp.gmail.com:465
  MAIL_FROM=Olympia Online <ten.ban@gmail.com>
  ```

  Ký tự `@` trong email viết thành `%40`. Mật khẩu ứng dụng viết liền, không có dấu cách.
- **Xác minh tay**, không cần email. Sau khi đăng ký, vào Neon → **SQL Editor** và chạy:

  ```sql
  UPDATE users SET email_verified_at = now() WHERE email = 'email.cua.ban@gmail.com';
  ```

Muốn có quyền quản trị (Super Admin) thì chạy thêm:

```sql
UPDATE users SET system_role = 'super_admin' WHERE email = 'email.cua.ban@gmail.com';
```

## 9. Vercel (giao diện web)

1. Sửa [`vercel.json`](../vercel.json) ở thư mục gốc repo. Trong dòng rewrite `/api/:path*`, thay `olympia-api.onrender.com` bằng **đúng tên miền Render** ở bước 7, rồi commit và push:

   ```json
   { "source": "/api/:path*", "destination": "https://olympia-api-ab12.onrender.com/api/:path*" }
   ```

2. Đăng ký [vercel.com](https://vercel.com), chọn **Add New → Project** và import repo.
   - **Root Directory**: để nguyên thư mục gốc repo (không chọn `apps/web`).
   - **Framework Preset**: Other. Lệnh build và thư mục output đã có trong `vercel.json`.
   - **Environment Variables**: thêm `VITE_SOCKET_URL` = `https://<url-render>`, không có `/` ở cuối.
3. Bấm **Deploy**. Sau khi xong, Vercel cho tên miền dạng `https://ten-du-an.vercel.app`.
4. Nếu tên miền này khác giá trị đã điền ở bước 7:
   - sửa `APP_URL` và `CORS_ORIGINS` trong Render → Environment (Render tự deploy lại);
   - sửa `allowedOrigins` trong `cors.json` rồi chạy lại lệnh `b2 bucket update` ở bước 6.

> `VITE_SOCKET_URL` được đóng vào bản build. Mỗi lần đổi biến này, phải **Redeploy** dự án trên Vercel.

## 10. Chơi thử

1. Mở `https://ten-du-an.vercel.app`, đăng ký tài khoản Host và xác minh email (bước 8).
2. Vào **Ngân hàng câu hỏi** để tạo câu hỏi và bộ đề, vào **Kịch bản** để tạo kịch bản, rồi **Tạo phòng** và chọn kịch bản. Chế độ **Tự động** cho phép Host vừa điều khiển vừa xem nhẹ nhàng.
3. Gửi mã phòng hoặc link mời cho các cháu. Các cháu mở link trên điện thoại hay máy tính, nhập tên, chọn **Người chơi**.
4. Trong sảnh chờ, kiểm tra camera/micro, rồi Host bấm **Bắt đầu trận**.

Nếu lúc chơi gặp lỗi:

| Hiện tượng | Nguyên nhân thường gặp |
| ---------- | ---------------------- |
| Trang mở được nhưng đăng nhập báo lỗi mạng | Render đang thức dậy (chờ khoảng 1 phút rồi thử lại), hoặc tên miền Render trong `vercel.json` sai. |
| Vào phòng mãi hiện "Đang kết nối" | `VITE_SOCKET_URL` sai hoặc chưa Redeploy Vercel; `CORS_ORIGINS` trên Render không khớp tên miền Vercel. |
| Không có video, chỉ có ảnh đại diện | Sai khóa LiveKit, hoặc trình duyệt chưa cho phép camera/micro. Trận vẫn chơi được. |
| Tải ảnh câu hỏi lên bị lỗi | Chưa cấu hình B2, CORS của bucket chưa có tên miền Vercel, hoặc `S3_REGION` không khớp Endpoint. |

## 11. Cập nhật phiên bản

Push code lên nhánh đã kết nối: Render và Vercel tự build lại. Migration tự chạy khi API khởi động. Nếu cập nhật trong lúc đang có trận, người chơi sẽ tự kết nối lại sau khi API khởi động xong.
