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
| DL-006 | 2026-11-18 | Nghiệp vụ  | Bắt buộc kiểm duyệt bộ câu hỏi public trước khi hiển thị                   | Đã chấp nhận    |
| DL-007 | 2026-11-18 | Nghiệp vụ  | Spectator xem video Host; giới hạn số Spectator mỗi phòng                  | Đã chấp nhận    |
| DL-008 | 2026-11-18 | Nghiệp vụ  | Không ghi hình ở phiên bản đầu; có chính sách dữ liệu cá nhân              | Đã chấp nhận    |
| DL-009 | 2026-11-18 | Nghiệp vụ  | Chỉ tiêu phi chức năng phiên bản đầu, nghiệm thu bằng kiểm thử tải         | Đã chấp nhận    |
| DL-010 | 2026-11-18 | Kiến trúc  | Modular monolith với 4 module tách biệt                                    | Đã chấp nhận    |
| DL-011 | 2026-11-18 | Kiến trúc  | Server là nguồn sự thật cho trạng thái, thời gian và điểm                  | Đã chấp nhận    |
| DL-012 | 2026-11-18 | Kiến trúc  | Luật vòng thi là plugin của Game Engine                                    | Đã chấp nhận    |
| DL-013 | 2026-11-19 | Kiến trúc  | Trạng thái trận nóng trong Redis, xử lý tuần tự bằng mutex; lease cho đồng hồ dự phòng | Đã chấp nhận    |
| DL-014 | 2026-11-18 | Kiến trúc  | Audio/video qua SFU riêng, độc lập kênh trạng thái trận                    | Đã chấp nhận    |
| DL-015 | 2026-11-18 | Kiến trúc  | Phân quyền ở backend cho mọi REST và sự kiện realtime                      | Đã chấp nhận    |
| DL-016 | 2026-11-18 | Công nghệ  | Stack lõi: Node.js/Express/TS, PostgreSQL/TypeORM, Redis, React/Vite/Tailwind | Đã chấp nhận |
| DL-017 | 2026-11-18 | Công nghệ  | Monorepo dùng npm workspaces                                               | Đã chấp nhận    |
| DL-018 | 2026-11-18 | Công nghệ  | Realtime dùng Socket.IO + Redis adapter                                    | Đã chấp nhận    |
| DL-019 | 2026-11-18 | Công nghệ  | SFU dùng LiveKit tự host                                                   | Đã chấp nhận    |
| DL-020 | 2026-11-18 | Công nghệ  | Validation dùng Zod, chia sẻ qua `packages/shared`                         | Đã chấp nhận    |
| DL-021 | 2026-11-18 | Công nghệ  | Xác thực JWT ngắn hạn + refresh token xoay vòng trong cookie HttpOnly      | Đã chấp nhận    |
| DL-022 | 2026-11-18 | Công nghệ  | Test runner frontend dùng Vitest                                           | Đã chấp nhận    |
| DL-023 | 2026-11-19 | Hạ tầng    | Production: VPS + Docker Compose, reverse proxy HTTPS                      | Đã chấp nhận    |
| DL-024 | 2026-11-19 | Hạ tầng    | Media production: object storage S3-compatible thuê ngoài + CDN           | Đã chấp nhận    |
| DL-025 | 2026-11-18 | Hạ tầng    | Object storage S3-compatible cho môi trường dev: SeaweedFS                 | Đã chấp nhận    |
| DL-026 | 2026-11-18 | Kiến trúc  | Sảnh chờ: thao tác qua REST, trạng thái phòng đẩy xuống qua Socket.IO      | Đã chấp nhận    |
| DL-027 | 2026-11-18 | Nghiệp vụ  | Link mời là mã phòng; "tạo link mới" = đổi mã phòng                        | Đã chấp nhận    |
| DL-028 | 2026-11-18 | Nghiệp vụ  | Phiên khách gắn với một phòng                                              | Đã chấp nhận    |
| DL-029 | 2026-11-18 | Nghiệp vụ  | Mất kết nối ở sảnh chờ cũng giữ chỗ 120 giây                               | Đã chấp nhận    |
| DL-030 | 2026-11-18 | Nghiệp vụ  | Định nghĩa "phòng không hoạt động" để tự đóng                              | Đã chấp nhận    |
| DL-031 | 2026-11-18 | Kiến trúc  | Giới hạn hệ thống của phòng lấy từ biến môi trường cho tới P7              | Đã chấp nhận    |
| DL-032 | 2026-11-18 | Nghiệp vụ  | Danh sách phòng công khai đơn giản trên trang Vào phòng                    | Đã chấp nhận    |
| DL-033 | 2026-11-18 | Kiến trúc  | Chia sẻ public bằng phiên bản snapshot của bộ đề                           | Đã chấp nhận    |
| DL-034 | 2026-11-18 | Nghiệp vụ  | Câu hỏi = dạng đáp án + media tùy chọn                                     | Đã chấp nhận    |
| DL-035 | 2026-11-18 | Kiến trúc  | Upload media trực tiếp lên object storage qua presigned URL                | Đã chấp nhận    |
| DL-036 | 2026-11-18 | Nghiệp vụ  | Màn kiểm duyệt bộ public làm ở P2 (board Moderation ghi P7)                | Đã chấp nhận    |
| DL-037 | 2026-11-19 | Nghiệp vụ  | Kịch bản là tài nguyên dùng lại của Host; phòng tham chiếu kịch bản        | Đã chấp nhận    |
| DL-038 | 2026-11-19 | Nghiệp vụ  | P4 chỉ mở vòng Khởi động và chế độ thủ công                                | Bị thay thế (DL-041) |
| DL-039 | 2026-11-19 | Nghiệp vụ  | Chế độ thủ công: Host xác nhận mọi câu, hệ thống chỉ gợi ý kết quả chấm    | Đã chấp nhận    |
| DL-040 | 2026-11-19 | Nghiệp vụ  | Câu hỏi của vòng = câu xếp vào nhóm vòng đó trong bộ đề; câu dư là dự phòng | Đã chấp nhận    |
| DL-041 | 2026-11-19 | Nghiệp vụ  | Vượt chướng ngại vật: thứ tự câu trong bộ đề, đoán từ khóa bằng chuông + nhập chữ | Đã chấp nhận    |
| DL-042 | 2026-11-19 | Nghiệp vụ  | Câu cùng trả lời (hàng ngang, Tăng tốc): Host chấm từng người rồi công bố   | Đã chấp nhận    |
| DL-043 | 2026-11-19 | Nghiệp vụ  | Về đích: câu theo "Điểm mặc định", sao đặt khi chọn gói, giành quyền 1 lượt | Đã chấp nhận    |
| DL-044 | 2026-11-19 | Nghiệp vụ  | Câu hỏi phụ dùng câu chưa dùng của trận; không cộng điểm                  | Đã chấp nhận    |
| DL-045 | 2026-11-19 | Kiến trúc  | Chế độ tự động: plugin tự đi bước kế qua đồng hồ `auto`, engine nghỉ giữa vòng | Đã chấp nhận    |
| DL-046 | 2026-11-19 | Nghiệp vụ  | Video/voice: kết nối từ sảnh chờ, quyền nói theo engine, khóa mic do server áp | Đã chấp nhận    |
| DL-047 | 2026-11-19 | Kiến trúc  | Lưu câu đã dùng và kết quả theo ghế khi rời vòng (tóm tắt của plugin)      | Đã chấp nhận    |
| DL-048 | 2026-11-19 | Nghiệp vụ  | Công bố đáp án sau trận: thiết lập kịch bản, Host bật/tắt từng trận       | Đã chấp nhận    |
| DL-049 | 2026-11-19 | Nghiệp vụ  | Cấu hình hệ thống lưu DB, Super Admin sửa trên web, áp dụng ngay          | Đã chấp nhận    |
| DL-050 | 2026-11-19 | Nghiệp vụ  | Báo cáo vi phạm: cảnh báo qua email, chặn phiên khách, phạm vi Manager    | Đã chấp nhận    |
| DL-051 | 2026-11-20 | Nghiệp vụ  | Giám sát phòng: nhân viên vào ẩn danh, xem như khán giả, đóng phòng tại chỗ | Đề xuất         |

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
- **Quyết định (chốt 2026-11-19):** Bộ public phải được Manager/Super Admin duyệt trước khi hiển thị. Sửa bộ đã duyệt tạo phiên bản mới chờ duyệt; phiên bản cũ vẫn hiển thị.
- **Hệ quả:** Cần versioning cho bộ câu hỏi public và hàng đợi kiểm duyệt. Có độ trễ trước khi bộ mới được dùng.
- **Liên quan:** 5.4, BR-QB-09.

