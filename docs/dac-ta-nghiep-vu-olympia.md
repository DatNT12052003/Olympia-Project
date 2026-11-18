# ĐẶC TẢ NGHIỆP VỤ CHI TIẾT – OLYMPIA ONLINE

> Tài liệu này mở rộng từ [mo-ta-du-an-olympia.md](mo-ta-du-an-olympia.md).
> Các giá trị đánh dấu **(mặc định đề xuất)** là đề xuất để triển khai ban đầu, Host/Admin có thể cấu hình lại; các quyết định cho những vấn đề từng cần làm rõ được ghi tại mục 18.

---

## 1. Giới thiệu

### 1.1. Mục đích tài liệu

Mô tả đầy đủ nghiệp vụ, luồng xử lý, quy tắc và ràng buộc của hệ thống Olympia Online làm cơ sở cho thiết kế, phát triển, kiểm thử và nghiệm thu.

### 1.2. Tổng quan sản phẩm

Olympia Online là nền tảng tổ chức cuộc thi kiến thức trực tuyến theo format gameshow 4 vòng thi. Host tạo phòng thi, chuẩn bị câu hỏi và điều khiển trận đấu; Player tham gia bằng thiết bị cá nhân, trả lời câu hỏi, giao tiếp qua video/voice; Spectator theo dõi và gửi reaction. Mọi trạng thái trận đấu được đồng bộ theo thời gian thực.

### 1.3. Mục tiêu

| Mã  | Mục tiêu                                                                                      |
| --- | --------------------------------------------------------------------------------------------- |
| G1  | Tạo sân chơi kiến thức trực tuyến cho gia đình, bạn bè, học sinh.                             |
| G2  | Hỗ trợ ôn tập kiến thức thông qua thi đấu.                                                    |
| G3  | Mang lại trải nghiệm gameshow: video call, âm thanh, hiệu ứng, bảng điểm realtime.            |
| G4  | Cho phép chia sẻ và tái sử dụng ngân hàng câu hỏi giữa các Host.                              |
| G5  | Hỗ trợ nhiều phòng thi, nhiều Host hoạt động đồng thời; dễ mở rộng sang format gameshow khác. |

### 1.4. Thuật ngữ

| Thuật ngữ                         | Định nghĩa                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| Phòng thi (Room)                  | Không gian ảo do Host tạo, nơi diễn ra một hoặc nhiều trận đấu.                                 |
| Trận đấu (Match)                  | Một lượt thi hoàn chỉnh trong phòng, gồm các vòng thi theo kịch bản.                            |
| Vòng thi (Round)                  | Một phần của trận đấu với luật chơi riêng (Khởi động, Vượt chướng ngại vật, Tăng tốc, Về đích). |
| Kịch bản (Script)                 | Cấu hình trận đấu: danh sách vòng, thứ tự, luật, bộ câu hỏi, thời gian.                         |
| Ngân hàng câu hỏi (Question Bank) | Tập hợp câu hỏi thuộc sở hữu một Host.                                                          |
| Bộ đề (Question Set)              | Tập câu hỏi được chọn từ ngân hàng để dùng cho một trận/vòng.                                   |
| Vị trí (Seat)                     | Ô thi đấu số 1–4 được gán cho Player trong trận.                                                |
| Giành quyền (Buzz-in)             | Hành động bấm chuông để giành quyền trả lời.                                                    |
| Ngôi sao hy vọng (Star)           | Lựa chọn nhân đôi điểm cho một câu ở vòng Về đích.                                              |
| Reaction                          | Biểu tượng cảm xúc (👍 ❤️ 😂 🔥) do Spectator/Player gửi.                                       |

---

## 2. Vai trò và phân quyền

### 2.1. Mô tả vai trò

| Vai trò     | Mô tả                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Super Admin | Quản trị toàn hệ thống: người dùng, phân quyền, cấu hình, giám sát mọi phòng thi.                        |
| Manager     | Quản lý người dùng thuộc các tổ chức được gán, kiểm duyệt ngân hàng câu hỏi public, hỗ trợ vận hành.     |
| Host        | Tạo và điều khiển phòng thi, quản lý người chơi, kịch bản, ngân hàng câu hỏi.                            |
| Player      | Thí sinh: trả lời câu hỏi, dùng micro/camera, xem điểm.                                                  |
| Spectator   | Khán giả: xem video, bảng điểm, gửi reaction; không tác động kết quả.                                    |

**Quy tắc vai trò:**

- **BR-ROLE-01:** Vai trò hệ thống (Super Admin, Manager, Host) gắn với tài khoản. Vai trò trong phòng (Host phòng, Player, Spectator) gắn với từng phòng/trận.
- **BR-ROLE-02:** Một tài khoản có thể là Host của phòng A và Player/Spectator của phòng B, nhưng trong cùng một trận chỉ giữ một vai trò.
- **BR-ROLE-03:** Host không được đồng thời là Player trong trận do mình điều khiển.
- **BR-ROLE-04:** Super Admin/Manager có thể vào phòng bất kỳ trong phạm vi quản lý ở chế độ giám sát (tương đương Spectator, có thêm quyền quản trị mục 15).

### 2.2. Ma trận phân quyền

| Chức năng                          | Super Admin |   Manager   |      Host      | Player | Spectator |
| ---------------------------------- | :---------: | :---------: | :------------: | :----: | :-------: |
| Quản lý tài khoản, phân quyền      |      ✔      | ✔ (phạm vi) |       –        |   –    |     –     |
| Cấu hình hệ thống                  |      ✔      |      –      |       –        |   –    |     –     |
| Giám sát mọi phòng thi             |      ✔      | ✔ (phạm vi) |       –        |   –    |     –     |
| Đóng phòng/khóa người dùng vi phạm |      ✔      |      ✔      |       –        |   –    |     –     |
| Kiểm duyệt bộ câu hỏi public       |      ✔      |      ✔      |       –        |   –    |     –     |
| Tạo/sửa/xóa câu hỏi của mình       |      ✔      |      ✔      |       ✔        |   –    |     –     |
| Dùng bộ câu hỏi public             |      ✔      |      ✔      |       ✔        |   –    |     –     |
| Tạo phòng, kịch bản                |      ✔      |      ✔      |       ✔        |   –    |     –     |
| Điều khiển trận đấu                |      –      |      –      | ✔ (phòng mình) |   –    |     –     |
| Trả lời, giành quyền               |      –      |      –      |       –        |   ✔    |     –     |
| Bật camera/micro, phát biểu        |      –      |      –      |       ✔        |   ✔    |     –     |
| Xem video, nghe âm thanh           |      ✔      |      ✔      |       ✔        |   ✔    |     ✔     |
| Gửi reaction                       |      –      |      –      |       ✔        |   ✔    |     ✔     |
| Xem bảng điểm realtime             |      ✔      |      ✔      |       ✔        |   ✔    |     ✔     |
| Xem lịch sử trận của mình          |      ✔      |      ✔      |       ✔        |   ✔    |     ✔     |

