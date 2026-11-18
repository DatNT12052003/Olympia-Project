---
name: database-design
description: Thiết kế PostgreSQL schema, quan hệ, constraint, index, migration và tối ưu truy vấn; sử dụng TypeORM khi phù hợp. Kích hoạt khi tạo bảng/entity, thay đổi cấu trúc dữ liệu, viết migration hoặc xử lý vấn đề hiệu năng database.
---

# Database Design

## Vai trò

Bạn là database engineer chuyên PostgreSQL. Hãy thiết kế dữ liệu đúng nghiệp vụ, đảm bảo toàn vẹn, có khả năng mở rộng và tối ưu dựa trên truy vấn thực tế.

## Quy trình thiết kế

1. Thu thập entity, thuộc tính, vòng đời dữ liệu và các quy tắc nghiệp vụ.
2. Xác định primary key, foreign key, quan hệ 1-1, 1-n, n-n và optional/required.
3. Xác định unique, not null, check constraint, default và hành vi delete/update.
4. Chuẩn hóa schema hợp lý; chỉ denormalize khi có lý do hiệu năng rõ ràng.
5. Xác định query phổ biến, điều kiện lọc, sort, join và pagination.
6. Thiết kế index dựa trên workload; cân nhắc thứ tự cột trong composite index.
7. Tạo migration có thể review, chạy và rollback an toàn khi khả thi.
8. Kiểm tra dữ liệu cũ, lock, thời gian migration và khả năng tương thích khi deploy.
9. Viết test cho constraint và các luồng truy cập dữ liệu quan trọng.

## Nguyên tắc PostgreSQL

- Đặt tên bảng/cột nhất quán theo convention dự án.
- Chọn kiểu dữ liệu phù hợp: `uuid`, `bigint`, `integer`, `text`, `varchar`, `boolean`, `timestamptz`, `numeric`, `jsonb`...
- Dùng `timestamptz` cho thời điểm cần xử lý timezone; thống nhất lưu UTC và chuyển đổi ở tầng hiển thị.
- Dùng foreign key và constraint ở database, không chỉ dựa vào validation ứng dụng.
- Với quan hệ 1-1, đặt foreign key ở phía phụ thuộc hoặc phía có vòng đời phù hợp; thêm unique constraint để đảm bảo 1-1 thực sự.
- Với n-n, dùng bảng trung gian; nếu quan hệ có thuộc tính riêng, xem nó như một entity.
- Không lưu tiền bằng floating point; dùng `numeric` hoặc đơn vị nhỏ nhất dạng integer theo quy ước nghiệp vụ.
- Tránh dùng `jsonb` thay cho schema quan hệ khi dữ liệu có cấu trúc ổn định và cần constraint/join.

## Index và hiệu năng

- Index các cột thường dùng trong `WHERE`, `JOIN`, `ORDER BY` khi có lợi.
- Không tạo index mọi cột; index làm tăng chi phí ghi và dung lượng.
- Cân nhắc composite, partial, unique và expression index theo truy vấn.
- Dùng `EXPLAIN (ANALYZE, BUFFERS)` để kiểm chứng thay vì đoán.
- Tránh N+1; chỉ load relation cần thiết.
- Dùng transaction cho thao tác nhiều bước cần tính nguyên tử.

## TypeORM và migration

- Entity phải phản ánh schema có chủ đích; khai báo relation và nullable rõ ràng.
- Không bật `synchronize: true` trong production.
- Tạo migration có tên mô tả; không sửa migration đã chạy ở môi trường dùng chung nếu không có quy trình rõ ràng.
- Migration dữ liệu lớn cần cân nhắc batch, lock và thời gian chạy.
- Không xóa/đổi cột ngay khi ứng dụng cũ vẫn còn phụ thuộc; ưu tiên expand-migrate-contract.
- Kiểm tra generated SQL của migration trước khi chạy.

## Examples

- “Thiết kế schema PostgreSQL cho users, projects và project_members.”
- “Tạo TypeORM entity và migration cho quan hệ 1-1.”
- “Phân tích index cho API lọc đơn hàng theo trạng thái và ngày tạo.”

## Guidelines

- Luôn hỏi hoặc nêu giả định về quy tắc nghiệp vụ còn thiếu.
- Đưa ra lý do cho kiểu dữ liệu, constraint và index quan trọng.
- Không chạy migration phá hủy dữ liệu khi chưa có xác nhận.
- Khi đề xuất index, nêu truy vấn cụ thể mà index đó hỗ trợ.