### DL-007 – Spectator xem video Host; giới hạn số Spectator

- **Bối cảnh:** Đặc tả Q7. Host là "người dẫn chương trình"; mỗi Spectator làm tăng tải SFU.
- **Quyết định:** Spectator xem video Host và Player, chỉ nhận, không phát. Mặc định tối đa 50 Spectator/phòng, Host chỉnh tới mức tối đa hệ thống (mặc định 200).
- **Hệ quả:** Năng lực SFU phải tính theo số Spectator tối đa.
- **Liên quan:** 4.1, 11.1, BR-AV-04.
- **Cập nhật 2026-11-19 (P6):** Product Owner xác nhận như trên (khán giả xem video cả Host và Player).

### DL-008 – Không ghi hình; có chính sách dữ liệu cá nhân

- **Bối cảnh:** Đặc tả Q8. Ghi hình làm tăng chi phí lưu trữ và rủi ro pháp lý, nhất là với người dùng chưa thành niên.
- **Quyết định:** Không ghi hình/ghi âm ở phiên bản đầu. Áp dụng chính sách dữ liệu: xóa tài khoản trong 30 ngày với kết quả trận được ẩn danh; nhật ký giữ 12 tháng; rà soát pháp lý trước phát hành.
- **Chốt (2026-11-19, Product Owner):** Xóa tài khoản có **ân hạn 30 ngày**: người dùng xác nhận bằng mật khẩu (`POST /api/auth/delete-account`) → trạng thái `pending_deletion`, thu hồi mọi phiên, không đăng nhập được (lỗi `ACCOUNT_PENDING_DELETION`), email gửi liên kết "Giữ lại tài khoản" (`/giu-tai-khoan`, token `cancel_deletion` hiệu lực 30 ngày). Hết ân hạn, job bảo trì dữ liệu (mỗi giờ, khóa Redis) xóa email/ảnh/hồ sơ (`status = deleted`), bỏ phân công Manager và đổi tên trong lịch sử trận, danh sách người tham gia, báo cáo thành "Người chơi đã xóa"/"Người dùng đã xóa". Cùng job xóa nhật ký quản trị và nhật ký can thiệp quá 12 tháng.
- **Hệ quả:** Cần văn bản chính sách quyền riêng tư và rà soát pháp lý trước phát hành (P8, BR-DATA-06).
- **Liên quan:** BR-AV-03, mục 14.1.

