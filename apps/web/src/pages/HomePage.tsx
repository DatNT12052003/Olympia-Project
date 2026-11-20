import { SystemPermission } from '@olympia/shared';
import { Link } from 'react-router';
import { userHasPermission, useAuth } from '../features/auth/use-auth';
import { SystemStatus } from '../features/system/SystemStatus';

export function HomePage() {
  const { user } = useAuth();
  const canHost = userHasPermission(user, SystemPermission.CreateRooms);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <section aria-labelledby="home-heading">
        <h1
          id="home-heading"
          className="text-3xl font-bold tracking-tight text-stage-900 sm:text-4xl lg:text-5xl"
        >
          Olympia Online
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
          Sân chơi kiến thức trực tuyến theo format gameshow: tạo phòng thi, mời bạn bè và cùng
          tranh tài qua bốn vòng thi với bảng điểm cập nhật theo thời gian thực.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/vao-phong"
            className="inline-flex h-11 items-center rounded-lg bg-accent-400 px-5 text-[15px] font-bold text-stage-900 no-underline hover:bg-accent-500 hover:text-stage-900 hover:no-underline"
          >
            Vào phòng bằng mã
          </Link>
          {canHost && (
            <Link
              to="/phong-thi"
              className="inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-[15px] font-semibold text-white no-underline hover:bg-brand-700 hover:text-white hover:no-underline"
            >
              Phòng thi của tôi
            </Link>
          )}
        </div>
        <p className="mt-6 inline-flex rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
          Đang trong giai đoạn phát triển
        </p>
      </section>

      <SystemStatus />
    </div>
  );
}
