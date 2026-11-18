# DECISION LOG – OLYMPIA ONLINE

> Nhật ký các quyết định nghiệp vụ, kiến trúc và công nghệ của dự án. Mỗi quyết định có mã `DL-xxx`, không xóa hay đánh số lại; khi đổi ý, thêm quyết định mới và đánh dấu quyết định cũ là **Bị thay thế**.
>
> Tài liệu liên quan: [Đặc tả nghiệp vụ](dac-ta-nghiep-vu-olympia.md) · [Công nghệ sử dụng](cong-nghe-su-dung.md) · [Kế hoạch triển khai](ke-hoach-trien-khai.md)

**Trạng thái:**

| Trạng thái       | Ý nghĩa                                                         |
| ---------------- | --------------------------------------------------------------- |
| Đã chấp nhận     | Đã chốt, áp dụng khi triển khai.                                |
| Đề xuất          | Đã có phương án, chờ Product Owner / nhóm kỹ thuật xác nhận.    |
| Chưa quyết định  | Đã xác định cần quyết định, chưa có phương án.                  |
| Bị thay thế      | Không còn hiệu lực; ghi rõ quyết định thay thế.                 |

---

## 1. Danh sách quyết định

| Mã     | Ngày       | Nhóm       | Quyết định                                                                 | Trạng thái      |
| ------ | ---------- | ---------- | -------------------------------------------------------------------------- | --------------- |
| DL-001 | 2026-11-18 | Nghiệp vụ  | Cho phép khách (Guest) làm Player và Spectator                             | Đã chấp nhận         |
| DL-002 | 2026-11-18 | Nghiệp vụ  | Mọi tài khoản đã xác minh email đều là Host                                 | Đã chấp nhận         |
| DL-003 | 2026-11-18 | Nghiệp vụ  | Luật vòng thi dạng preset, không bám một phiên bản luật chính thức         | Đã chấp nhận         |
| DL-004 | 2026-11-18 | Nghiệp vụ  | Hỗ trợ cả nhập trên thiết bị và trả lời bằng lời; mặc định nhập trên thiết bị | Đã chấp nhận      |
| DL-005 | 2026-11-18 | Nghiệp vụ  | Phạm vi Manager theo Tổ chức                                               | Đã chấp nhận    |
| DL-006 | 2026-11-18 | Nghiệp vụ  | Bắt buộc kiểm duyệt bộ câu hỏi public trước khi hiển thị                   | Đề xuất         |
| DL-007 | 2026-11-18 | Nghiệp vụ  | Spectator xem video Host; giới hạn số Spectator mỗi phòng                  | Đề xuất         |
| DL-008 | 2026-11-18 | Nghiệp vụ  | Không ghi hình ở phiên bản đầu; có chính sách dữ liệu cá nhân              | Đề xuất         |
| DL-009 | 2026-11-18 | Nghiệp vụ  | Chỉ tiêu phi chức năng phiên bản đầu, nghiệm thu bằng kiểm thử tải         | Đề xuất         |
| DL-010 | 2026-11-18 | Kiến trúc  | Modular monolith với 4 module tách biệt                                    | Đã chấp nhận    |
| DL-011 | 2026-11-18 | Kiến trúc  | Server là nguồn sự thật cho trạng thái, thời gian và điểm                  | Đã chấp nhận    |
| DL-012 | 2026-11-18 | Kiến trúc  | Luật vòng thi là plugin của Game Engine                                    | Đã chấp nhận    |
| DL-013 | 2026-11-18 | Kiến trúc  | Mỗi trận do một instance sở hữu; trạng thái nóng trong Redis               | Đề xuất         |
| DL-014 | 2026-11-18 | Kiến trúc  | Audio/video qua SFU riêng, độc lập kênh trạng thái trận                    | Đề xuất         |
| DL-015 | 2026-11-18 | Kiến trúc  | Phân quyền ở backend cho mọi REST và sự kiện realtime                      | Đã chấp nhận    |
| DL-016 | 2026-11-18 | Công nghệ  | Stack lõi: Node.js/Express/TS, PostgreSQL/TypeORM, Redis, React/Vite/Tailwind | Đã chấp nhận |
| DL-017 | 2026-11-18 | Công nghệ  | Monorepo dùng npm workspaces                                               | Đã chấp nhận    |
| DL-018 | 2026-11-18 | Công nghệ  | Realtime dùng Socket.IO + Redis adapter                                    | Đã chấp nhận    |
| DL-019 | 2026-11-18 | Công nghệ  | SFU dùng LiveKit tự host                                                   | Đề xuất         |
| DL-020 | 2026-11-18 | Công nghệ  | Validation dùng Zod, chia sẻ qua `packages/shared`                         | Đã chấp nhận    |
| DL-021 | 2026-11-18 | Công nghệ  | Xác thực JWT ngắn hạn + refresh token xoay vòng trong cookie HttpOnly      | Đã chấp nhận    |
| DL-022 | 2026-11-18 | Công nghệ  | Test runner frontend dùng Vitest                                           | Đã chấp nhận    |
| DL-023 | –          | Hạ tầng    | Nơi triển khai production                                                  | Chưa quyết định |
| DL-024 | –          | Hạ tầng    | Object storage và CDN production                                           | Chưa quyết định |
| DL-025 | 2026-11-18 | Hạ tầng    | Object storage S3-compatible cho môi trường dev (thay MinIO)               | Chưa quyết định |