### DL-009 – Chỉ tiêu phi chức năng phiên bản đầu

- **Bối cảnh:** Đặc tả Q9.
- **Quyết định (chốt 2026-11-19):** Giữ chỉ tiêu mục 16 (≤ 300 ms đồng bộ, ≥ 200 phòng, ≥ 5.000 kết nối) và bổ sung: video ≤ 500 ms, ≥ 100 phòng có video, khôi phục trận ≤ 30 giây, sẵn sàng ≥ 99,5%/tháng. Nghiệm thu bằng kiểm thử tải.
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

### DL-013 – Trạng thái trận trong Redis, xử lý tuần tự, lease cho đồng hồ

- **Bối cảnh:** Cần mở rộng ngang nhưng vẫn xử lý tuần tự hành động trong một trận và khôi phục khi instance lỗi.
- **Quyết định (chốt 2026-11-19, thay bản đề xuất "chỉ instance sở hữu xử lý"):** Mọi instance đều nhận hành động của trận; mỗi đầu vào được xử lý tuần tự dưới mutex Redis theo trận (trong instance thêm hàng đợi FIFO để giữ thứ tự nhận). Game Engine là reducer thuần; kết quả (câu trả lời, sổ điểm, nhật ký can thiệp, checkpoint trạng thái) ghi PostgreSQL trong một transaction, rồi ghi trạng thái (kèm version) vào Redis. Đồng hồ: instance xử lý đặt `setTimeout` cục bộ, sự kiện hết giờ idempotent theo id đồng hồ. Instance giữ **lease** của trận (gia hạn định kỳ) quét để kích hoạt đồng hồ quá hạn khi instance đặt nó đã chết và kết thúc trận khi Host mất kết nối quá hạn. Redis mất dữ liệu thì khôi phục từ checkpoint PostgreSQL; khởi động lại thì nạp lại các trận đang diễn ra.
- **Phương án đã cân nhắc:** (1) Chỉ instance sở hữu xử lý, instance khác chuyển tiếp qua Redis pub/sub – thêm một bước nhảy và cơ chế request/reply; (2) khóa lạc quan trên DB – phức tạp với đồng hồ.
- **Hệ quả:** Không cần chuyển tiếp lệnh giữa instance. Checkpoint PostgreSQL ghi ở mọi chuyển trạng thái (tần suất thấp), chặt hơn yêu cầu "ở các mốc". Hành động có `actionId` do client sinh; kết quả lưu Redis 10 phút để trả lại khi gửi trùng (BR-GAME-03).

### DL-014 – Audio/video qua SFU riêng

- **Bối cảnh:** BR-AV-02 yêu cầu sự cố video không làm gián đoạn trận; mesh P2P không chịu nổi 4 Player + Host + nhiều Spectator.
- **Quyết định:** Dùng SFU riêng (xem DL-019); backend chỉ cấp token theo quyền.
- **Cập nhật 2026-11-19 (P6):** Product Owner xác nhận; triển khai ở module `av` (DL-046).

### DL-015 – Phân quyền ở backend

- **Quyết định:** Mọi REST endpoint và sự kiện realtime kiểm tra vai trò hệ thống, vai trò trong phòng và quyền sở hữu tài nguyên; mặc định từ chối.
- **Liên quan:** BR-ROLE-05, BR-ROLE-06, BR-SPEC-01.

### DL-026 – Sảnh chờ: thao tác qua REST, trạng thái qua Socket.IO

- **Bối cảnh:** P3 cần đồng bộ sảnh chờ realtime; thao tác sảnh chờ (vào phòng, duyệt, xếp ghế, kick/ban, Sẵn sàng) không cần độ trễ thấp như trả lời/bấm chuông.
- **Quyết định:** Thao tác sảnh chờ là REST endpoint (dùng chung middleware phân quyền, dễ test). Mỗi thay đổi tăng `state_version` của phòng trong cùng transaction và server phát lại toàn bộ trạng thái phòng qua Socket.IO (bản cho Host đầy đủ hơn bản cho người chơi/khán giả). Socket dùng để nhận trạng thái, theo dõi online/mất kết nối và gửi reaction. Hành động trong trận (P4) đi qua socket có ack.
- **Hệ quả:** Client bỏ qua bản trạng thái có version cũ hơn (BR-RT-03); kết nối lại chỉ cần đăng ký lại phòng để nhận trạng thái hiện tại (BR-RC-02).
- **Liên quan:** Mục 4.4, 10, 12, DL-018.

### DL-027 – Link mời là mã phòng