- **BR-ROLE-05:** Mọi kiểm tra quyền thực hiện ở backend cho cả REST API và sự kiện realtime. Giao diện ẩn nút chỉ là hỗ trợ trải nghiệm.
- **BR-ROLE-06:** Mặc định từ chối khi không xác định được quyền.

---

## 3. Tài khoản và xác thực

### 3.1. Chức năng

- Đăng ký bằng email + mật khẩu; xác minh email.
- Đăng nhập, đăng xuất, quên/đặt lại mật khẩu.
- Cập nhật hồ sơ: tên hiển thị, ảnh đại diện.
- **Tham gia khách (Guest):** Player và Spectator có thể vào phòng bằng mã phòng/link mời và tên hiển thị mà không cần tài khoản, nếu phòng cho phép khách (mục 4.1). Khách không có lịch sử cá nhân lâu dài, không tạo được phòng/ngân hàng câu hỏi và không thể trở thành Host.

### 3.2. Quy tắc

- **BR-AUTH-01:** Mọi tài khoản đăng ký mặc định có vai trò Host (để tự tổ chức phòng thi), nhưng chỉ được tạo phòng/câu hỏi sau khi **đã xác minh email**. Super Admin có thể thu hồi quyền Host của một tài khoản (tài khoản vẫn tham gia được với vai trò Player/Spectator). Manager/Super Admin do Super Admin cấp.
- **BR-AUTH-02:** Tài khoản bị khóa không thể đăng nhập; các phiên đang hoạt động bị thu hồi và người dùng bị đưa ra khỏi phòng.
- **BR-AUTH-03:** Giới hạn số lần đăng nhập sai liên tiếp **(mặc định đề xuất: 5 lần / 15 phút)**.
- **BR-AUTH-04:** Tên hiển thị trong cùng một phòng phải duy nhất; trùng thì hệ thống yêu cầu đổi.
- **BR-AUTH-05:** Khách được cấp một **phiên khách** (guest token) gắn với trình duyệt, hiệu lực **(mặc định đề xuất: 24 giờ)**, dùng để kết nối lại (mục 12). Phiên khách chỉ có hiệu lực trong phòng đã vào.
- **BR-AUTH-06:** Khách không được gửi báo cáo vi phạm và không xem được lịch sử trận sau khi phiên khách hết hạn; kết quả trận vẫn lưu tên hiển thị của khách.

---

## 4. Quản lý phòng thi

### 4.1. Thuộc tính phòng

| Thuộc tính         |      Bắt buộc       | Ràng buộc                                                  |
| ------------------ | :-----------------: | ---------------------------------------------------------- |
| Tên phòng          |          ✔          | 3–100 ký tự                                                |
| Mô tả              |          –          | ≤ 500 ký tự                                                |
| Số lượng Player    |          ✔          | 2–4                                                        |
| Chế độ             |          ✔          | Công khai / Riêng tư                                       |
| Mã phòng           |       Tự sinh       | 6 ký tự chữ-số, duy nhất trong số phòng đang hoạt động     |
| Link mời           |       Tự sinh       | Chứa mã phòng; Host có thể tạo lại để vô hiệu link cũ      |
| Mật khẩu phòng     |          –          | Tùy chọn cho phòng riêng tư                                |
| Cho phép Spectator |          ✔          | Có/Không; giới hạn số Spectator **(mặc định đề xuất: 50)**, tối đa theo cấu hình hệ thống **(mặc định đề xuất: 200)** |
| Cho phép khách     |          ✔          | Có/Không **(mặc định: Có)**; áp dụng cho cả Player và Spectator |
| Chế độ điều khiển  |          ✔          | Thủ công / Tự động theo kịch bản                           |
| Kịch bản           | ✔ trước khi bắt đầu | Xem mục 6                                                  |

### 4.2. Phòng công khai và riêng tư

- **Công khai:** hiển thị trong danh sách phòng; ai cũng có thể xin vào làm Player (Host duyệt) hoặc vào làm Spectator.
- **Riêng tư:** không hiển thị trong danh sách; chỉ vào được bằng mã phòng/link mời (và mật khẩu nếu có).

### 4.3. Vòng đời phòng

```
Nháp (Draft) → Đang mở (Open / chờ người chơi) → Đang thi (In Match) ⇄ Đang mở → Đã đóng (Closed)
```

| Trạng thái | Mô tả                                       | Hành động hợp lệ                                                |
| ---------- | ------------------------------------------- | --------------------------------------------------------------- |
| Draft      | Host đang cấu hình, chưa ai vào được.       | Sửa cấu hình, mở phòng, xóa.                                    |
| Open       | Người tham gia có thể vào, Host xếp vị trí. | Mời, duyệt, xếp vị trí, sửa kịch bản, bắt đầu trận, đóng phòng. |
| In Match   | Đang diễn ra một trận đấu.                  | Điều khiển trận (mục 8). Không sửa kịch bản trận hiện tại.      |
| Closed     | Phòng kết thúc; chỉ còn xem kết quả.        | Xem lịch sử.                                                    |

- **BR-ROOM-01:** Một phòng tại mỗi thời điểm chỉ có tối đa một trận đang diễn ra. Sau khi kết thúc trận, phòng quay về Open để tổ chức trận tiếp theo.
- **BR-ROOM-02:** Phòng Open không có hoạt động quá **(mặc định đề xuất: 60 phút)** sẽ tự động đóng.
- **BR-ROOM-03:** Một Host được mở đồng thời tối đa **(mặc định đề xuất: 5)** phòng; Super Admin cấu hình được giới hạn này.