---

## 2. Quyết định nghiệp vụ

### DL-001 – Cho phép khách làm Player và Spectator

- **Bối cảnh:** Đặc tả Q1. Đối tượng chính là gia đình, bạn bè, học sinh; bắt buộc đăng ký làm tăng rào cản khi tham gia.
- **Quyết định:** Khách vào phòng bằng mã/link và tên hiển thị, làm được Player hoặc Spectator nếu phòng bật "Cho phép khách" (mặc định bật). Khách có phiên khách 24 giờ để kết nối lại, không có lịch sử lâu dài, không làm Host, không gửi báo cáo vi phạm.
- **Phương án đã cân nhắc:** Chỉ cho khách làm Spectator (an toàn hơn nhưng giảm trải nghiệm); bắt buộc tài khoản (kiểm soát tốt nhất, rào cản cao nhất).
- **Hệ quả:** Cần cơ chế phiên khách riêng; kết quả trận lưu tên hiển thị thay vì liên kết tài khoản. Rủi ro phá phòng công khai, giảm thiểu bằng Host duyệt và kick/ban. Có thể cân nhắc mặc định tắt khách với phòng công khai.
- **Liên quan:** 3.1, BR-AUTH-05, BR-AUTH-06, 4.1, BR-DATA-04.

### DL-002 – Mọi tài khoản đã xác minh email đều là Host

- **Bối cảnh:** Đặc tả Q2. Mục tiêu G1 là ai cũng tự tổ chức được sân chơi.
- **Quyết định:** Tài khoản đăng ký mặc định có vai trò Host, nhưng chỉ tạo phòng/câu hỏi được sau khi xác minh email. Super Admin thu hồi được quyền Host.
- **Phương án đã cân nhắc:** Chỉ tài khoản được cấp quyền mới làm Host (kiểm soát tốt, nhưng cần quy trình cấp quyền thủ công).
- **Hệ quả:** Cần giới hạn số phòng mỗi Host (BR-ROOM-03) và rate limit để chống lạm dụng.
- **Liên quan:** BR-AUTH-01.

### DL-003 – Luật vòng thi dạng preset

- **Bối cảnh:** Đặc tả Q3. Luật gameshow truyền hình thay đổi theo mùa; sản phẩm cần linh hoạt.
- **Quyết định:** Luật mặc định lấy cảm hứng từ format truyền hình, không bám một phiên bản chính thức. Cung cấp dưới dạng preset; Host chọn preset rồi chỉnh mọi thông số.
- **Hệ quả:** Thông số luật phải lưu dạng cấu hình có schema, không hard-code. Thêm preset mới không cần sửa engine.
- **Liên quan:** Mục 7, BR-ROUND-00, DL-012.

### DL-004 – Hai hình thức trả lời

- **Bối cảnh:** Đặc tả Q4. Trả lời bằng lời giống gameshow thật, nhưng không chấm tự động được.
- **Quyết định:** Phần thi theo lượt (Khởi động – thi riêng, Về đích) cấu hình theo vòng: nhập trên thiết bị (mặc định) hoặc trả lời bằng lời (Host chấm). Phần thi cùng trả lời luôn nhập trên thiết bị.
- **Hệ quả:** Trả lời bằng lời luôn đưa câu hỏi sang trạng thái "Chờ Host xác nhận", kể cả ở chế độ tự động. Phụ thuộc chất lượng audio.
- **Liên quan:** BR-ROUND-02, BR-GAME-05, 7.1, 7.4.

### DL-005 – Phạm vi Manager theo Tổ chức