- **Bối cảnh:** Đặc tả 4.1: link mời chứa mã phòng; Host tạo lại link để vô hiệu link cũ.
- **Quyết định:** Link mời có dạng `/vao-phong/<mã>`. "Tạo link mới" sinh mã phòng mới; mã cũ hết hiệu lực. Mã 6 ký tự chữ-số, bỏ ký tự dễ nhầm (0/O, 1/I/L), duy nhất trong các phòng đang hoạt động.
- **Hệ quả:** Không cần token mời riêng. Người đã ở trong phòng không bị ảnh hưởng khi đổi mã.

### DL-028 – Phiên khách gắn với một phòng

- **Bối cảnh:** BR-AUTH-05: phiên khách chỉ có hiệu lực trong phòng đã vào.
- **Quyết định:** Khách được cấp phiên khi vào phòng; phiên (cookie 24 giờ) và access token mang mã phòng. Khách vào phòng khác được cấp danh tính khách mới.
- **Hệ quả:** Mọi thao tác của khách được kiểm tra đúng phòng; khách không thể dùng một phiên để đi qua nhiều phòng.

### DL-029 – Mất kết nối ở sảnh chờ giữ chỗ 120 giây

- **Bối cảnh:** BR-RC-01 chỉ nói rõ trường hợp đang thi.
- **Quyết định:** Ở sảnh chờ, người mất kết nối cũng được giữ ghế/vai trò trong thời gian chờ (mặc định 120 giây, cùng giá trị BR-RC-01); hết thời gian thì xem như rời phòng và ghế được giải phóng. Mọi người thấy trạng thái "Mất kết nối".

### DL-030 – Phòng không hoạt động

- **Bối cảnh:** BR-ROOM-02: phòng Open không hoạt động 60 phút tự đóng.
- **Quyết định:** "Không hoạt động" là không có thao tác nào trong phòng (vào phòng, duyệt, xếp ghế, Sẵn sàng, đổi cấu hình...) trong 60 phút **và** không ai đang kết nối vào phòng.

### DL-031 – Giới hạn hệ thống của phòng lấy từ biến môi trường

- **Bối cảnh:** BR-ROOM-03 và 4.1 cho phép Super Admin cấu hình giới hạn; trang cấu hình hệ thống thuộc P7.
- **Quyết định:** Tới P7, các giới hạn đọc từ biến môi trường: số phòng đang mở tối đa mỗi Host (5), số khán giả tối đa mỗi phòng (200), thời gian giữ chỗ khi mất kết nối (120 giây), thời gian phòng không hoạt động (60 phút).

### DL-032 – Danh sách phòng công khai

- **Bối cảnh:** Mục 4.2 yêu cầu phòng công khai hiển thị trong danh sách; canvas thiết kế chưa có màn riêng.
- **Quyết định:** Có API danh sách phòng công khai đang mở và một danh sách đơn giản trên trang Vào phòng, theo nền tảng giao diện (màn `Main`).

### DL-025 – Object storage dev: SeaweedFS

- **Bối cảnh:** P2 cần upload ảnh/video câu hỏi (BR-QB-02); MinIO không còn image cộng đồng.
- **Quyết định:** Dev dùng SeaweedFS (`chrislusf/seaweedfs:4.53`, S3 gateway) trong docker-compose, cổng `127.0.0.1:8340`, không bật xác thực S3. API dùng AWS SDK v3, cấu hình qua `S3_*` trong `.env`; production không cho dùng khóa mẫu.
- **Hệ quả:** SeaweedFS khi không bật xác thực không kiểm tra chữ ký hay Content-Type, nên server luôn kiểm tra lại tệp sau upload (DL-035). Production vẫn chờ DL-024.

### DL-033 – Chia sẻ public bằng phiên bản snapshot

- **Bối cảnh:** 5.4, BR-QB-04/05/07/09: bản đã duyệt không đổi khi chủ sở hữu sửa; bản sao độc lập với bản gốc; gỡ public không làm hỏng kịch bản đang tham chiếu.
- **Quyết định:** Đơn vị chia sẻ là **bộ đề**. Mỗi lần "Chia sẻ public" tạo một phiên bản (`question_set_versions`) chứa snapshot đầy đủ nội dung câu hỏi tại thời điểm gửi. Trạng thái: `pending` → `approved`/`rejected`; bản cũ thành `superseded`; gỡ public là `withdrawn`. Mỗi bộ tối đa một bản chờ duyệt và một bản đang public (unique index). Sao chép bộ public tạo bộ đề và câu hỏi mới thuộc người sao chép.
- **Hệ quả:** Kiểm duyệt so sánh hai snapshot để hiện câu thêm/sửa/bỏ. Kịch bản (P4) nên tham chiếu phiên bản, không tham chiếu bộ đề đang soạn của người khác.

### DL-034 – Câu hỏi = dạng đáp án + media tùy chọn

