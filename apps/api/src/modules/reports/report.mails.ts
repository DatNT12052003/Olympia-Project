import { escapeHtml, type MailMessage } from '../../shared/mail/mailer';

/** Email cảnh báo khi Manager/Super Admin xử lý báo cáo vi phạm (DL-050). */
export function warningEmail(
  to: string,
  displayName: string,
  category: string,
  target: string,
  note: string,
): MailMessage {
  const subject = 'Cảnh báo vi phạm trên Olympia Online';
  const intro = `Chào ${displayName}, chúng tôi đã xem xét một báo cáo liên quan đến tài khoản của bạn (${category} – ${target}).`;
  const detail = `Ghi chú của quản trị viên: ${note}`;
  const outro =
    'Vui lòng tuân thủ quy định khi sử dụng Olympia Online. Vi phạm lặp lại có thể dẫn đến khóa tài khoản.';
  return {
    to,
    subject,
    text: `${subject}\n\n${intro}\n\n${detail}\n\n${outro}`,
    html: `<!doctype html>
<html lang="vi"><body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
<h2>${escapeHtml(subject)}</h2>
<p>${escapeHtml(intro)}</p>
<p>${escapeHtml(detail)}</p>
<p style="font-size:13px;color:#475569">${escapeHtml(outro)}</p>
</body></html>`,
  };
}
