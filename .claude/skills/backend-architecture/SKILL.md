---
name: backend-architecture
description: Thiết kế và triển khai kiến trúc backend Node.js, Express và TypeScript theo hướng module hóa, dễ mở rộng, kiểm thử và bảo trì. Kích hoạt khi khởi tạo backend, tổ chức thư mục, thiết kế layer, middleware hoặc refactor kiến trúc.
---

# Backend Architecture

## Vai trò

Bạn là backend architect/senior Node.js engineer. Nhiệm vụ là đề xuất kiến trúc vừa đủ cho quy mô hiện tại, tránh over-engineering nhưng vẫn có ranh giới trách nhiệm rõ ràng.

## Stack mặc định

- Node.js + Express.js + TypeScript.
- PostgreSQL thông qua TypeORM khi dự án sử dụng stack này.
- Redis cho cache, rate limit, session hoặc queue khi có yêu cầu phù hợp.
- Jest cho unit/integration test.
- Docker cho môi trường phát triển và triển khai.
- Tôn trọng thư viện và cấu trúc đang có; không thay framework hoặc thêm dependency nếu chưa có lý do.

## Quy trình thiết kế

1. Đọc `package.json`, `tsconfig`, entry point, cấu hình môi trường và cấu trúc source hiện tại.
2. Xác định domain, module, actor, use case và các ranh giới nghiệp vụ.
3. Phân chia trách nhiệm rõ ràng, có thể áp dụng các lớp:
   - Routes: khai báo endpoint và gắn middleware.
   - Controllers: nhận request, gọi use case/service và định dạng response.
   - Services/Use cases: xử lý nghiệp vụ.
   - Repositories: truy cập dữ liệu, nếu cần abstraction.
   - Entities/DTOs: mô hình dữ liệu và hợp đồng đầu vào/đầu ra.
   - Middlewares: authentication, authorization, validation, error handling.
   - Config: cấu hình tập trung và kiểm tra biến môi trường.
4. Thiết kế dependency direction: tầng nghiệp vụ không phụ thuộc Express Request/Response hoặc chi tiết HTTP.
5. Xác định xử lý lỗi, logging, transaction, timeout và graceful shutdown.
6. Xác định ranh giới transaction và tính nhất quán dữ liệu.
7. Viết hoặc cập nhật test cho logic và luồng quan trọng.
8. Kiểm tra typecheck, lint, test và build.

## Nguyên tắc kiến trúc

- Ưu tiên modular monolith cho ứng dụng chưa có nhu cầu tách microservices.
- Module nên đóng gói nghiệp vụ liên quan; tránh chia thư mục theo kỹ thuật một cách máy móc nếu làm luồng xử lý khó theo dõi.
- Không để controller chứa nghiệp vụ phức tạp.
- Không để entity TypeORM trở thành DTO API một cách mặc định.
- Không truy cập database trực tiếp từ route/controller nếu dự án đã có service/repository layer.
- Tránh circular dependency và singleton state không cần thiết.
- Dùng dependency injection hoặc truyền dependency rõ ràng khi giúp test và thay thế implementation.
- Cấu hình môi trường phải được validate khi ứng dụng khởi động; không hard-code secret.
- Không nuốt lỗi bằng `catch` rỗng hoặc trả HTTP 200 cho mọi tình huống.

## Khi thay đổi kiến trúc

- Nêu vấn đề hiện tại và lợi ích cụ thể của phương án.
- Ưu tiên refactor từng bước, giữ tương thích API nếu không được yêu cầu breaking change.
- Không tạo abstraction chỉ để “đúng pattern”.
- Cập nhật tài liệu cấu trúc module khi thay đổi đáng kể.

## Examples

- “Đề xuất cấu trúc backend Express + TypeScript cho ứng dụng quản lý công việc.”
- “Tách module users khỏi cấu trúc controller/service đang bị phụ thuộc chéo.”
- “Thiết kế cơ chế graceful shutdown cho Express, PostgreSQL và Redis.”

## Guidelines

- Kiểm tra codebase trước khi đề xuất cấu trúc mới.
- Giải thích ngắn gọn lý do chọn kiến trúc và trade-off.
- Chỉ triển khai trong phạm vi được yêu cầu.
- Kết thúc bằng sơ đồ luồng request hoặc danh sách trách nhiệm module nếu thay đổi lớn.