- **Bối cảnh:** 5.2 coi "câu hỏi hình ảnh/video/âm thanh" là media + một dạng đáp án; board QuestionEditor lại để Hình ảnh/Video ngang hàng với Trắc nghiệm/Đúng-Sai/Trả lời ngắn.
- **Quyết định:** Lưu `answer_type` (`mcq`, `true_false`, `short_answer`) và `media_id` riêng. Giao diện chọn dạng đáp án bằng 3 nút và đính media ở ô kéo thả; cột "Loại" hiện ví dụ "Trắc nghiệm · Hình ảnh"; bộ lọc có thêm "Media".
- **Hệ quả:** Câu hình ảnh vẫn chấm tự động theo dạng đáp án. So khớp trả lời ngắn (BR-QB-01) nằm trong `@olympia/shared` để engine P4 dùng lại.

### DL-035 – Upload media qua presigned URL

- **Quyết định:** Trình duyệt xin `POST /api/media/uploads` (server kiểm tra định dạng/dung lượng khai báo, cấp presigned PUT 10 phút), upload thẳng lên object storage, rồi gọi `POST /api/media/:id/complete`: server kiểm tra dung lượng thật và chữ ký đầu tệp (JPG/PNG/WEBP/MP4/MP3); sai thì xóa tệp. URL đọc là presigned GET 1 giờ.
- **Hệ quả:** API không chuyển tiếp dữ liệu tệp. Bản ghi media `pending` không được hoàn tất hiện chưa được dọn tự động (cần job dọn dẹp sau).

### DL-036 – Màn kiểm duyệt bộ public làm ở P2

- **Bối cảnh:** Kế hoạch P2 gồm duyệt/từ chối bộ public; board Moderation trong canvas ghi P7.
- **Quyết định:** Làm màn "Duyệt nội dung" trong khung Quản trị ngay ở P2, theo board Moderation; bỏ ô "Kịch bản đang dùng" vì kịch bản thuộc P4. Duyệt/từ chối ghi vào `admin_audit_logs`.

### DL-037 – Kịch bản dùng lại được; phòng tham chiếu kịch bản

- **Bối cảnh:** Board CreateRoom cho phòng chọn kịch bản từ danh sách, sidebar có mục "Kịch bản", ScriptBuilder có "Lưu kịch bản" và "Lưu thành mẫu" (BR-SCRIPT-02).
- **Quyết định:** Kịch bản (`match_scripts`) thuộc Host, dùng lại cho nhiều phòng; phòng lưu `script_id`. Mọi kịch bản đều là "mẫu"; "Lưu thành mẫu" nhân bản thành kịch bản mới. Xóa kịch bản là xóa mềm; phòng đang chọn phải chọn kịch bản khác trước khi bắt đầu. Khi bắt đầu trận, kịch bản và nội dung câu hỏi được chốt vào `matches.script_snapshot` (BR-SCRIPT-03, BR-QB-04).
- **Hệ quả:** Không có bảng mẫu riêng. Room Management chỉ biết tên kịch bản qua interface của module Kịch bản.

### DL-038 – P4 chỉ mở vòng Khởi động và chế độ thủ công

> **Bị thay thế** ở P5: cả bốn vòng và chế độ tự động đã chơi được (DL-041…DL-045).

- **Quyết định:** ScriptBuilder chỉ cho thêm vòng Khởi động; ba vòng còn lại hiện "sắp có" (P5 đăng ký plugin). Phòng ở chế độ Tự động không bắt đầu được trận (lỗi `MATCH_AUTO_MODE_UNSUPPORTED`) cho tới P5.
- **Hệ quả:** Schema kịch bản vẫn là union theo loại vòng; thêm vòng không cần sửa engine.

### DL-039 – Chế độ thủ công: Host xác nhận mọi câu

- **Bối cảnh:** Board HostControl có "hệ thống chấm: Đúng" và nút "Xác nhận Đúng"/"Sai"; 8.3 liệt kê "xác nhận đúng/sai" là việc của Host.
- **Quyết định:** Ở chế độ thủ công, câu trả lời được chấm tự động làm gợi ý; điểm chỉ thay đổi khi Host xác nhận. Xác nhận đồng thời công bố đáp án (gộp các trạng thái Đã chấm → Đã công bố của 8.2). Hết giờ không trả lời ở phần thi riêng tính là bỏ qua (0 điểm); ở phần thi chung, Host chấm Sai thì bị trừ điểm theo luật.
- **Hệ quả:** Chế độ tự động (P5) dùng lại gợi ý để chấm luôn câu có đáp án xác định.

### DL-040 – Câu hỏi của vòng lấy theo nhóm vòng trong bộ đề

- **Quyết định:** Vòng dùng các câu được xếp vào nhóm của vòng đó trong bộ đề (5.3), theo thứ tự: phần thi riêng chia lần lượt cho từng ghế, sau đó phần thi chung; câu dư làm câu dự phòng cho "Hủy câu" (8.5). Bộ public được chọn mới phải đang được duyệt; phiên bản đã chọn trước vẫn dùng được khi bị thay/gỡ (BR-QB-07).
- **Hệ quả:** Kiểm tra đủ câu (BR-SCRIPT-01) theo số người chơi thật khi bắt đầu trận; ScriptBuilder báo số người chơi tối đa nguồn đủ câu.

### DL-041 – Vượt chướng ngại vật: dữ liệu và luồng