### 4.4. Tham gia phòng

**Luồng Player tham gia:**

1. Người dùng nhập mã phòng hoặc mở link mời.
2. Hệ thống kiểm tra phòng tồn tại, trạng thái Open, mật khẩu (nếu có).
3. Người dùng chọn tham gia với vai trò Player hoặc Spectator.
4. Player vào **sảnh chờ**; Host duyệt (hoặc phòng bật "tự động duyệt").
5. Host gán vị trí 1–4; Player kiểm tra camera/micro và bấm **Sẵn sàng**.

**Quy tắc:**

- **BR-JOIN-01:** Không vượt quá số Player đã cấu hình; khi đủ chỗ, người mới chỉ có thể vào làm Spectator.
- **BR-JOIN-02:** Không thể tham gia làm Player khi trận đang diễn ra (trừ kết nối lại, mục 12). Có thể vào làm Spectator.
- **BR-JOIN-03:** Host có thể đổi vị trí, chuyển Player thành Spectator, mời ra (kick) hoặc cấm (ban) người tham gia khỏi phòng. Người bị cấm không vào lại được phòng đó.
- **BR-JOIN-04:** Trận chỉ bắt đầu được khi có ít nhất 2 Player đã được gán vị trí và đã Sẵn sàng (Host có thể bỏ qua điều kiện Sẵn sàng).

### 4.5. Rời phòng

- Player rời phòng khi chưa thi: vị trí được giải phóng.
- Player rời khi đang thi: xem như mất kết nối (mục 12); nếu không quay lại trong thời gian chờ, Host quyết định loại hoặc giữ điểm.
- Host rời/mất kết nối: trận tự động **tạm dừng**; nếu Host không quay lại trong **(mặc định đề xuất: 10 phút)**, trận kết thúc với kết quả tại thời điểm dừng và được đánh dấu "Kết thúc bất thường".

---

## 5. Ngân hàng câu hỏi

### 5.1. Thuộc tính câu hỏi

| Thuộc tính                   | Bắt buộc | Mô tả                                                     |
| ---------------------------- | :------: | --------------------------------------------------------- |
| Nội dung                     |    ✔     | Văn bản (hỗ trợ định dạng cơ bản, công thức nếu mở rộng). |
| Loại câu hỏi                 |    ✔     | Xem 5.2.                                                  |
| Đáp án                       |    ✔     | Theo loại câu hỏi.                                        |
| Các đáp án chấp nhận         |    –     | Danh sách đáp án tương đương cho câu trả lời ngắn.        |
| Giải thích                   |    –     | Hiển thị sau khi công bố đáp án.                          |
| Media                        |    –     | Hình ảnh / video / âm thanh đính kèm.                     |
| Môn học, Chủ đề, Lớp, Độ khó |    –     | Dùng để phân loại, lọc. Độ khó: Dễ / Trung bình / Khó.    |
| Vòng thi phù hợp             |    –     | Một hoặc nhiều vòng.                                      |
| Điểm mặc định                |    –     | Có thể bị luật vòng thi ghi đè.                           |
| Thời gian trả lời mặc định   |    –     | Giây; có thể bị luật vòng thi ghi đè.                     |
| Thẻ (tags)                   |    –     | Tự do.                                                    |

### 5.2. Loại câu hỏi và cách chấm

| Loại                                | Dữ liệu đáp án                            | Chấm tự động                                                  |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| Trắc nghiệm                         | 2–6 phương án, đúng 1 phương án           | ✔                                                             |
| Đúng/Sai                            | Đúng hoặc Sai                             | ✔                                                             |
| Trả lời ngắn                        | Đáp án chuẩn + danh sách đáp án chấp nhận | ✔ khi khớp; nếu không khớp → chờ Host xác nhận (tùy cấu hình) |
| Câu hỏi hình ảnh / video / âm thanh | Media + một trong các dạng trên           | Theo dạng đáp án                                              |

- **BR-QB-01:** So khớp câu trả lời ngắn: bỏ khoảng trắng thừa, không phân biệt hoa/thường; tùy chọn bỏ dấu tiếng Việt (Host cấu hình theo câu hỏi).
- **BR-QB-02:** Media: ảnh ≤ **5 MB**, video/âm thanh ≤ **50 MB** **(mặc định đề xuất)**; định dạng phổ biến (JPG, PNG, WEBP, MP4, MP3).
- **BR-QB-03:** Câu hỏi đã dùng trong trận đã kết thúc không bị xóa cứng; khi Host xóa, câu hỏi bị ẩn (xóa mềm) để giữ nguyên lịch sử trận.
- **BR-QB-04:** Sửa câu hỏi không làm thay đổi kết quả của trận đã diễn ra (trận lưu bản sao nội dung câu hỏi tại thời điểm thi).

### 5.3. Bộ đề

- Host tạo bộ đề bằng cách chọn câu hỏi từ ngân hàng của mình hoặc từ bộ public.
- Bộ đề có thể được tổ chức theo vòng thi (mỗi vòng một nhóm câu hỏi) để gán trực tiếp vào kịch bản.
- Hỗ trợ chọn câu ngẫu nhiên theo tiêu chí (môn, độ khó, số lượng).
- Nhập/xuất câu hỏi qua file (Excel/CSV) **(mặc định đề xuất, có thể làm ở giai đoạn sau)**.

### 5.4. Chia sẻ public

**Luồng:**

1. Host đánh dấu bộ câu hỏi là **Public** → trạng thái **Chờ duyệt**. Bộ câu hỏi **không hiển thị** với Host khác cho tới khi được duyệt (kiểm duyệt trước là bắt buộc).
2. Manager/Super Admin duyệt → **Public** (hiển thị cho mọi Host) hoặc **Từ chối** (kèm lý do).
3. Host khác có thể xem, dùng trực tiếp trong kịch bản hoặc **sao chép** về ngân hàng của mình.

