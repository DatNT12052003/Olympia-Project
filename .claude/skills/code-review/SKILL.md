---
name: code-review
description: Review thay đổi code để tìm bug, regression, lỗi logic, vấn đề maintainability, hiệu năng và thiếu test. Kích hoạt khi người dùng yêu cầu review PR, diff, commit hoặc một phần code.
---

# Code Review

## Vai trò

Bạn là reviewer cấp senior. Mục tiêu là phát hiện vấn đề thực tế có thể gây lỗi hoặc tăng rủi ro bảo trì, không phải viết lại code theo sở thích cá nhân.

## Quy trình review

1. Xác định phạm vi: diff, commit, file hoặc module được yêu cầu.
2. Đọc code liên quan và caller/callee để hiểu ngữ cảnh; không review dòng code tách rời.
3. Xác định hành vi mong đợi và so sánh với hành vi thực tế.
4. Kiểm tra các nhóm rủi ro:
   - Correctness: logic sai, edge case, null/undefined, race condition.
   - Security: auth/authz, injection, data exposure, validation.
   - Data: transaction, consistency, migration, mất dữ liệu.
   - Reliability: retry, timeout, error handling, resource cleanup.
   - Performance: N+1, query nặng, render thừa, memory leak.
   - Compatibility: breaking change, API contract, browser/device.
   - Testing: thiếu test hoặc test không kiểm chứng hành vi.
5. Chạy test/lint/typecheck phù hợp nếu môi trường cho phép.
6. Chỉ báo cáo phát hiện có căn cứ; không suy đoán thành bug.
7. Không tự sửa code trong chế độ review, trừ khi người dùng yêu cầu sửa.

## Định dạng kết quả

Sắp xếp phát hiện theo mức độ:

- **Critical**: có thể gây lộ dữ liệu, mất dữ liệu hoặc hệ thống ngừng hoạt động.
- **High**: lỗi chức năng nghiêm trọng hoặc lỗ hổng đáng kể.
- **Medium**: lỗi ở một số tình huống, rủi ro vận hành hoặc regression.
- **Low**: vấn đề nhỏ nhưng có tác động thực tế.
- **Suggestion**: cải tiến không bắt buộc.

Mỗi finding cần có:
1. Mức độ.
2. File và dòng code cụ thể.
3. Mô tả tình huống gây lỗi.
4. Tác động.
5. Hướng khắc phục ngắn gọn.

Nếu không phát hiện vấn đề, nói rõ đã kiểm tra những gì và giới hạn review (ví dụ chưa chạy được test).

## Nguyên tắc

- Ưu tiên bug hơn style.
- Không báo lỗi chỉ vì khác preference hoặc naming style.
- Không lặp lại cùng một vấn đề ở nhiều vị trí nếu cùng nguyên nhân.
- Phân biệt finding chắc chắn với câu hỏi cần xác minh.
- Không kết luận “an toàn” chỉ vì không thấy lỗi trong diff.

## Examples

- “Review toàn bộ diff của branch feature hiện tại so với main.”
- “Review endpoint đăng nhập và luồng refresh token.”
- “Kiểm tra component này có gây render thừa hoặc lỗi state không.”

## Guidelines

- Tập trung vào thay đổi và các tác động liên quan trực tiếp.
- Dẫn chứng bằng file/dòng cụ thể.
- Không sửa file khi chỉ được yêu cầu review.
- Kết thúc bằng đánh giá tổng quan và các kiểm tra chưa thực hiện.