- **Bối cảnh:** Đặc tả Q5. Đơn vị dùng thực tế là trường học, câu lạc bộ.
- **Quyết định:** Super Admin tạo tổ chức, gán người dùng (tối đa 1 tổ chức/người ở phiên bản đầu) và gán Manager cho một hoặc nhiều tổ chức. Manager quản lý tài khoản và phòng trong tổ chức mình. Kiểm duyệt bộ public không giới hạn theo tổ chức.
- **Phương án đã cân nhắc:** Theo nhóm tự do; theo danh sách người dùng gán tay (khó quản lý khi đông).
- **Hệ quả:** Cần thực thể `Organization` trong mô hình dữ liệu và kiểm tra phạm vi trong mọi API quản trị.
- **Liên quan:** 2.1, 15.2, BR-QB-10.

### DL-006 – Kiểm duyệt bắt buộc bộ câu hỏi public

- **Bối cảnh:** Đặc tả Q6. Người dùng có học sinh; nội dung public cần được kiểm soát.
- **Quyết định:** Bộ public phải được Manager/Super Admin duyệt trước khi hiển thị. Sửa bộ đã duyệt tạo phiên bản mới chờ duyệt; phiên bản cũ vẫn hiển thị.
- **Hệ quả:** Cần versioning cho bộ câu hỏi public và hàng đợi kiểm duyệt. Có độ trễ trước khi bộ mới được dùng.
- **Liên quan:** 5.4, BR-QB-09.

### DL-007 – Spectator xem video Host; giới hạn số Spectator

- **Bối cảnh:** Đặc tả Q7. Host là "người dẫn chương trình"; mỗi Spectator làm tăng tải SFU.
- **Quyết định:** Spectator xem video Host và Player, chỉ nhận, không phát. Mặc định tối đa 50 Spectator/phòng, Host chỉnh tới mức tối đa hệ thống (mặc định 200).
- **Hệ quả:** Năng lực SFU phải tính theo số Spectator tối đa.
- **Liên quan:** 4.1, 11.1, BR-AV-04.

### DL-008 – Không ghi hình; có chính sách dữ liệu cá nhân

- **Bối cảnh:** Đặc tả Q8. Ghi hình làm tăng chi phí lưu trữ và rủi ro pháp lý, nhất là với người dùng chưa thành niên.
- **Quyết định:** Không ghi hình/ghi âm ở phiên bản đầu. Áp dụng chính sách dữ liệu: xóa tài khoản trong 30 ngày với kết quả trận được ẩn danh; nhật ký giữ 12 tháng; rà soát pháp lý trước phát hành.
- **Hệ quả:** Cần job xóa/ẩn danh dữ liệu; cần văn bản chính sách quyền riêng tư.
- **Liên quan:** BR-AV-03, mục 14.1.

### DL-009 – Chỉ tiêu phi chức năng phiên bản đầu

- **Bối cảnh:** Đặc tả Q9.
- **Quyết định:** Giữ chỉ tiêu mục 16 (≤ 300 ms đồng bộ, ≥ 200 phòng, ≥ 5.000 kết nối) và bổ sung: video ≤ 500 ms, ≥ 100 phòng có video, khôi phục trận ≤ 30 giây, sẵn sàng ≥ 99,5%/tháng. Nghiệm thu bằng kiểm thử tải.
- **Hệ quả:** Cần môi trường và kịch bản kiểm thử tải trước phát hành; quy mô hạ tầng phụ thuộc DL-023.
- **Liên quan:** Mục 16, BR-NFR-01.

---

## 3. Quyết định kiến trúc

### DL-010 – Modular monolith với 4 module tách biệt

- **Bối cảnh:** Đặc tả yêu cầu tách Game Engine, Room Management, Question Bank, Realtime Communication để mở rộng sang format gameshow khác.
- **Quyết định:** Backend là một ứng dụng triển khai chung, bên trong chia module với ranh giới rõ; module chỉ gọi nhau qua interface công khai, không truy cập bảng/repository của module khác.
- **Phương án đã cân nhắc:** Microservices ngay từ đầu (phức tạp vận hành, chưa cần ở quy mô hiện tại).
- **Hệ quả:** Có thể tách service sau mà không viết lại nghiệp vụ.

### DL-011 – Server là nguồn sự thật

- **Bối cảnh:** Nhiều Player trả lời/bấm chuông đồng thời; client có thể gian lận hoặc lệch đồng hồ.
- **Quyết định:** Trạng thái trận, đồng hồ, thứ tự trả lời và điểm chỉ được tính ở server. Client hiển thị theo thời điểm kết thúc do server gửi. Mọi hành động có id để chống gửi trùng.
- **Liên quan:** BR-GAME-01…04, BR-SCORE-01, BR-RT-01…03, BR-R3-01.

### DL-012 – Luật vòng thi là plugin