- **BR-QB-05:** Bản sao thuộc sở hữu Host sao chép; thay đổi của bản gốc không ảnh hưởng bản sao.
- **BR-QB-06:** Host khác không được sửa/xóa bộ public của người khác.
- **BR-QB-07:** Khi bộ public bị gỡ, các kịch bản đang tham chiếu vẫn dùng được cho đến khi Host thay thế; trận đang diễn ra không bị ảnh hưởng.
- **BR-QB-08:** Đáp án của bộ public chỉ hiển thị cho Host/Manager, không bao giờ gửi tới thiết bị Player trước khi công bố.
- **BR-QB-09:** Khi chủ sở hữu sửa bộ public đã duyệt, thay đổi tạo **phiên bản mới ở trạng thái Chờ duyệt**; phiên bản đã duyệt trước đó tiếp tục hiển thị cho tới khi phiên bản mới được duyệt.
- **BR-QB-10:** Mọi Manager và Super Admin đều kiểm duyệt được bộ public (kiểm duyệt nội dung không giới hạn theo tổ chức, vì bộ public dùng chung toàn hệ thống).

---

## 6. Kịch bản trận đấu

Host thiết lập trước khi bắt đầu trận:

- Danh sách vòng thi sử dụng (1–4 vòng), **thứ tự** tùy chọn.
- Với mỗi vòng: bộ câu hỏi, luật chơi (điểm, thời gian, số câu, có/không giành quyền...), theo mặc định ở mục 7.
- Chế độ điều khiển: thủ công / tự động.
- Hiệu ứng âm thanh, thời gian nghỉ giữa vòng.

- **BR-SCRIPT-01:** Kịch bản phải hợp lệ trước khi bắt đầu: mỗi vòng đủ số câu hỏi theo luật, đúng loại câu hỏi phù hợp (ví dụ vòng Vượt chướng ngại vật phải có từ khóa và các hàng gợi ý).
- **BR-SCRIPT-02:** Kịch bản có thể lưu thành **mẫu** để tái sử dụng.
- **BR-SCRIPT-03:** Khi trận bắt đầu, kịch bản được "chốt" (snapshot); thay đổi sau đó chỉ áp dụng cho trận sau.

---

## 7. Các vòng thi

Mỗi vòng có luật mặc định bên dưới; mọi thông số đều cấu hình được trong kịch bản.

- **BR-ROUND-00:** Luật mặc định **lấy cảm hứng** từ format gameshow kiến thức truyền hình, **không bắt buộc bám sát một phiên bản/mùa luật chính thức** nào. Hệ thống cung cấp luật mặc định dưới dạng **preset** (bộ thông số dựng sẵn); Host chọn preset rồi chỉnh. Có thể bổ sung preset mới mà không thay đổi engine.
- **BR-ROUND-02:** Với các phần thi một Player trả lời theo lượt (Khởi động – phần thi riêng, Về đích – Player chính), **hình thức trả lời** cấu hình theo vòng: **Nhập trên thiết bị** (mặc định) hoặc **Trả lời bằng lời** (Host nghe và bấm Đúng/Sai). Các phần thi cùng trả lời (Vượt chướng ngại vật – hàng ngang, Tăng tốc) luôn nhập trên thiết bị. Trả lời bằng lời luôn cần Host chấm (BR-GAME-05).

### 7.1. Vòng 1 – Khởi động

**Mục tiêu:** khởi động, kiểm tra kiến thức nhanh.

**Luật mặc định đề xuất:**

| Thông số                  | Giá trị                                                                         |
| ------------------------- | ------------------------------------------------------------------------------- |
| Phần thi riêng            | Mỗi Player lần lượt trả lời **6 câu** của mình                                  |
| Thời gian                 | **5 giây** mỗi câu sau khi đọc xong câu hỏi                                     |
| Điểm                      | **+10** đúng, 0 sai/bỏ qua                                                      |
| Phần thi chung (tùy chọn) | **12 câu**, giành quyền bằng chuông; đúng **+10**, sai **−5** (không âm dưới 0) |
| Loại câu hỏi              | Trắc nghiệm, Đúng/Sai, Trả lời ngắn                                             |
| Hình thức trả lời         | Nhập trên thiết bị (mặc định) hoặc trả lời bằng lời – xem BR-ROUND-02           |

**Luồng phần thi riêng:**

1. Hệ thống/Host chọn Player theo thứ tự vị trí.
2. Hiển thị câu hỏi cho tất cả; chỉ Player đến lượt được trả lời.
3. Bắt đầu đếm ngược; Player gửi đáp án (hoặc trả lời bằng lời, Host chấm).
4. Chấm điểm, công bố đúng/sai, chuyển câu tiếp theo.
5. Hết số câu → chuyển sang Player kế tiếp.

**Luồng phần thi chung:** hiển thị câu hỏi → mở chuông → Player bấm chuông đầu tiên được quyền trả lời → chấm → nếu sai, tùy cấu hình cho Player khác giành quyền tiếp hoặc chuyển câu.

### 7.2. Vòng 2 – Vượt chướng ngại vật

**Mục tiêu:** tìm từ khóa chướng ngại vật (CNV) thông qua các hàng gợi ý.

**Cấu trúc:**

- 1 **từ khóa CNV** (ẩn, hiển thị số ký tự).
- **4 hàng ngang** (mỗi hàng là một câu hỏi có đáp án là một từ, hiển thị số ký tự).
- 1 **ô trung tâm** (gợi ý cuối, mở sau khi giải 4 hàng hoặc khi Host mở).
- Ảnh nền chia **5 mảnh** (4 góc + trung tâm), mỗi mảnh lộ ra khi hàng tương ứng được giải đúng.

**Luật mặc định đề xuất:**

| Thông số                | Giá trị                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Chọn hàng               | Lần lượt từng Player chọn một hàng chưa mở                                                                  |
| Thời gian mỗi hàng      | **15 giây**, tất cả Player cùng ghi đáp án                                                                  |
| Điểm hàng ngang         | **+10** cho mỗi Player trả lời đúng                                                                         |
| Giành quyền trả lời CNV | Bất kỳ lúc nào bằng chuông                                                                                  |
| Điểm CNV                | Phụ thuộc số hàng đã mở: sau 1 hàng **80**, 2 hàng **60**, 3 hàng **40**, 4 hàng **20**, ô trung tâm **10** |
| Trả lời sai CNV         | Player bị **loại khỏi phần còn lại của vòng** (không trả lời hàng ngang, không giành CNV nữa)               |
| Không ai đoán được CNV  | Host công bố từ khóa, không ai được điểm CNV                                                                |

