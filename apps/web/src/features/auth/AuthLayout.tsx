import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '../../components/Card';
import { CheckIcon, ChevronLeftIcon } from '../../components/icons';

/**
 * Bố cục các trang tài khoản theo thiết kế (canvas: Login, Register, ForgotPassword):
 * desktop chia đôi — panel navy giới thiệu bên trái, form bên phải; mobile thu gọn panel thành
 * header navy (có nút quay lại nếu cần).
 */

type Pitch = 'login' | 'register';

const ROUNDS = ['Khởi động', 'Vượt chướng ngại vật', 'Tăng tốc', 'Về đích'];
const REGISTER_BENEFITS = [
  'Tạo phòng, mời 2–4 người chơi và khán giả',
  'Xây ngân hàng câu hỏi riêng, dùng bộ câu hỏi public',
  'Lưu lịch sử và thống kê các trận đã thi',
];

function PitchContent({ pitch }: { pitch: Pitch }) {
  if (pitch === 'register') {
    return (
      <div className="flex max-w-[520px] flex-col gap-5">
        <p className="text-[40px] font-extrabold leading-[1.15] tracking-tight">
          Tạo tài khoản để tự tổ chức phòng thi.
        </p>
        <ul className="flex flex-col gap-3.5 text-base text-stage-200">
          {REGISTER_BENEFITS.map((item) => (
            <li key={item} className="flex items-start gap-3">
              <CheckIcon size={22} className="shrink-0 text-accent-400" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="flex max-w-[520px] flex-col gap-5">
      <p className="text-[44px] font-extrabold leading-[1.15] tracking-tight">
        Sân chơi kiến thức cho cả lớp, cả nhà.
      </p>
      <p className="text-[17px] leading-relaxed text-stage-200">
        Tạo phòng thi, mời 2–4 người chơi và cùng tranh tài qua bốn vòng: Khởi động, Vượt chướng
        ngại vật, Tăng tốc, Về đích.
      </p>
      <ul className="flex flex-wrap gap-2.5" aria-label="Bốn vòng thi">
        {ROUNDS.map((round, index) => (
          <li
            key={round}
            className={`rounded-full px-3.5 py-2 text-sm font-semibold ${
              index === ROUNDS.length - 1
                ? 'bg-accent-400 font-bold text-stage-900'
                : 'bg-stage-800 text-white'
            }`}
          >
            {round}
          </li>
        ))}
      </ul>
    </div>
  );
}

function JoinRoomLink({ pitch, onDark }: { pitch: Pitch; onDark: boolean }) {
  const linkClass = onDark
    ? 'font-semibold text-accent-400 hover:text-accent-400 hover:underline'
    : 'font-semibold';
  return (
    <p className={`text-sm ${onDark ? 'text-stage-200' : 'text-slate-600'}`}>
      {pitch === 'register' ? 'Chỉ muốn chơi?' : 'Có mã phòng?'}{' '}
      <Link to="/vao-phong" className={linkClass}>
        {pitch === 'register' ? 'Vào phòng bằng mã' : 'Vào phòng không cần tài khoản'}
      </Link>
    </p>
  );
}

export interface AuthLayoutProps {
  title: string;
  /** Dòng dưới tiêu đề (ví dụ link chuyển giữa đăng nhập/đăng ký). */
  subtitle?: ReactNode;
  pitch?: Pitch;
  /** Nút quay lại trên header mobile. */
  backTo?: { to: string; label: string };
  children: ReactNode;
}

export function AuthLayout({
  title,
  subtitle,
  pitch = 'login',
  backTo,
  children,
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-slate-900 lg:flex-row">
      <aside className="hidden flex-col justify-between gap-12 bg-stage-900 px-14 py-12 text-white lg:flex lg:flex-[1_1_520px]">
        <Link
          to="/"
          className="self-start hover:no-underline"
          aria-label="Olympia Online – trang chủ"
        >
          <Wordmark />
        </Link>
        <PitchContent pitch={pitch} />
        <JoinRoomLink pitch={pitch} onDark />
      </aside>

      <header className="flex items-center gap-3 bg-stage-900 px-5 py-4 lg:hidden">
        {backTo && (
          <Link
            to={backTo.to}
            aria-label={backTo.label}
            className="-ml-2 inline-flex size-11 items-center justify-center rounded-lg text-white hover:bg-white/10 hover:text-white"
          >
            <ChevronLeftIcon size={20} />
          </Link>
        )}
        <Link to="/" className="hover:no-underline" aria-label="Olympia Online – trang chủ">
          <Wordmark className="text-lg" />
        </Link>
      </header>

      <main className="flex flex-1 justify-center px-5 py-7 sm:px-6 lg:flex-[1_1_480px] lg:items-center lg:py-12">
        <div className="flex w-full max-w-[420px] flex-col gap-5">
          <div>
            <h1 className="text-[26px] font-extrabold leading-tight sm:text-[28px] sm:font-bold">
              {title}
            </h1>
            {subtitle && (
              <div className="mt-2 text-[15px] leading-normal text-slate-600">{subtitle}</div>
            )}
          </div>
          {children}
          <div className="mt-4 lg:hidden">
            <JoinRoomLink pitch={pitch} onDark={false} />
          </div>
        </div>
      </main>
    </div>
  );
}
