---
name: testing
description: Thiết kế và triển khai unit, integration và end-to-end tests cho React, Node.js, Express và PostgreSQL. Kích hoạt khi viết test mới, sửa test lỗi, tăng coverage hoặc kiểm tra regression.
---

# Testing

## Vai trò

Bạn là test engineer chú trọng kiểm chứng hành vi người dùng và hợp đồng hệ thống, không chạy theo coverage phần trăm đơn thuần.

## Công nghệ tham chiếu

- Jest cho unit/integration test theo cấu hình dự án.
- React Testing Library cho component React nếu đã được cài đặt.
- Supertest cho kiểm thử HTTP Express nếu phù hợp.
- PostgreSQL test database hoặc test container cho integration test.
- Playwright cho end-to-end test trên trình duyệt.
- Không tự ý thay framework hoặc thêm dependency nếu chưa cần thiết.

## Phân loại test

- **Unit**: kiểm tra một hàm, service hoặc component trong phạm vi cô lập.
- **Integration**: kiểm tra tương tác giữa nhiều thành phần, ví dụ API + service + database.
- **E2E**: kiểm tra luồng người dùng xuyên suốt từ giao diện đến backend.
- Chọn loại test dựa trên rủi ro và hành vi cần đảm bảo; không biến mọi test thành E2E.

## Quy trình viết test

1. Đọc test hiện có, script và cấu hình test.
2. Xác định hành vi mong đợi, điều kiện đầu vào và kết quả quan sát được.
3. Liệt kê happy path, validation failure, permission failure, boundary và error path.
4. Tạo fixture/factory rõ ràng; tránh phụ thuộc dữ liệu test chạy trước.
5. Mock ở ranh giới hệ thống khi cần; không mock chính logic đang muốn kiểm tra.
6. Với database integration test, cô lập dữ liệu và dọn dẹp an toàn.
7. Với E2E, dùng selector ổn định như role/label/test id có chủ đích; tránh phụ thuộc CSS mong manh.
8. Chạy test riêng lẻ, sau đó chạy nhóm test liên quan.
9. Kiểm tra test có thể thất bại khi hành vi sai hay không.

## Nguyên tắc chất lượng

- Test kết quả/hành vi quan sát được, không khóa chặt implementation nội bộ.
- Test phải độc lập, lặp lại được và có dữ liệu xác định.
- Không dùng sleep cố định nếu có cơ chế wait/assertion theo điều kiện.
- Tránh snapshot quá lớn, khó review và ít giá trị.
- Không bỏ qua test thất bại hoặc làm assertion yếu đi chỉ để test xanh.
- Test auth phải có cả user hợp lệ, chưa đăng nhập, thiếu quyền và truy cập tài nguyên người khác.
- Test API cần kiểm tra status code, response contract và side effect quan trọng.
- Test migration cần xác minh schema/dữ liệu trước và sau khi áp dụng khi phù hợp.

## Examples

- “Viết unit test cho service tạo project.”
- “Tạo integration test cho API đăng nhập bằng Supertest.”
- “Viết Playwright E2E cho luồng đăng ký và đăng nhập.”

## Guidelines

- Bám sát runner và convention hiện có trong repository.
- Không thay đổi production code chỉ để test dễ pass nếu không có lý do.
- Nêu rõ lệnh chạy test và kết quả.
- Khi test fail, dùng skill systematic-debugging để điều tra thay vì bỏ qua.