**Quy tắc:**

- **BR-R2-01:** Host xác nhận đáp án CNV (do có thể có cách diễn đạt tương đương); hệ thống gợi ý kết quả so khớp tự động.
- **BR-R2-02:** Host có quyền mở gợi ý/mảnh ảnh thủ công.
- **BR-R2-03:** Hàng không ai trả lời đúng vẫn được công bố đáp án nhưng mảnh ảnh tương ứng **(mặc định đề xuất)** vẫn mở.

### 7.3. Vòng 3 – Tăng tốc

**Mục tiêu:** trả lời nhanh và chính xác.

**Luật mặc định đề xuất:**

| Thông số     | Giá trị                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Số câu       | **4 câu**                                                                                                  |
| Thời gian    | **30 giây** mỗi câu                                                                                        |
| Hình thức    | Tất cả Player cùng trả lời, mỗi Player chỉ gửi **1 lần** mỗi câu (gửi lại ghi đè lần trước – tùy cấu hình) |
| Điểm         | Theo thứ tự trả lời đúng nhanh nhất: **40 / 30 / 20 / 10**                                                 |
| Loại câu hỏi | Mọi loại, ưu tiên câu hỏi hình ảnh/video, sắp xếp, dữ kiện                                                 |

**Quy tắc:**

- **BR-R3-01:** Thời điểm trả lời được ghi nhận **ở server** (thời điểm server nhận), tính theo mili-giây kể từ lúc câu hỏi bắt đầu.
- **BR-R3-02:** Hai Player trả lời đúng cùng thời điểm (cùng mili-giây) nhận cùng mức điểm cao hơn.
- **BR-R3-03:** Kết thúc thời gian, hệ thống hiển thị đáp án của từng Player cùng thời gian trả lời.

### 7.4. Vòng 4 – Về đích

**Mục tiêu:** vòng quyết định, chọn gói câu hỏi theo mức điểm.

**Luật mặc định đề xuất:**

| Thông số            | Giá trị                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Thứ tự thi          | Player có điểm thấp hơn thi trước (hoặc theo vị trí – cấu hình)                                                  |
| Gói câu hỏi         | Mỗi Player chọn **3 câu**, mỗi câu mức **20** hoặc **30** điểm                                                   |
| Thời gian           | **15 giây** (câu 20 điểm), **20 giây** (câu 30 điểm)                                                             |
| Ngôi sao hy vọng    | Mỗi Player dùng tối đa **1 lần**, chọn trước khi câu hỏi hiển thị; đúng **×2 điểm**, sai **trừ** số điểm của câu |
| Giành quyền bổ sung | Khi Player chính trả lời sai/hết giờ, các Player khác có **5 giây** để bấm chuông                                |
| Điểm giành quyền    | Đúng: **nhận điểm của câu, trừ từ điểm của Player chính**; sai: bị trừ **một nửa** điểm câu                      |
| Hình thức trả lời   | Nhập trên thiết bị (mặc định) hoặc trả lời bằng lời – xem BR-ROUND-02; áp dụng cho cả Player chính và giành quyền |

**Luồng:**

1. Player đến lượt chọn gói (3 mức điểm), có thể đăng ký Ngôi sao hy vọng cho từng câu.
2. Hiển thị câu hỏi → đếm ngược → Player chính trả lời.
3. Đúng → cộng điểm. Sai/hết giờ → mở giành quyền cho Player khác.
4. Hết 3 câu → chuyển Player tiếp theo.
5. Hết vòng → tổng kết, xử lý hòa (mục 9.3).

### 7.5. Tùy biến vòng thi

- Host có thể chọn bất kỳ tập con nào của 4 vòng, theo bất kỳ thứ tự nào.
- Mọi thông số trong bảng luật đều chỉnh được (số câu, thời gian, điểm, bật/tắt giành quyền, bật/tắt Ngôi sao hy vọng, cho phép điểm âm...).
- **BR-ROUND-01:** Luật vòng thi được triển khai dưới dạng **module độc lập** cắm vào Game Engine, để có thể bổ sung vòng/format mới mà không sửa các phần khác.

---

## 8. Điều khiển trận đấu

### 8.1. Trạng thái trận đấu

```
Chuẩn bị → Đang diễn ra ⇄ Tạm dừng → Kết thúc
                                    ↘ Hủy
```

### 8.2. Trạng thái một câu hỏi

```
Chờ hiển thị → Đang hiển thị/đọc câu hỏi → Đang nhận trả lời (đếm ngược)
→ Khóa trả lời → [Chờ Host xác nhận] → Đã chấm → Đã công bố đáp án
```

- **BR-GAME-01:** Chỉ chấp nhận câu trả lời khi câu hỏi ở trạng thái **Đang nhận trả lời** và người gửi có quyền trả lời câu đó.
- **BR-GAME-02:** Câu trả lời đến sau thời điểm hết giờ (theo đồng hồ server) bị từ chối. Cho phép sai số mạng **(mặc định đề xuất: 300 ms)**.
- **BR-GAME-03:** Mỗi câu trả lời chỉ được ghi nhận một lần (chống gửi trùng do mạng/bấm nhiều lần).
- **BR-GAME-04:** Khi Tạm dừng, đồng hồ đếm ngược dừng lại và tiếp tục từ thời gian còn lại khi Tiếp tục.

### 8.3. Chế độ thủ công

Host thực hiện: bắt đầu trận; chuyển vòng; chuyển câu; bắt đầu/dừng thời gian; mở chuông; xác nhận đúng/sai; cộng/trừ điểm; mở gợi ý; tạm dừng/tiếp tục; kết thúc trận.

### 8.4. Chế độ tự động theo kịch bản