- **Bối cảnh:** Host chọn vòng, thứ tự, luật; cần thêm vòng/format mới.
- **Quyết định:** Mỗi loại vòng là một module cài đặt chung interface của Game Engine (khởi tạo vòng, xử lý hành động, chấm điểm, điều kiện kết thúc). Engine không chứa logic riêng của vòng nào.
- **Liên quan:** BR-ROUND-01, DL-003.

### DL-013 – Mỗi trận do một instance sở hữu

- **Bối cảnh:** Cần mở rộng ngang nhưng vẫn xử lý tuần tự hành động trong một trận và khôi phục khi instance lỗi.
- **Quyết định:** Khóa phân phối trong Redis gán trận cho một instance; instance đó chạy đồng hồ và xử lý tuần tự. Trạng thái ghi vào Redis sau mỗi chuyển trạng thái (kèm version) và lưu bền PostgreSQL ở các mốc. Khi instance chết, instance khác lấy khóa và khôi phục.
- **Phương án đã cân nhắc:** Mọi instance cùng xử lý với khóa lạc quan trên DB (phức tạp với đồng hồ, dễ xung đột).
- **Hệ quả:** Cần cơ chế lease/heartbeat cho khóa và kiểm thử khôi phục.

### DL-014 – Audio/video qua SFU riêng

- **Bối cảnh:** BR-AV-02 yêu cầu sự cố video không làm gián đoạn trận; mesh P2P không chịu nổi 4 Player + Host + nhiều Spectator.
- **Quyết định:** Dùng SFU riêng (xem DL-019); backend chỉ cấp token theo quyền.

### DL-015 – Phân quyền ở backend

- **Quyết định:** Mọi REST endpoint và sự kiện realtime kiểm tra vai trò hệ thống, vai trò trong phòng và quyền sở hữu tài nguyên; mặc định từ chối.
- **Liên quan:** BR-ROLE-05, BR-ROLE-06, BR-SPEC-01.

---

## 4. Quyết định công nghệ

Chi tiết lý do và phương án thay thế: [cong-nghe-su-dung.md](cong-nghe-su-dung.md).

| Mã     | Quyết định                                                                                  | Phương án thay thế          | Ghi chú                                         |
| ------ | ------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------- |
| DL-016 | Node.js + Express + TypeScript, PostgreSQL + TypeORM, Redis, React + Vite + Tailwind, Jest + Supertest, RTL, Playwright, Docker | –                           | Theo CLAUDE.md và skill dự án.                  |
| DL-017 | npm workspaces                                                                              | pnpm workspaces             | Chốt ngày 2026-11-18 khi review tài liệu công nghệ. |
| DL-018 | Socket.IO + Redis adapter                                                                   | `ws` thuần                  | Điểm T1.                                        |
| DL-019 | LiveKit tự host                                                                             | mediasoup; dịch vụ cloud trả phí | Điểm T2.                                   |
| DL-020 | Zod, chia sẻ qua `packages/shared`                                                          | class-validator             | Điểm T3.                                        |
| DL-021 | JWT ngắn hạn + refresh token xoay vòng trong cookie HttpOnly                                | Session lưu Redis           | Điểm T4. Chốt ngày 2026-11-18 trước P1.         |
| DL-022 | Vitest cho frontend                                                                         | Jest                        | Điểm T5.                                        |
| DL-023 | Nơi triển khai production                                                                   | VPS tự quản / cloud / Kubernetes | Điểm T6. Cần thông tin ngân sách và quy mô. |
| DL-024 | Object storage và CDN production                                                            | –                           | Điểm T7. Phụ thuộc DL-023.                      |
| DL-025 | Object storage S3-compatible cho dev. MinIO không còn phát hành Docker image cộng đồng (kiểm tra ngày 2026-11-18), nên chưa đưa vào docker-compose ở P0. | SeaweedFS, Garage, LocalStack | Cần chốt trước P2 (upload media). Nên chọn cùng lúc với DL-024. |

---

## 5. Mẫu ghi quyết định mới

```markdown
### DL-xxx – <Tên quyết định>

- **Ngày / Người quyết định:**
- **Trạng thái:** Đề xuất | Đã chấp nhận | Chưa quyết định | Bị thay thế bởi DL-yyy
- **Bối cảnh:** Vấn đề cần giải quyết, ràng buộc.
- **Quyết định:** Nội dung đã chọn.
- **Phương án đã cân nhắc:** Các lựa chọn khác và lý do không chọn.
- **Hệ quả:** Ảnh hưởng tới thiết kế, chi phí, rủi ro.
- **Liên quan:** Mục/BR trong đặc tả, quyết định khác.
```

Sau khi thêm, cập nhật bảng ở mục 1.
