# mo-ta-du-an-olympia

# MÔ TẢ NGHIỆP VỤ DỰ ÁN – OLYMPIA ONLINE

## 1. Tổng quan dự án

**Olympia Online** là nền tảng tổ chức các cuộc thi kiến thức trực tuyến theo format gameshow Đường lên đỉnh Olympia của VTV.

Hệ thống cho phép nhiều Host tạo và tổ chức các phòng thi độc lập. Người chơi tham gia bằng thiết bị cá nhân, trả lời câu hỏi theo từng vòng thi, tương tác với các thí sinh khác và theo dõi bảng điểm theo thời gian thực.

Mục đích chính:

- Tạo sân chơi kiến thức trực tuyến cho gia đình, bạn bè và học sinh.
- Hỗ trợ ôn tập kiến thức thông qua hình thức thi đấu.
- Tạo trải nghiệm gameshow với video call, âm thanh, hiệu ứng và bảng điểm realtime.
- Cho phép chia sẻ ngân hàng câu hỏi giữa các Host.
- Có khả năng mở rộng thành nền tảng tổ chức nhiều cuộc thi đồng thời.

## 2. Vai trò người dùng (User Roles)

Hệ thống gồm 5 vai trò:

| Role | Quyền hạn |
| --- | --- |
| Super Admin | Quản lý toàn bộ hệ thống, người dùng, phân quyền, cấu hình và giám sát tất cả phòng thi. |
| Manager | Quản lý người dùng theo phạm vi được cấp, quản lý ngân hàng câu hỏi, kiểm duyệt nội dung và hỗ trợ vận hành. |
| Host | Tạo phòng thi, quản lý người chơi, thiết lập kịch bản, ngân hàng câu hỏi, điều khiển và giám sát trận đấu. |
| Player | Tham gia phòng thi, trả lời câu hỏi, sử dụng micro/camera và theo dõi điểm số của bản thân. |
| Spectator | Tham gia theo dõi trận đấu, xem video và bảng điểm, chỉ được gửi reaction, không được tham gia trả lời hoặc điều khiển trận đấu. |

## 3. Quản lý phòng thi (Room Management)

Host có thể:

- Tạo phòng thi mới.
- Thiết lập tên phòng, mô tả, số lượng người chơi (tối thiểu 2, tối đa 4).
- Thiết lập chế độ phòng: công khai hoặc riêng tư.
- Tạo mã phòng hoặc đường dẫn mời người tham gia.
- Phân bổ vị trí cho các Player.
- Cho phép Spectator tham gia theo dõi.
- Bắt đầu, tạm dừng, tiếp tục và kết thúc trận đấu.
- Quản lý nhiều trận đấu theo các phòng độc lập.

Một Host có thể tổ chức nhiều phòng thi, đồng thời hệ thống hỗ trợ nhiều Host hoạt động và tổ chức các trận đấu cùng lúc.

## 4. Các vòng thi (Game Rounds)

Hệ thống hỗ trợ 4 vòng thi theo format Olympia:

### 4.1. Khởi động

- Các thí sinh lần lượt trả lời câu hỏi.
- Hỗ trợ câu hỏi trắc nghiệm, đúng/sai và trả lời ngắn.
- Có giới hạn thời gian cho mỗi câu hỏi.
- Tính điểm dựa trên kết quả trả lời.

### 4.2. Vượt chướng ngại vật

- Người chơi giải các từ khóa hoặc câu hỏi gợi ý.
- Có thể sử dụng hình ảnh, video hoặc dữ kiện gợi ý.
- Hỗ trợ trả lời từ khóa chính.
- Host có thể xác nhận đáp án và điều khiển việc mở gợi ý.

### 4.3. Tăng tốc

- Các thí sinh cùng trả lời một câu hỏi.
- Hỗ trợ nhiều dạng câu hỏi và giới hạn thời gian.
- Điểm số có thể phụ thuộc vào độ chính xác và tốc độ trả lời.

### 4.4. Về đích

- Mỗi thí sinh lần lượt lựa chọn gói câu hỏi hoặc mức điểm.
- Trả lời câu hỏi trong thời gian quy định.
- Hỗ trợ cơ chế giành quyền trả lời hoặc trả lời bổ sung nếu Host thiết lập.
- Tính điểm theo kết quả và luật chơi được cấu hình.

Các vòng thi phải có khả năng tùy chỉnh, cho phép Host lựa chọn vòng thi, thứ tự và luật chơi thay vì bắt buộc sử dụng đầy đủ cả 4 vòng.

## 5. Ngân hàng câu hỏi (Question Bank)

Host có thể:

- Tạo ngân hàng câu hỏi riêng.
- Tạo, chỉnh sửa, xóa và phân loại câu hỏi.
- Lưu trữ câu hỏi để tái sử dụng trong các trận đấu.
- Phân loại theo môn học, chủ đề, lớp học, độ khó và vòng thi.
- Tạo bộ đề thi bằng cách lựa chọn câu hỏi từ ngân hàng.
- Chia sẻ bộ câu hỏi ở chế độ Public để các Host khác có thể sử dụng.
- Sử dụng bộ câu hỏi Public từ những Host khác.

Các dạng câu hỏi hỗ trợ:

- Trắc nghiệm (Multiple Choice).
- Đúng/Sai (True/False).
- Trả lời ngắn (Short Answer).
- Câu hỏi có hình ảnh.
- Câu hỏi có video.
- Câu hỏi có âm thanh (có thể mở rộng).

Mỗi câu hỏi có thể thiết lập đáp án, giải thích, điểm số, thời gian trả lời và các dữ liệu media đi kèm.