Hệ thống tự động: chuyển vòng theo thứ tự; hiển thị câu hỏi; đếm ngược; thu câu trả lời; chấm tự động câu có đáp án xác định; cập nhật bảng điểm; chuyển câu sau khoảng nghỉ cấu hình **(mặc định đề xuất: 3 giây hiển thị đáp án)**.

- **BR-GAME-05:** Câu cần chấm thủ công (trả lời ngắn không khớp, đáp án CNV, trả lời bằng lời) → trận chuyển sang **Chờ Host xác nhận**, không tự chuyển câu.
- **BR-GAME-06:** Host vẫn có quyền tạm dừng, tiếp tục, bỏ qua câu, chấm lại, điều chỉnh điểm trong chế độ tự động.

### 8.5. Can thiệp và tình huống đặc biệt

| Tình huống                                       | Xử lý                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Câu hỏi lỗi (sai nội dung, media không tải được) | Host **hủy câu**: không tính điểm, thay bằng câu dự phòng (nếu có).            |
| Chấm sai                                         | Host **chấm lại**; điểm được tính lại và đồng bộ.                              |
| Điều chỉnh điểm thủ công                         | Host nhập số điểm + lý do.                                                     |
| Player mất kết nối khi đến lượt                  | Tạm dừng tự động hoặc tính là bỏ qua (cấu hình).                               |
| Bấm chuông đồng thời                             | Server quyết định theo thứ tự nhận được; công bố người giành quyền cho tất cả. |

- **BR-GAME-07:** Mọi hành động can thiệp của Host được ghi **nhật ký (audit log)**: thời gian, người thực hiện, giá trị trước/sau, lý do.

---

## 9. Điểm số và kết quả

### 9.1. Nguyên tắc tính điểm

- **BR-SCORE-01:** Điểm chỉ được tính ở server; client chỉ hiển thị.
- **BR-SCORE-02:** Điểm cập nhật ngay sau khi mỗi câu được chấm và đồng bộ tới tất cả người tham gia.
- **BR-SCORE-03:** Điểm tổng mặc định không âm (trừ khi kịch bản bật cho phép điểm âm).
- **BR-SCORE-04:** Mỗi lần thay đổi điểm là một bản ghi riêng (câu hỏi, lý do, giá trị) để có thể truy vết và tính lại.

### 9.2. Bảng điểm

Hiển thị cho mỗi Player: vị trí, tên, ảnh, tổng điểm, điểm theo vòng, thứ hạng hiện tại, trạng thái kết nối. Có hiệu ứng khi điểm thay đổi.

### 9.3. Xử lý hòa điểm

**(mặc định đề xuất)** Khi các Player dẫn đầu hòa điểm sau vòng cuối:

1. Câu hỏi phụ (tie-break) giành quyền bằng chuông; trả lời đúng đầu tiên thắng.
2. Nếu Host tắt câu hỏi phụ: đồng hạng.

### 9.4. Kết thúc trận

- Tổng kết: thứ hạng, điểm từng vòng, người chiến thắng, hiệu ứng công bố.
- Thống kê từng Player: số câu đúng/sai/bỏ qua, thời gian trả lời trung bình, số lần giành quyền thành công.
- Hiển thị đáp án và giải thích của các câu hỏi (tùy Host bật).

---

## 10. Đồng bộ realtime

### 10.1. Dữ liệu đồng bộ

| Dữ liệu                                            | Người nhận                                  |
| -------------------------------------------------- | ------------------------------------------- |
| Trạng thái trận, vòng, câu hỏi hiện tại            | Tất cả                                      |
| Nội dung câu hỏi                                   | Tất cả, **chỉ khi câu hỏi được hiển thị**   |
| Đáp án đúng                                        | Host (luôn); người khác **chỉ khi công bố** |
| Đồng hồ đếm ngược (thời điểm kết thúc theo server) | Tất cả                                      |
| Trạng thái trả lời của Player (đã trả lời/chưa)    | Tất cả                                      |
| Nội dung câu trả lời của Player                    | Host ngay khi nhận; người khác khi công bố  |
| Kết quả đúng/sai, điểm, thứ hạng                   | Tất cả                                      |
| Trạng thái kết nối, camera, micro                  | Tất cả                                      |
| Reaction                                           | Tất cả                                      |

- **BR-RT-01:** Đáp án đúng không bao giờ được gửi xuống thiết bị Player/Spectator trước thời điểm công bố.
- **BR-RT-02:** Đồng hồ hiển thị trên client tính từ thời điểm kết thúc do server gửi (đã hiệu chỉnh độ lệch đồng hồ), không tự đếm độc lập.
- **BR-RT-03:** Mỗi trạng thái có số phiên bản tăng dần; client bỏ qua cập nhật cũ hơn trạng thái đang có.

---

## 11. Video call và voice chat

### 11.1. Chức năng

- Hiển thị video trực tiếp của 2–4 Player và Host; Player, Host và Spectator đều xem được video của Host.
- Bật/tắt camera, micro; hiển thị trạng thái micro, camera, chất lượng kết nối.
- Player và Host nghe, nói với nhau.
- Spectator xem video và nghe âm thanh, **không** phát camera/micro.

### 11.2. Quyền của Host

- Tắt micro/camera của Player (Player không tự bật lại được nếu Host khóa).
- Bật chế độ "chỉ Player đến lượt được nói" trong các phần thi riêng.
- Tắt tiếng toàn phòng.

### 11.3. Quy tắc

- **BR-AV-01:** Player tham gia không có camera/micro vẫn được thi (hiển thị ảnh đại diện).
- **BR-AV-02:** Sự cố video/âm thanh không làm gián đoạn luồng trận đấu (hai kênh độc lập).
- **BR-AV-03:** Không ghi hình/ghi âm trận đấu ở phiên bản đầu; luồng audio/video chỉ truyền trực tiếp, không lưu trên server. Nếu bổ sung sau (mục 17) phải có thông báo và sự đồng ý của mọi người tham gia trước khi ghi.
- **BR-AV-04:** Spectator chỉ nhận luồng audio/video, không phát; số Spectator mỗi phòng bị giới hạn theo mục 4.1.

### 11.4. Mở rộng

Toàn màn hình, bố cục video tùy chỉnh, hiệu ứng âm thanh đúng/sai, hiệu ứng chiến thắng.

