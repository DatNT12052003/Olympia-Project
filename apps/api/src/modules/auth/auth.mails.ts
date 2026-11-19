import { EMAIL_VERIFICATION_TTL_HOURS, PASSWORD_RESET_TTL_MINUTES } from '@olympia/shared';
import { escapeHtml, type MailMessage } from '../../shared/mail/mailer';

function layout(title: string, intro: string, actionLabel: string, url: string, note: string) {
  const html = `<!doctype html>
<html lang="vi"><body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
<h2>${escapeHtml(title)}</h2>
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#1e3a8a;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(actionLabel)}</a></p>
<p style="font-size:13px;color:#475569">Nếu nút không hoạt động, mở liên kết sau:<br>${escapeHtml(url)}</p>
<p style="font-size:13px;color:#475569">${escapeHtml(note)}</p>
</body></html>`;
  const text = `${title}\n\n${intro}\n\n${actionLabel}: ${url}\n\n${note}`;
  return { html, text };
}

export function verificationEmail(to: string, displayName: string, url: string): MailMessage {
  const subject = 'Xác minh email tài khoản Olympia Online';
  return {
    to,
    subject,
    ...layout(
      subject,
      `Chào ${displayName}, hãy xác minh email để bắt đầu tạo phòng thi và ngân hàng câu hỏi.`,
      'Xác minh email',
      url,
      `Liên kết có hiệu lực trong ${EMAIL_VERIFICATION_TTL_HOURS} giờ. Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này.`,
    ),
  };
}

export function passwordResetEmail(to: string, displayName: string, url: string): MailMessage {
  const subject = 'Đặt lại mật khẩu Olympia Online';
  return {
    to,
    subject,
    ...layout(
      subject,
      `Chào ${displayName}, chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.`,
      'Đặt lại mật khẩu',
      url,
      `Liên kết có hiệu lực trong ${PASSWORD_RESET_TTL_MINUTES} phút và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu hiện tại vẫn giữ nguyên.`,
    ),
  };
}

export function deletionRequestedEmail(
  to: string,
  displayName: string,
  url: string,
  purgeDate: string,
): MailMessage {
  const subject = 'Yêu cầu xóa tài khoản Olympia Online';
  return {
    to,
    subject,
    ...layout(
      subject,
      `Chào ${displayName}, tài khoản của bạn sẽ bị xóa vào ngày ${purgeDate}. Trước thời điểm đó bạn vẫn có thể giữ lại tài khoản.`,
      'Giữ lại tài khoản',
      url,
      `Sau khi xóa, email, ảnh đại diện và hồ sơ bị xóa; kết quả các trận đã thi được giữ dưới tên "Người chơi đã xóa". Nếu bạn không yêu cầu xóa, hãy mở liên kết trên và đổi mật khẩu ngay.`,
    ),
  };
}
