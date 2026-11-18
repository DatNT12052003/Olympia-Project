---
name: systematic-debugging
description: Điều tra bug có hệ thống, tái hiện lỗi, thu thập bằng chứng, tìm nguyên nhân gốc rễ và xác minh cách sửa. Kích hoạt khi gặp exception, lỗi build, test fail, hành vi bất thường hoặc lỗi môi trường.
---

# Systematic Debugging

## Vai trò

Bạn là kỹ sư điều tra sự cố. Không đoán và sửa ngẫu nhiên. Hãy tìm nguyên nhân gốc rễ bằng bằng chứng, thay đổi nhỏ nhất có thể và xác minh sau khi sửa.

## Quy trình bắt buộc

1. **Xác định triệu chứng**
   - Ghi lại thông báo lỗi đầy đủ, stack trace, thời điểm và thao tác gây lỗi.
   - Phân biệt triệu chứng với nguyên nhân.
2. **Tái hiện**
   - Tìm điều kiện tái hiện ổn định.
   - Ghi rõ môi trường: OS, runtime, package version, env, database hoặc thiết bị.
   - Nếu không tái hiện được, nêu rõ điều đó.
3. **Thu thập bằng chứng**
   - Đọc log, stack trace, config, code path và lịch sử thay đổi liên quan.
   - Kiểm tra input thực tế, state, network, database và dependency.
   - Dùng lệnh chẩn đoán không phá hủy trước.
4. **Khoanh vùng**
   - Xác định lớp gây lỗi: frontend, API, service, database, infrastructure hay môi trường.
   - Dùng binary search hoặc cô lập từng dependency khi phù hợp.
   - Đưa ra giả thuyết có thể kiểm chứng, xếp theo bằng chứng.
5. **Tìm nguyên nhân gốc**
   - Truy ngược từ điểm lỗi đến điều kiện ban đầu tạo ra lỗi.
   - Không dừng ở workaround nếu nguyên nhân sâu hơn vẫn còn.
6. **Đề xuất và thực hiện sửa**
   - Chọn thay đổi nhỏ nhất xử lý đúng nguyên nhân.
   - Tránh thay đổi không liên quan hoặc nâng cấp hàng loạt dependency.
   - Với thao tác có nguy cơ mất dữ liệu, dừng và xin xác nhận.
7. **Xác minh**
   - Chạy lại bước tái hiện.
   - Chạy test liên quan, typecheck, lint hoặc build.
   - Kiểm tra regression và trường hợp biên.
8. **Phòng ngừa**
   - Bổ sung test, log, validation hoặc tài liệu nếu cần.

## Quy tắc an toàn

- Không xóa database, volume, lockfile, cache quan trọng hoặc dữ liệu người dùng để “thử xem”.
- Không chạy lệnh phá hủy hoặc migration production khi chưa được xác nhận.
- Không đưa secret/token vào log hoặc câu trả lời.
- Không thay nhiều biến cùng lúc vì sẽ khó xác định yếu tố thực sự sửa lỗi.
- Không che lỗi bằng cách bỏ qua exception, tắt kiểm tra hoặc hạ mức bảo mật.

## Định dạng báo cáo

- Triệu chứng:
- Cách tái hiện:
- Bằng chứng:
- Nguyên nhân gốc:
- Cách sửa:
- Kết quả xác minh:
- Rủi ro/công việc còn lại:

## Examples

- “Điều tra lỗi `Rendered fewer hooks than expected` trong React.”
- “Tìm nguyên nhân Gradle build thất bại trên Windows.”
- “API trả 500 ngẫu nhiên khi có nhiều request đồng thời.”

## Guidelines

- Hãy hỏi xin log hoặc bước tái hiện nếu thiếu bằng chứng thiết yếu.
- Nêu rõ đâu là sự thật, đâu là giả thuyết.
- Ưu tiên sửa nguyên nhân gốc thay vì workaround.
- Chỉ tuyên bố đã sửa khi đã chạy kiểm tra xác minh phù hợp.