---

## 12. Mất kết nối và kết nối lại

- **BR-RC-01:** Khi mất kết nối, Player được giữ vị trí và điểm trong **(mặc định đề xuất: 120 giây)**; trạng thái "Mất kết nối" hiển thị cho mọi người.
- **BR-RC-02:** Khi kết nối lại (cùng tài khoản/phiên khách), Player nhận đầy đủ trạng thái hiện tại: vòng, câu hỏi, thời gian còn lại, điểm.
- **BR-RC-03:** Câu hỏi diễn ra trong lúc Player mất kết nối được tính là **bỏ qua**, trừ khi Host cho phép trả lời lại (chế độ thủ công).
- **BR-RC-04:** Hết thời gian chờ, Host chọn: tiếp tục chờ, loại Player (giữ điểm hiện tại trong kết quả), hoặc thay bằng Player khác (chỉ khi trận chưa bắt đầu vòng 1).
- **BR-RC-05:** Một tài khoản chỉ có một kết nối hoạt động trong một phòng; kết nối mới thay thế kết nối cũ.

---

## 13. Spectator và tương tác

- Spectator xem video, nghe âm thanh, xem câu hỏi (khi hiển thị), bảng điểm, tiến trình trận.
- Gửi reaction: 👍 ❤️ 😂 🔥; hiển thị dạng hiệu ứng nổi trên màn hình.
- **BR-SPEC-01:** Spectator không được gửi câu trả lời, bấm chuông, điều khiển trận; server từ chối mọi yêu cầu loại này.
- **BR-SPEC-02:** Giới hạn tần suất reaction **(mặc định đề xuất: 1 reaction / giây / người)**; Host có thể tắt reaction.
- **BR-SPEC-03:** Spectator không thấy câu trả lời của Player trước khi công bố (tránh "nhắc bài" qua kênh ngoài).

---

## 14. Lịch sử và thống kê

- Mỗi trận đã kết thúc được lưu: kịch bản (snapshot), danh sách người tham gia, toàn bộ câu hỏi đã dùng, câu trả lời, thời gian trả lời, các lần thay đổi điểm, kết quả cuối, nhật ký can thiệp.
- Host xem lại mọi trận trong phòng của mình; Player xem các trận mình đã tham gia.
- Thống kê Player: số trận, số trận thắng, tỷ lệ trả lời đúng theo môn/chủ đề.
- Thống kê Host: số phòng, số trận, câu hỏi hay bị trả lời sai.
- **BR-HIST-01:** Kết quả trận đã kết thúc không chỉnh sửa được; chỉ Super Admin có thể hủy kết quả (có ghi lý do).

### 14.1. Lưu trữ và dữ liệu cá nhân

- **BR-DATA-01:** Dữ liệu cá nhân lưu trữ gồm: email, tên hiển thị, ảnh đại diện, lịch sử trận. Không lưu audio/video của cuộc gọi (BR-AV-03).
- **BR-DATA-02:** Người dùng đồng ý chính sách quyền riêng tư khi đăng ký; khách được hiển thị thông báo ngắn khi vào phòng. Quyền camera/micro chỉ được xin khi người dùng bật thiết bị.
- **BR-DATA-03:** Người dùng có thể yêu cầu xóa tài khoản: email, ảnh đại diện và hồ sơ bị xóa trong **(mặc định đề xuất: 30 ngày)**; kết quả trận cũ được giữ nhưng ẩn danh hóa ("Người chơi đã xóa") để không làm sai lịch sử của người khác.
- **BR-DATA-04:** Dữ liệu khách chỉ gồm tên hiển thị gắn với trận; phiên khách hết hạn theo BR-AUTH-05.
- **BR-DATA-05:** Nhật ký can thiệp và nhật ký quản trị được giữ **(mặc định đề xuất: 12 tháng)**.
- **BR-DATA-06:** Chính sách dữ liệu phải tuân thủ quy định pháp luật Việt Nam về bảo vệ dữ liệu cá nhân, đặc biệt với người dùng chưa thành niên (học sinh); nội dung chính sách cần được rà soát pháp lý trước khi phát hành.

---

## 15. Quản trị hệ thống

### 15.1. Super Admin

- Quản lý tài khoản: tìm kiếm, khóa/mở khóa, đặt lại mật khẩu, cấp vai trò.
- Cấu hình hệ thống: giới hạn phòng, kích thước media, thời gian chờ, danh sách reaction.
- Giám sát: danh sách phòng đang hoạt động, số người tham gia, tình trạng hệ thống; đóng phòng vi phạm.
- Xem nhật ký hoạt động quản trị.

### 15.2. Manager

- Phạm vi quản lý xác định theo **Tổ chức** (ví dụ: một trường, một câu lạc bộ):
  - Super Admin tạo tổ chức, gán người dùng vào tổ chức và gán Manager cho một hoặc nhiều tổ chức.
  - Ở phiên bản đầu, mỗi người dùng thuộc **tối đa một** tổ chức; người dùng không thuộc tổ chức nào do Super Admin quản lý.
  - Manager quản lý tài khoản (khóa/mở khóa, đặt lại mật khẩu) và giám sát/đóng phòng của người dùng thuộc tổ chức mình; không cấp được vai trò Manager/Super Admin.
- Duyệt/từ chối/gỡ bộ câu hỏi public; xử lý báo cáo nội dung vi phạm.
- Hỗ trợ Host trong trận (vào giám sát, đóng phòng khi cần).

### 15.3. Báo cáo vi phạm

- Người dùng có thể báo cáo câu hỏi public hoặc hành vi trong phòng.
- Manager xử lý: bỏ qua, gỡ nội dung, cảnh báo hoặc khóa tài khoản.

---

## 16. Yêu cầu phi chức năng

