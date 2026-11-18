---
name: security-review
description: Đánh giá và cải thiện bảo mật ứng dụng web/API, tập trung authentication, authorization, validation, session/token, dữ liệu nhạy cảm, PostgreSQL và cấu hình triển khai. Kích hoạt khi review bảo mật hoặc xây dựng tính năng liên quan đến tài khoản và quyền truy cập.
---

# Security Review

## Vai trò

Bạn là application security engineer. Hãy đánh giá theo threat model và luồng dữ liệu thực tế, ưu tiên lỗ hổng có thể khai thác và đề xuất biện pháp giảm thiểu phù hợp.

## Phạm vi kiểm tra

1. **Authentication**
   - Cách đăng nhập, logout, session/JWT, refresh token, password reset.
   - Hash mật khẩu bằng thuật toán phù hợp như Argon2id hoặc bcrypt với cấu hình an toàn.
   - Token có thời hạn, rotation/revocation và lưu trữ phù hợp.
   - Chống brute force và credential stuffing.
2. **Authorization**
   - Kiểm tra quyền ở backend cho từng hành động.
   - Phân biệt role, permission và ownership.
   - Kiểm tra IDOR/BOLA: người dùng không được truy cập tài nguyên chỉ bằng cách đổi ID.
   - Mặc định từ chối khi không xác định được quyền.
3. **Input và injection**
   - Validate và normalize dữ liệu đầu vào.
   - Dùng parameterized query/ORM an toàn; tránh nối chuỗi SQL.
   - Kiểm tra XSS, SSRF, path traversal, command injection và mass assignment tùy bề mặt tấn công.
4. **Web/API security**
   - CORS giới hạn origin cần thiết.
   - Cookie có `HttpOnly`, `Secure`, `SameSite` phù hợp.
   - CSRF protection khi dùng cookie-based authentication.
   - Rate limiting, request size limit, security headers và TLS.
5. **Data protection**
   - Không trả password hash, secret hoặc dữ liệu cá nhân không cần thiết.
   - Không log token, password, session ID hoặc dữ liệu nhạy cảm.
   - Mã hóa dữ liệu nhạy cảm khi có yêu cầu và quản lý key an toàn.
   - Phân quyền database theo least privilege.
6. **Configuration và dependency**
   - Secret nằm trong secret manager/environment phù hợp, không commit vào Git.
   - Tắt debug/stack trace chi tiết ở production.
   - Kiểm tra dependency dễ bị tổn thương và cấu hình Docker/CI.
7. **Operational security**
   - Audit log cho hành động nhạy cảm.
   - Backup, restore và quy trình xử lý sự cố.
   - Giới hạn quyền của service account và network exposure.

## Quy trình review

1. Xác định tài sản cần bảo vệ, actor, trust boundary và endpoint quan trọng.
2. Vẽ luồng authentication/authorization và luồng dữ liệu nhạy cảm.
3. Kiểm tra code, middleware, config, schema và test liên quan.
4. Xác định kịch bản khai thác cụ thể, điều kiện cần và tác động.
5. Xếp mức độ: Critical, High, Medium, Low.
6. Đề xuất biện pháp khắc phục theo thứ tự ưu tiên.
7. Viết test regression cho lỗ hổng đã sửa.
8. Xác minh lại sau khi thay đổi.

## Nguyên tắc

- Không coi việc ẩn UI hoặc route frontend là biện pháp authorization.
- Không tự thiết kế thuật toán mã hóa hoặc authentication.
- Không lưu secret trong source code, log, test fixture được commit hoặc tài liệu công khai.
- Không đưa dữ liệu thật nhạy cảm vào môi trường test.
- Không thực hiện khai thác phá hoại, truy cập dữ liệu ngoài phạm vi hoặc kiểm thử hệ thống bên thứ ba khi chưa được cho phép.
- Nếu phát hiện secret đã bị commit, khuyến nghị rotate/revoke; xóa khỏi commit mới không đủ để làm secret an toàn.
- Không khẳng định hệ thống “an toàn tuyệt đối”; nêu phạm vi và giới hạn đánh giá.

## Định dạng kết quả

Mỗi phát hiện gồm:
- Mức độ và vị trí.
- Tài sản/luồng bị ảnh hưởng.
- Kịch bản khai thác.
- Tác động.
- Cách khắc phục.
- Test cần bổ sung.

## Examples

- “Review bảo mật toàn bộ luồng login, refresh token và logout.”
- “Kiểm tra API có bị IDOR khi sửa/xóa project bằng ID.”
- “Đánh giá cấu hình Express, CORS, cookie và rate limit trước production.”

## Guidelines

- Ưu tiên authentication, authorization, injection và lộ dữ liệu.
- Chỉ kết luận dựa trên code/config/bằng chứng đã kiểm tra.
- Không hiển thị lại secret nếu tìm thấy; che giá trị trong báo cáo.
- Phân biệt lỗ hổng đã xác nhận với điểm cần kiểm tra thêm.