- **Bối cảnh:** Ngân hàng câu hỏi chỉ có câu hỏi đơn (DL-034), không có kiểu "bảng CNV". BR-SCRIPT-01 yêu cầu vòng có từ khóa và các hàng gợi ý. Board PlayerDesktopObstacle cho Player "Bấm chuông trả lời CNV"; board HostControlObstacle cho Host thấy chữ Player đã nhập kèm gợi ý so khớp.
- **Quyết định:** Câu của nhóm "Vượt chướng ngại vật" trong bộ đề theo thứ tự: câu 1 là từ khóa (media của câu là ảnh nền), tiếp theo là các hàng ngang (mặc định 4), cuối cùng là ô trung tâm (nếu bật). Mọi câu phải là trả lời ngắn; kiểm tra khi bắt đầu trận. Số ký tự hiển thị bỏ khoảng trắng. Hàng ngang: Player đến lượt chọn (hoặc mở theo thứ tự, cấu hình), mọi Player còn thi cùng ghi đáp án và được sửa tới khi hết giờ. Đoán từ khóa = gửi chữ cho câu từ khóa bất kỳ lúc nào, mỗi Player một lần. Điểm tính theo số hàng đã mở lúc server nhận (`keywordStartPoints − keywordStep × (hàng − 1)`, không thấp hơn điểm ô trung tâm). Host luôn xác nhận từ khóa (BR-R2-01, cả ở chế độ tự động). Đúng: kết thúc vòng, mở toàn bộ ảnh; sai: bị loại khỏi phần còn lại của vòng. Hủy hàng không có câu thay thế (bảng là một bộ), chỉ hoàn điểm và mở mảnh ảnh.
- **Hệ quả:** Ảnh nền được gửi cho mọi người xem và che mảnh ở client; người dùng thành thạo có thể xem ảnh gốc qua công cụ trình duyệt. Nếu cần chặn hẳn, phải cắt ảnh theo mảnh ở server (để sau).

### DL-042 – Câu cùng trả lời: Host chấm từng người rồi công bố

- **Bối cảnh:** Board HostControlAcceleration/HostControlObstacle có bảng câu trả lời theo người, nút "Chấm lại", "Công bố đáp án/kết quả hàng".
- **Quyết định:** Ở hàng ngang và Tăng tốc, hết giờ (hoặc mọi người đã gửi khi không cho sửa) thì khóa trả lời; Host chấm Đúng/Sai từng người (mặc định theo gợi ý tự động), rồi "Công bố" mới áp điểm. Tăng tốc xếp hạng theo thời điểm server nhận; người đúng cùng mili-giây nhận cùng mức cao hơn và người kế tiếp lùi hạng theo kiểu "1, 1, 3" (BR-R3-02). Chấm lại tính lại điểm cả câu.
- **Hệ quả:** Chế độ tự động công bố ngay khi mọi kết quả đã chắc chắn (BR-GAME-05).

### DL-043 – Về đích: gói câu hỏi, Ngôi sao hy vọng, giành quyền

- **Bối cảnh:** 7.4 cho Player chọn mức điểm từng câu; ngân hàng câu hỏi có "Điểm mặc định" (5.1).
- **Quyết định:** Câu của nhóm "Về đích" được xếp theo "Điểm mặc định" trùng mức điểm; câu chưa có điểm mặc định dùng cho mọi mức; thiếu thì lấy câu của mức khác. Player đặt Ngôi sao hy vọng khi chọn gói (board FinishPick), đổi được trước khi câu có sao hiển thị; tối đa 1 lần mỗi lượt. Thứ tự thi tính theo điểm khi vào vòng (bằng điểm thì theo vị trí). Mỗi câu chỉ một lượt giành quyền; giành quyền đúng nhận điểm câu và (mặc định) trừ đúng số đó của Player chính, kể cả khi Player chính đã bị trừ do Ngôi sao hy vọng; sai bị trừ `wrongPenaltyPercent` % điểm câu. Chế độ tự động: hết 20 giây chưa chọn gói thì chọn mức thấp nhất, không sao.
- **Hệ quả:** Kiểm tra đủ câu chỉ theo tổng số câu, không theo từng mức.

### DL-044 – Câu hỏi phụ khi hòa điểm

- **Bối cảnh:** 9.3 (mặc định đề xuất) nhưng kịch bản không có nguồn câu hỏi riêng cho câu hỏi phụ.
- **Quyết định:** Sau vòng cuối, nếu các Player dẫn đầu (chưa bị loại) hòa điểm và kịch bản bật câu hỏi phụ, trận thêm vòng "Câu hỏi phụ" dùng các câu chưa dùng của các vòng trước (câu dự phòng, câu dư). Chỉ người hòa điểm được bấm chuông; đúng đầu tiên thắng; sai thì mở chuông cho người còn lại. Không cộng điểm; người thắng lưu ở `tiebreakWinner`. Hết câu hoặc tắt câu hỏi phụ: đồng hạng. Trận kết thúc sau vòng cuối có lý do `completed` (Host kết thúc giữa chừng là `host`).
- **Hệ quả:** Muốn có câu hỏi phụ, bộ đề cần có câu dư. Xếp hạng cuối dùng `tiebreakWinner` (P7).

### DL-045 – Chế độ tự động trong engine