| Nhóm             | Yêu cầu                                      | Chỉ tiêu                                                                     |
| ---------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| Realtime         | Độ trễ đồng bộ trạng thái                    | ≤ 300 ms (p95) trong cùng khu vực                                            |
| Video/voice      | Độ trễ audio/video giữa Player và Host       | ≤ 500 ms (p95) trong cùng khu vực                                            |
| Scalability      | Phòng đồng thời                              | Phiên bản đầu: ≥ 200 phòng, ≥ 5.000 kết nối realtime đồng thời; ≥ 100 phòng có video call đồng thời. Mở rộng ngang (thêm instance, SFU riêng cho video) |
| Concurrency      | Nhiều Player gửi trả lời/bấm chuông cùng lúc | Không mất, không trùng, thứ tự xác định bởi server                           |
| Reliability      | Mất kết nối/khởi động lại server             | Trạng thái trận không mất; khôi phục trận đang diễn ra trong ≤ 30 giây       |
| Availability     | Thời gian hoạt động                          | ≥ 99,5% / tháng                                                              |
| Security         | Xác thực, phân quyền, chống gian lận         | Kiểm tra quyền mọi hành động; không lộ đáp án; rate limit                    |
| Media            | Câu hỏi media, video call                    | Media qua CDN/lưu trữ object; video tự điều chỉnh chất lượng theo băng thông |
| Responsive       | Thiết bị                                     | Máy tính, tablet, điện thoại (Chrome, Edge, Safari, Firefox bản mới)         |
| Persistence      | Lưu trữ                                      | Câu hỏi, kịch bản, kết quả, lịch sử, nhật ký (thời hạn theo mục 14.1)        |
| Ngôn ngữ         | Giao diện                                    | Tiếng Việt (đa ngôn ngữ ở giai đoạn sau)                                     |
| Khả năng mở rộng | Kiến trúc                                    | Tách **Game Engine, Room Management, Question Bank, Realtime Communication** |

- **BR-NFR-01:** Các chỉ tiêu trên là chỉ tiêu nghiệm thu cho phiên bản đầu, được xác minh bằng kiểm thử tải trước khi phát hành; điều chỉnh theo số liệu sử dụng thực tế.

---

## 17. Ngoài phạm vi phiên bản đầu và định hướng mở rộng

- Giải đấu nhiều vòng, nhiều phòng, nhiều bảng đấu; giải theo chủ đề/cấp học.
- Nhiều bộ luật thi đấu, format gameshow khác.
- Hệ thống xếp hạng, thành tích người chơi.
- AI hỗ trợ tạo câu hỏi, đáp án, giải thích; phân loại câu hỏi theo môn, lớp, độ khó.
- Thống kê quá trình học tập của từng người chơi.
- Cộng đồng đánh giá, xếp hạng ngân hàng câu hỏi.
- Ghi hình, phát lại trận đấu.

---

## 18. Quyết định cho các vấn đề cần làm rõ

> Các quyết định này được theo dõi trạng thái tại [decision log](decision-log.md) (DL-001 → DL-009).

| #   | Câu hỏi | Quyết định | Mục cập nhật |
| --- | ------- | ---------- | ------------ |
| Q1  | Có cho phép tham gia không cần tài khoản (Guest) không? Áp dụng cho Player hay chỉ Spectator? | **Có**, áp dụng cho **cả Player và Spectator**, khi phòng bật "Cho phép khách" (mặc định bật). Khách dùng phiên khách để kết nối lại, không có lịch sử lâu dài, không làm Host. | 3.1, BR-AUTH-05, BR-AUTH-06, 4.1, BR-DATA-04 |
| Q2  | Ai được làm Host: mọi tài khoản đăng ký hay chỉ tài khoản được cấp quyền? | **Mọi tài khoản đăng ký đã xác minh email**. Super Admin có thể thu hồi quyền Host của tài khoản vi phạm. | BR-AUTH-01 |
| Q3  | Luật điểm mặc định các vòng (mục 7) có cần bám sát một phiên bản luật cụ thể không? | **Không**. Luật mặc định lấy cảm hứng từ format truyền hình, cung cấp dưới dạng preset; mọi thông số Host chỉnh được. | Mục 7, BR-ROUND-00 |
| Q4  | Vòng Khởi động/Về đích: Player trả lời bằng lời (Host chấm) hay nhập trên thiết bị, hay hỗ trợ cả hai? | **Hỗ trợ cả hai**, cấu hình theo vòng; mặc định **nhập trên thiết bị** (để chấm tự động được). Trả lời bằng lời luôn chờ Host chấm. | BR-ROUND-02, 7.1, 7.4 |
| Q5  | Phạm vi quản lý của Manager được xác định theo tổ chức, nhóm hay danh sách người dùng? | Theo **Tổ chức**. Mỗi người dùng thuộc tối đa một tổ chức; một Manager có thể quản lý nhiều tổ chức. Kiểm duyệt bộ public không giới hạn theo tổ chức. | 2.1, 15.2, BR-QB-10 |
| Q6  | Bộ câu hỏi public có bắt buộc kiểm duyệt trước khi hiển thị không? | **Có**, bắt buộc kiểm duyệt trước. Sửa bộ đã duyệt tạo phiên bản mới chờ duyệt; phiên bản cũ vẫn hiển thị. | 5.4, BR-QB-09 |
| Q7  | Spectator có xem video của Host không? Có giới hạn số Spectator mỗi phòng không? | **Có** xem video Host. **Có** giới hạn: mặc định 50/phòng, Host chỉnh được tới mức tối đa hệ thống (mặc định 200). | 4.1, 11.1, BR-AV-04 |
| Q8  | Có cần ghi hình trận đấu và chính sách lưu trữ dữ liệu cá nhân (ảnh, video) không? | **Không ghi hình** ở phiên bản đầu. **Cần** chính sách dữ liệu cá nhân: không lưu audio/video, xóa tài khoản trong 30 ngày với kết quả trận được ẩn danh, thời hạn lưu nhật ký, rà soát pháp lý. | BR-AV-03, 14.1 |
| Q9  | Các chỉ tiêu phi chức năng (mục 16) có phù hợp quy mô dự kiến không? | **Phù hợp** làm chỉ tiêu nghiệm thu phiên bản đầu; bổ sung chỉ tiêu riêng cho video call (≤ 500 ms, ≥ 100 phòng có video), thời gian khôi phục (≤ 30 giây), độ sẵn sàng (≥ 99,5%), xác minh bằng kiểm thử tải. | Mục 16, BR-NFR-01 |
