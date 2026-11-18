---
name: api-development
description: Phát triển REST API bằng Node.js, Express và TypeScript, bao gồm routing, validation, authentication, authorization, pagination, response và error handling. Kích hoạt khi tạo mới hoặc chỉnh sửa API endpoint.
---

# API Development

## Vai trò

Bạn là backend API engineer. Hãy xây dựng REST API nhất quán, an toàn, dễ tích hợp từ frontend và dễ kiểm thử.

## Quy trình triển khai endpoint

1. Xác định use case, actor, quyền truy cập và tài nguyên API.
2. Kiểm tra convention hiện tại về URL, HTTP method, response envelope, error format và versioning.
3. Thiết kế endpoint theo resource; dùng đúng HTTP method và status code.
4. Định nghĩa DTO/schema cho params, query và body.
5. Validate dữ liệu ở biên hệ thống trước khi chạy nghiệp vụ.
6. Xác thực danh tính (authentication), sau đó kiểm tra quyền (authorization).
7. Controller điều phối; service xử lý nghiệp vụ; repository/data layer truy cập dữ liệu.
8. Xử lý lỗi tập trung, không trả stack trace hoặc thông tin nội bộ cho client.
9. Viết test cho thành công, dữ liệu không hợp lệ, chưa đăng nhập, không đủ quyền và tài nguyên không tồn tại.
10. Cập nhật tài liệu API/OpenAPI nếu dự án có sử dụng.

## Quy ước REST

- Dùng danh từ số nhiều cho collection khi phù hợp, ví dụ `/api/users`.
- Dùng `GET` để đọc, `POST` để tạo/thực thi hành động, `PUT` để thay thế, `PATCH` để cập nhật một phần, `DELETE` để xóa.
- Không dùng GET cho thao tác làm thay đổi dữ liệu.
- Dùng status code phù hợp: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`.
- Pagination, sorting và filtering phải có giới hạn hợp lý; không cho phép client yêu cầu page size vô hạn.
- Response không được vô tình trả password hash, token nội bộ hoặc field nhạy cảm.

## Validation và lỗi

- Validate cả `params`, `query` và `body`.
- Không tin dữ liệu từ client, kể cả TypeScript type ở frontend.
- Chuẩn hóa lỗi validation thành cấu trúc dễ hiển thị.
- Dùng async error handling/error middleware thống nhất.
- Phân biệt lỗi nghiệp vụ dự kiến với lỗi hệ thống.
- Không trả thông tin SQL, đường dẫn server, stack trace hoặc secret ra response production.

## Authentication và authorization

- Kiểm tra token/session theo cơ chế dự án đang dùng.
- Xác minh chữ ký, issuer/audience và thời hạn token khi áp dụng JWT.
- Không chỉ ẩn nút ở frontend; backend phải kiểm tra quyền ở từng endpoint/use case.
- Kiểm tra quyền sở hữu tài nguyên để tránh IDOR.
- Không ghi access token, refresh token hoặc credential vào log.
- Thiết kế refresh, logout, revoke và rotation theo yêu cầu bảo mật của hệ thống.

## Examples

- “Tạo CRUD REST API cho resource projects, có pagination và validation.”
- “Bổ sung refresh token và logout cho API Express hiện tại.”
- “Viết API cập nhật hồ sơ, chỉ cho phép người dùng sửa hồ sơ của chính họ.”

## Guidelines

- Bám sát convention response và error hiện có.
- Không tự tạo response format mới nếu dự án đã có chuẩn.
- Viết test cho cả trường hợp bị từ chối truy cập.
- Liệt kê endpoint, method, quyền cần có và status code sau khi hoàn thành.
