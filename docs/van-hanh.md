# HƯỚNG DẪN VẬN HÀNH – OLYMPIA ONLINE

> Dành cho người triển khai và vận hành hệ thống trên VPS (DL-023). Toàn bộ cấu hình nằm trong thư mục [`deploy/`](../deploy). Kết quả kiểm thử trước phát hành: [nghiem-thu-p8.md](nghiem-thu-p8.md).

## 1. Kiến trúc production

| Thành phần | Vai trò | Cổng |
| ---------- | ------- | ---- |
| `caddy` | HTTPS tự động (Let's Encrypt), phục vụ web tĩnh, chuyển `/api` và `/socket.io` tới API, proxy tín hiệu LiveKit | 80, 443 (TCP + UDP) |
| `migrate` | Áp dụng migration rồi thoát; API chỉ chạy khi bước này thành công | – |
| `api` | REST + Socket.IO + Game Engine; có thể chạy nhiều instance | 3000 (nội bộ), 9464 metrics (nội bộ) |
| `postgres` | Dữ liệu chính | nội bộ |
| `redis` | Trạng thái trận, kết nối, rate limit, Socket.IO adapter | nội bộ |
| `livekit` | SFU video/voice kèm TURN (mạng host) | 7881/tcp, 7882/udp, 3478/udp, 5349/tcp |
| `backup` | `pg_dump` hằng ngày ra object storage | – |
| `prometheus`, `loki`, `promtail`, `grafana` | Metrics, log, dashboard, cảnh báo (DL-053) | 9090 và 3001 chỉ trên `127.0.0.1` |

Media câu hỏi nằm trên object storage thuê ngoài, ví dụ Cloudflare R2 (DL-024). Không dùng SeaweedFS ở production.

## 2. Chuẩn bị

**VPS:**

- Ubuntu 24.04, đặt gần người dùng (Việt Nam hoặc Singapore).
- Khởi đầu với 4 vCPU, 8 GB RAM, 80 GB SSD và băng thông ra khoảng 1 Gbps. Video chiếm phần lớn băng thông: mỗi phòng có 2–4 người phát, khán giả chỉ nhận.
- Docker Engine 26 trở lên và Docker Compose 2.27 trở lên (cần cho `volume.subpath`).

**DNS:** tạo 3 bản ghi A trỏ về IP của VPS:

| Biến | Ví dụ | Dùng cho |
| ---- | ----- | -------- |
| `APP_DOMAIN` | `olympia.example.vn` | Web + API |
| `LIVEKIT_DOMAIN` | `av.olympia.example.vn` | Tín hiệu video (wss) |
| `TURN_DOMAIN` | `turn.olympia.example.vn` | TURN/TLS cho mạng chặn UDP |

**Firewall** (ví dụ ufw). Chỉ mở các cổng sau, mọi cổng khác chặn (gồm 7880, 5432, 6379, 9090, 3001):

```bash
ufw default deny incoming
ufw allow 22/tcp
ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw allow 7881/tcp && ufw allow 7882/udp
ufw allow 3478/udp && ufw allow 5349/tcp
ufw enable
```

> Docker tự thêm luật iptables cho các cổng được publish, nên chúng đi vòng qua ufw. Vì vậy compose chỉ publish 80/443, còn Prometheus và Grafana chỉ bind `127.0.0.1`. LiveKit chạy ở mạng host nên ufw chặn được cổng 7880 của nó.

**Object storage** (ví dụ Cloudflare R2). Tạo hai bucket:

- `olympia-media`: media câu hỏi. Bật CORS cho `https://APP_DOMAIN` với phương thức `GET` và `PUT`, header `Content-Type`.
- `olympia-backups`: bản sao lưu DB. Riêng tư, không bật truy cập công khai.

Tạo access key riêng cho từng bucket, mỗi key chỉ có quyền trên bucket của nó.

## 3. Triển khai lần đầu

```bash
git clone <repo> olympia && cd olympia/deploy
cp .env.example .env
chmod 600 .env
# Điền .env: tên miền, mật khẩu, khóa (openssl rand -base64 48), S3, SMTP, sao lưu.
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Sau khi khởi động:

1. Mở `https://APP_DOMAIN`, đăng ký tài khoản quản trị và xác minh email.
2. Cấp quyền Super Admin:

   ```bash
   docker compose -f docker-compose.prod.yml exec api node dist/scripts/grant-super-admin.js admin@example.vn
   ```

3. Kiểm tra `https://APP_DOMAIN/api/health/ready`: kết quả phải là `ok` cho cả database, Redis và object storage.
4. Lần đầu khởi động, Caddy cần vài phút để lấy chứng chỉ cho `TURN_DOMAIN`. Trong lúc đó LiveKit có thể khởi động lại vài lần, như vậy là bình thường. Kiểm tra bằng `docker compose logs livekit`.
5. Thử gọi video: tạo phòng, cho 2 người chơi vào từ 2 thiết bị, trong đó một thiết bị dùng 4G. Đây là bước thử còn treo từ P6.

## 4. Cập nhật phiên bản và quay lui

```bash
cd olympia && git pull
cd deploy
RELEASE=$(git rev-parse --short HEAD) docker compose -f docker-compose.prod.yml up -d --build
```

- Migration chạy tự động trước khi API khởi động. Nếu migration lỗi, API cũ vẫn chạy; xem lỗi bằng `docker compose logs migrate`.
- Trận đang chạy không bị mất khi API khởi động lại: trạng thái được lưu ở PostgreSQL và Redis (DL-013), người chơi tự kết nối lại. Dù vậy, nên cập nhật vào lúc ít trận.
- Quay lui: `git checkout <phiên bản trước>` rồi chạy lại lệnh `up`. Nếu phiên bản mới có migration, chạy `docker compose -f docker-compose.prod.yml run --rm migrate node dist/infrastructure/database/run-migrations.js down` trước, mỗi lần chạy hoàn tác một migration. Luôn sao lưu trước khi làm việc này (mục 6).

## 5. Mở rộng

- **Nhiều instance API:**

  ```bash
  docker compose -f docker-compose.prod.yml up -d --scale api=2
  ```

  Caddy tự phát hiện các instance (`dynamic a`), Socket.IO đồng bộ qua Redis adapter, mỗi trận do một instance giữ và tự chuyển sang instance khác nếu instance đó chết (đã kiểm thử, mục 8.2).
- **Pool kết nối DB:** `DATABASE_POOL_SIZE` (mặc định 20) là số kết nối cho mỗi instance. Tổng số kết nối của mọi instance phải nhỏ hơn `max_connections` của PostgreSQL (mặc định 100).
- **Video:** khi băng thông VPS không đủ, tách LiveKit sang VPS riêng. Đặt `LIVEKIT_DOMAIN` và `TURN_DOMAIN` trỏ về VPS mới, đổi `LIVEKIT_API_URL` của API sang `https://LIVEKIT_DOMAIN`.

## 6. Sao lưu và khôi phục

- Dịch vụ `backup` chạy `pg_dump` theo lịch `BACKUP_CRON` (giờ UTC; mặc định `0 19 * * *`, tức 02:00 giờ Việt Nam), tải bản dump lên `BACKUP_S3_BUCKET/BACKUP_S3_PREFIX` và xóa bản cũ hơn `BACKUP_RETENTION_DAYS` ngày.
- Sao lưu ngay (trước khi cập nhật):

  ```bash
  docker compose -f docker-compose.prod.yml exec backup backup.sh
  ```

- **Khôi phục:**

  ```bash
  docker compose -f docker-compose.prod.yml stop api caddy
  docker compose -f docker-compose.prod.yml run --rm --entrypoint /bin/sh -v ./backup:/scripts backup \
    /scripts/restore.sh olympia-YYYYMMDDTHHMMSSZ.dump
  docker compose -f docker-compose.prod.yml up -d
  ```

  Lấy danh sách bản sao lưu: `docker compose -f docker-compose.prod.yml exec backup sh -c 'aws --endpoint-url $BACKUP_S3_ENDPOINT s3 ls s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/'`.
- Redis không cần sao lưu, nhưng có bật AOF. Nếu mất Redis, trận đang chạy được khôi phục từ checkpoint trong PostgreSQL (DL-013).
- Nên diễn tập khôi phục mỗi quý vào một database tạm. Quy trình này đã được thử khi nghiệm thu P8.

## 7. Giám sát và cảnh báo

- Mở Grafana qua SSH tunnel:

  ```bash
  ssh -L 3001:127.0.0.1:3001 user@vps
  ```

  Sau đó vào `http://localhost:3001` (tài khoản `admin` / `GRAFANA_ADMIN_PASSWORD`). Dashboard **Olympia – Tổng quan vận hành** hiển thị phòng đang hoạt động, trận đang chạy, kết nối realtime, độ trễ REST, tỉ lệ lỗi, event loop, bộ nhớ, lỗi giao diện và log lỗi của API.
- Luật cảnh báo nằm trong [`deploy/monitoring/alerts.yml`](../deploy/monitoring/alerts.yml): API không phản hồi, REST p95 > 1 giây, lỗi 5xx > 2%, event loop p99 > 200 ms, lỗi giao diện tăng đột biến. Để nhận thông báo, vào Grafana mục **Alerting → Contact points**, thêm email hoặc Telegram, rồi tạo luật cảnh báo trong Grafana với cùng biểu thức.
- Log: Grafana → Explore → Loki, ví dụ `{service="api", level="50"}` để lọc lỗi (theo mức của Pino: 40 là cảnh báo, 50 là lỗi). Log không chứa mật khẩu, token hay cookie (đã che).
- Kiểm tra uptime từ bên ngoài, ví dụ UptimeRobot: gọi `https://APP_DOMAIN/api/health/ready` mỗi phút. Chỉ tiêu là 99,5% mỗi tháng (DL-009).

## 8. Kiểm thử tải và khôi phục (nghiệm thu, DL-052)

Chạy trên **staging** (cấu hình giống production). Không chạy trên production đang phục vụ người dùng.

### 8.1. Kiểm thử tải

Trên staging, đặt `API_RATE_LIMIT_PER_MINUTE=0` và `MAX_ACTIVE_ROOMS_PER_HOST=5`. Chạy từ một hoặc nhiều máy **khác** VPS. Mỗi máy nên tạo khoảng 2.000 kết nối.

```bash
# Tạo tài khoản Host kiểm thử (cần truy cập DB: chạy trong container api hoặc qua SSH tunnel)
npm run load:test -w @olympia/api -- --target=https://staging.example.vn \
  --rooms=70 --players=4 --spectators=24 --questions=5 \
  --database-url=postgres://olympia:<pw>@localhost:5432/olympia --output=load-1.json
```

- Mỗi phòng có `1 + players + spectators` kết nối. Với 3 máy chạy 70 phòng × 29 kết nối, tổng là khoảng 210 phòng và 6.000 kết nối. Cách đặt này thỏa chỉ tiêu ≥ 200 phòng và ≥ 5.000 kết nối.
- Đạt khi `passed: true`: mọi phòng hoàn tất, không lỗi, `syncMs.p95 ≤ 300`. Lưu các file JSON kết quả vào biên bản nghiệm thu.
- Mỗi phòng vào tối đa 15 người/phút/IP (DL-055), nên công cụ tự chờ khi có nhiều khán giả. Giai đoạn vào phòng vì vậy kéo dài vài phút.
- Video (≤ 500 ms, ≥ 100 phòng có video) không nằm trong công cụ này. Phải đo bằng thiết bị thật, hoặc bằng `lk load-test` của LiveKit CLI trỏ vào `LIVEKIT_DOMAIN`.

### 8.2. Kiểm thử khôi phục khi tắt instance

```bash
npm run load:recovery -w @olympia/api   # cần PostgreSQL + Redis (npm run services:up)
```

Công cụ tự khởi động 2 instance API, mở trận trên instance A, tắt cứng A khi đồng hồ đang chạy, rồi cho mọi client kết nối lại vào B. Đạt khi điểm giữ nguyên, Host điều khiển tiếp được và thời gian khôi phục ≤ 30 giây. Trên staging có thể diễn tập thêm bằng tay: `docker kill <container api>` khi đang có trận, rồi quan sát dashboard và màn chơi.

## 9. Xử lý sự cố

| Triệu chứng | Kiểm tra | Xử lý |
| ----------- | -------- | ----- |
| Trang trắng hoặc lỗi chứng chỉ | `docker compose logs caddy` | Kiểm tra DNS trỏ đúng IP, cổng 80/443 đã mở. |
| `/api/health/ready` báo lỗi | Trường lỗi trong JSON trả về | Database/Redis: `docker compose ps`; object storage: khóa và endpoint `S3_*`. |
| Video không kết nối, chỉ hiện ảnh đại diện | `docker compose logs livekit`; cổng 7881/7882/3478/5349 | Trận vẫn chạy bình thường (BR-AV-02). Kiểm tra firewall và chứng chỉ TURN. |
| Người chơi bị "Mất kết nối" hàng loạt | Grafana: kết nối realtime, event loop | Instance API quá tải: tăng số instance (mục 5). |
| Nhiều lỗi 429 ở một trường học | Log `TOO_MANY_REQUESTS` | Cả trường dùng chung IP NAT: tăng `API_RATE_LIMIT_PER_MINUTE`. |
| Đĩa đầy | `df -h`, `docker system df` | Log Docker giới hạn 5 × 20 MB mỗi container; Loki giữ 30 ngày, Prometheus 30 ngày. Dọn image cũ bằng `docker image prune`. |

Cần đóng phòng vi phạm: Super Admin/Manager vào `/quan-tri/phong`, chọn **Vào giám sát** hoặc **Đóng phòng**. Mọi thao tác được ghi vào nhật ký quản trị.

## 10. Bảo mật vận hành

- `deploy/.env` chỉ để quyền 600 và không bao giờ commit. Đổi khóa ngay nếu nghi bị lộ: đổi `JWT_SECRET` sẽ đăng xuất mọi người; đổi `LIVEKIT_API_SECRET` thì khởi động lại `api` và `livekit`.
- Đăng nhập SSH bằng khóa, tắt đăng nhập bằng mật khẩu, bật cập nhật bảo mật tự động (`unattended-upgrades`).
- Chạy `npm audit --omit=dev` trước mỗi lần phát hành (kết quả nghiệm thu P8: 0 lỗ hổng).
- Chính sách quyền riêng tư phải được rà soát pháp lý trước khi mở cho người dùng thật (BR-DATA-06).