## 6. Điều khiển trận đấu (Game Control)

Hệ thống cung cấp hai chế độ vận hành:

### Chế độ 1: Host điều khiển thủ công

Host chịu trách nhiệm:

- Chuyển vòng thi.
- Chuyển câu hỏi.
- Bắt đầu và kết thúc thời gian trả lời.
- Xác nhận đáp án đúng hoặc sai.
- Cộng/trừ điểm.
- Xử lý các tình huống đặc biệt.
- Tạm dừng và tiếp tục trận đấu.

### Chế độ 2: Tự động theo kịch bản

Host thiết lập kịch bản trước khi bắt đầu trận đấu.

Hệ thống tự động:

- Chuyển vòng thi theo thứ tự.
- Hiển thị câu hỏi theo kịch bản.
- Đếm ngược thời gian.
- Thu nhận câu trả lời.
- Chấm điểm tự động đối với câu hỏi có đáp án xác định.
- Cập nhật bảng điểm.
- Chuyển sang câu hỏi tiếp theo.

Host vẫn có quyền tạm dừng, tiếp tục hoặc can thiệp vào trận đấu khi cần thiết.

Đối với câu hỏi cần đánh giá thủ công, hệ thống chuyển trạng thái chờ Host xác nhận đáp án.

## 7. Video Call và Voice Chat

Hệ thống hỗ trợ giao tiếp realtime trong phòng thi:

- Hiển thị video trực tiếp của 2–4 Player.
- Hỗ trợ bật/tắt camera.
- Hỗ trợ bật/tắt micro.
- Cho phép người chơi nghe và nói chuyện với nhau.
- Hiển thị trạng thái micro, camera và kết nối.
- Spectator có thể xem video của các thí sinh và nghe âm thanh trận đấu nhưng không được phát biểu.
- Host có quyền quản lý trạng thái âm thanh, video và quyền phát biểu trong phòng.

Có thể mở rộng thêm:

- Chế độ toàn màn hình.
- Bố cục video tùy chỉnh.
- Hiệu ứng âm thanh khi trả lời đúng/sai.
- Hiệu ứng chiến thắng và công bố kết quả.

## 8. Realtime và tương tác

Tất cả người tham gia được đồng bộ trạng thái trận đấu theo thời gian thực.

Các thông tin cần đồng bộ:

- Vòng thi hiện tại.
- Câu hỏi hiện tại.
- Thời gian đếm ngược.
- Trạng thái trả lời của từng Player.
- Kết quả đúng/sai.
- Điểm số và thứ hạng.
- Trạng thái trận đấu.
- Trạng thái kết nối của người tham gia.

Spectator được phép:

- Gửi reaction như 👍, ❤️, 😂, 🔥.
- Theo dõi bảng điểm realtime.
- Theo dõi tiến trình trận đấu.

Spectator không được gửi câu trả lời, giành quyền trả lời hoặc tác động đến kết quả trận đấu.

## 9. Bảng điểm và kết quả

- Tự động cập nhật điểm số sau mỗi câu hỏi.
- Hiển thị điểm của từng thí sinh.
- Hiển thị thứ hạng realtime.
- Lưu lịch sử trận đấu.
- Tổng kết kết quả khi kết thúc.
- Công bố người chiến thắng.
- Lưu thống kê số câu đúng, sai, bỏ qua và thời gian trả lời.
- Cho phép xem lại kết quả các trận đấu trước đó.

## 10. Các yêu cầu phi chức năng

- **Realtime:** Đồng bộ dữ liệu trận đấu nhanh và ổn định.
- **Scalability:** Hỗ trợ nhiều phòng thi và nhiều Host hoạt động đồng thời.
- **Security:** Xác thực người dùng, phân quyền theo Role, kiểm soát quyền truy cập phòng thi.
- **Concurrency:** Đảm bảo nhiều người chơi gửi câu trả lời cùng lúc không gây sai lệch dữ liệu.
- **Reliability:** Có cơ chế xử lý mất kết nối và kết nối lại khi đang thi.
- **Media:** Tối ưu truyền tải video, âm thanh và media trong câu hỏi.
- **Responsive:** Hỗ trợ máy tính, tablet và điện thoại.
- **Data Persistence:** Lưu trữ câu hỏi, kết quả và lịch sử trận đấu.

## 11. Định hướng mở rộng

- Tổ chức giải đấu nhiều vòng, nhiều phòng và nhiều bảng đấu.
- Tạo giải đấu theo chủ đề hoặc cấp học.
- Hỗ trợ nhiều bộ luật thi đấu khác nhau.
- Xây dựng hệ thống xếp hạng và thành tích người chơi.
- AI hỗ trợ tạo câu hỏi, đáp án và giải thích.
- AI phân loại câu hỏi theo môn học, lớp học và độ khó.
- Thống kê quá trình học tập và kiến thức của từng người chơi.
- Cho phép cộng đồng chia sẻ và đánh giá ngân hàng câu hỏi.

## 12. Phạm vi sản phẩm

Sản phẩm hướng tới một nền tảng gameshow kiến thức trực tuyến đa phòng, đa người chơi, có khả năng tái sử dụng ngân hàng câu hỏi và tổ chức trận đấu theo thời gian thực.

Nguyên tắc thiết kế quan trọng:

**Tách biệt Game Engine, Room Management, Question Bank và Realtime Communication** để có thể mở rộng thêm nhiều format gameshow khác trong tương lai mà không phải xây dựng lại toàn bộ hệ thống.