- **Quyết định:** Trận ghi chế độ của phòng lúc bắt đầu (`state.mode`). Sau mỗi đầu vào, engine gọi `plugin.auto()`: plugin làm bước tức thì (chấm câu xác định, chuyển câu) hoặc đặt đồng hồ `auto` để chờ (thời gian đọc câu `autoReadSeconds`, xem đáp án `autoRevealSeconds`, mặc định 3 giây) hoặc `choose` (chờ chọn hàng/gói). Vòng hết câu thì engine đặt đồng hồ `break` (`breakSeconds`) rồi chuyển vòng / câu hỏi phụ / kết thúc. Câu cần người chấm làm `awaitingHost` = true và engine dừng lại tới khi Host chấm. Mọi lệnh Host vẫn dùng được (BR-GAME-06); lệnh vòng thi bỏ bước tự động đang chờ để lập lại.
- **Hệ quả:** Vẫn một đồng hồ mỗi trận; tạm dừng/tiếp tục giữ nguyên thời gian còn lại của cả bước tự động. Thiết lập mới của kịch bản có giá trị mặc định nên kịch bản cũ vẫn dùng được.

### DL-046 – Video/voice: kết nối, quyền nói và lỗi SFU

- **Bối cảnh:** Mục 11 và DL-014/DL-019. Product Owner xác nhận ngày 2026-11-19: chốt LiveKit; "chỉ người đến lượt được nói" chạy tự động theo engine; "tắt tiếng toàn phòng" là khóa; kết nối video từ sảnh chờ.
- **Quyết định:**
  - Module `av` (Realtime Communication) cấp token LiveKit qua `POST /api/rooms/:roomId/av/token` cho Host, Player và khán giả đã được duyệt; người chờ duyệt không có token. Danh tính LiveKit là khóa phòng `u:`/`g:` (một kết nối mỗi danh tính, BR-RC-05); metadata gồm vai trò và id người tham gia để client ghép video với ghế. Khán giả không có quyền phát (BR-AV-04); không ai được gửi data/đổi metadata.
  - Chính sách của Host (`GET/PATCH /api/rooms/:roomId/av/policy`, quyền "Điều khiển trận đấu"): khóa mic/cam từng Player, tắt tiếng toàn phòng (khóa mic mọi Player tới khi Host mở lại), "chỉ người đến lượt được nói" (khi trận đang chạy, chỉ ghế `activeSeat` của plugin vòng hiện tại được bật mic: phần thi riêng, Player chính/người giành quyền, người giành chuông). Server áp bằng `canPublishSources` của LiveKit và tắt track đang phát; Player không tự bật lại được. Mic Host không bị ảnh hưởng. Khóa hết nguồn thì tắt hẳn quyền phát (danh sách nguồn rỗng với LiveKit nghĩa là "mọi nguồn").
  - Kết nối ngay từ sảnh chờ để kiểm tra thiết bị (board LobbyPlayer). Không có/không cho phép camera, micro vẫn thi (BR-AV-01). Người bị kick/ban/rời phòng bị ngắt khỏi phòng LiveKit; phòng đóng thì đóng phòng LiveKit.
  - Lỗi SFU chỉ ghi log, không ném ra luồng phòng/trận (BR-AV-02); client hiện "không kết nối được video" và nút thử lại.
- **Hệ quả:** Production cần LiveKit có TURN (TLS 443/UDP) cho mạng trường học, 4G, và `LIVEKIT_API_SECRET` thật (≥ 32 ký tự). Không ghi hình (BR-AV-03): không bật egress.

### DL-047 – Kết quả theo câu được ghi khi rời vòng

- **Bối cảnh:** Thống kê 9.4 và mục 14 cần đúng/sai/bỏ qua, thời gian trả lời, số lần giành quyền theo từng câu; trạng thái của plugin vòng bị thay khi chuyển vòng nên không đọc lại được sau trận. `match_answers` chỉ có gợi ý chấm tự động, không có kết quả Host chấm.
- **Quyết định:** Mỗi plugin cài thêm `summary(state)` trả các câu đã hiển thị (bỏ câu chưa mở và câu bị hủy) kèm kết quả theo ghế. Engine phát hiệu ứng `round_summary` trước khi rời vòng và khi kết thúc trận (kể cả Host kết thúc sớm, kết thúc bất thường); runtime ghi `match_questions` (bản sao câu, môn/chủ đề) và `match_question_outcomes` trong cùng transaction. Từ khóa CNV: mỗi lần đoán được tính là giành quyền. Về đích: Player chính và người giành quyền đều có kết quả. Câu bị bỏ qua có Player đến lượt thì Player đó "bỏ qua". Tên phòng lúc thi được lưu vào `matches.room_name` để module Game không phải đọc bảng của Room Management.
- **Hệ quả:** Trận đã chạy trước P7 không có thống kê theo câu. Thứ hạng: điểm giảm dần, người thắng câu hỏi phụ đứng trên người cùng điểm; trận bị hủy kết quả không tính vào thống kê.

### DL-048 – Công bố đáp án sau trận

- **Bối cảnh:** 9.4 "Hiển thị đáp án và giải thích (tùy Host bật)". Product Owner chọn ngày 2026-11-19.
- **Quyết định:** Kịch bản có thiết lập "Công bố đáp án sau trận" (mặc định bật), được chép vào `matches.answers_public` khi trận kết thúc; Host bật/tắt lại cho từng trận ở trang tổng kết. Host và quản trị viên luôn xem được; Player và khán giả của phòng chỉ xem khi đang bật.

### DL-049 – Cấu hình hệ thống sửa trên web

- **Bối cảnh:** 15.1: Super Admin cấu hình giới hạn phòng, kích thước media, thời gian chờ, danh sách reaction. Product Owner chọn ngày 2026-11-19.
- **Quyết định:** Bảng `system_settings` (một dòng mỗi khóa); giá trị mặc định lấy từ biến môi trường (`MAX_ACTIVE_ROOMS_PER_HOST`, `MAX_SPECTATORS_PER_ROOM`, `RECONNECT_GRACE_SECONDS`, `ROOM_IDLE_MINUTES`, `HOST_RECONNECT_MINUTES`) và đặc tả (ảnh 5 MB, video/âm thanh 50 MB, 4 reaction của mục 13). Giá trị nằm trong bộ nhớ để đọc đồng bộ; instance sửa áp dụng ngay, instance khác nạp lại sau tối đa 15 giây. Reaction chọn trong bảng 8 biểu tượng. Mỗi lần sửa ghi nhật ký quản trị. Giao diện đọc reaction và dung lượng media qua `GET /api/settings/public`.

### DL-050 – Báo cáo vi phạm

- **Bối cảnh:** 15.3; thiết kế Reports có thêm "Chặn phiên khách". Product Owner chọn ngày 2026-11-19.
- **Quyết định:** Chỉ tài khoản gửi được báo cáo (BR-AUTH-06), tối đa 10 báo cáo/giờ. Đối tượng: phiên bản bộ public (người sở hữu bộ) hoặc người trong phòng (người báo cáo phải là Host hoặc đã ở trong phòng; bỏ trống = báo cáo Host). Cách xử lý: bỏ qua; gỡ nội dung (bộ public → `withdrawn`, phòng → đóng phòng, kết thúc trận nếu đang thi); cảnh báo (email + `users.warning_count`); chặn phiên khách (cấm khách khỏi phòng); khóa tài khoản (như quản lý người dùng). Báo cáo bộ public: mọi Manager xử lý (kiểm duyệt chung); báo cáo trong phòng: Manager của tổ chức người bị báo cáo (khách: tổ chức của Host), Super Admin xử lý tất cả. Cảnh báo/khóa phải nằm trong phạm vi quản lý (DL-005).

### DL-051 – Chế độ giám sát phòng của Super Admin/Manager

- **Bối cảnh:** BR-ROLE-04, 15.2 ("vào giám sát"); ma trận 2.2: giám sát xem video/nghe âm thanh, không gửi reaction. Canvas thiết kế không có màn riêng.
- **Quyết định:** Super Admin giám sát mọi phòng; Manager giám sát phòng của Host là thành viên thuộc tổ chức mình quản lý (cùng phạm vi `/api/admin/rooms`). Vào bằng nút "Vào giám sát" ở `/quan-tri/phong`, mở `/phong/:roomId`; không cần mã phòng/mật khẩu và không tạo lượt tham gia. Nhân viên đã vào phòng làm Player/Spectator thì giữ vai trò đó. Người giám sát nhận bản trạng thái phòng và trận như khán giả (không thấy đáp án trước khi công bố, BR-RT-01); token video chỉ xem/nghe; không gửi reaction, không trả lời/bấm chuông/điều khiển. Người giám sát **không hiện** trong danh sách phòng hay số khán giả, không ghi trạng thái kết nối và không tính vào giới hạn khán giả. Thanh "Chế độ giám sát" có nút đóng phòng (cùng API đóng phòng vi phạm, ghi nhật ký quản trị).
- **Hệ quả:** Host và người chơi không biết đang bị giám sát; nếu cần minh bạch có thể thêm dòng "Quản trị viên đang giám sát" cho Host sau. Việc vào giám sát chưa ghi nhật ký quản trị.
- **Liên quan:** BR-ROLE-04, 2.2, 15.1, 15.2, DL-005, DL-026.

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
| DL-023 | Nơi triển khai production: **VPS + Docker Compose** (chốt 2026-11-19): api, web tĩnh, PostgreSQL, Redis, LiveKit (kèm TURN) trên 1–2 VPS gần người dùng (VN/Singapore), Caddy/Nginx cấp HTTPS; sao lưu PostgreSQL định kỳ ra object storage. | Cloud có dịch vụ quản lý, Kubernetes (chưa cần ở quy mô bản đầu) | Mở rộng ngang về sau: thêm instance api sau load balancer (Socket.IO Redis adapter, DL-013 đã hỗ trợ). |
| DL-024 | Object storage và CDN production: **dịch vụ S3-compatible thuê ngoài** (ưu tiên Cloudflare R2 – không tính phí tải xuống; hoặc S3/Spaces) kèm CDN, chốt 2026-11-19. Chỉ đổi biến môi trường `S3_*`. | Tự host SeaweedFS | Cần cấu hình CORS cho upload presigned từ domain web. |
| DL-025 | Object storage S3-compatible cho dev: **SeaweedFS** (chốt ngày 2026-11-18 khi làm P2). MinIO không còn phát hành Docker image cộng đồng. | Garage, LocalStack | Production chờ DL-024. |

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
