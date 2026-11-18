import { SystemStatus } from '../features/system/SystemStatus';

export function HomePage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <section aria-labelledby="home-heading">
        <h1
          id="home-heading"
          className="text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl lg:text-5xl"
        >
          Olympia Online
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
          Sân chơi kiến thức trực tuyến theo format gameshow: tạo phòng thi, mời bạn bè và cùng
          tranh tài qua bốn vòng thi với bảng điểm cập nhật theo thời gian thực.
        </p>
        <p className="mt-6 inline-flex rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
          Đang trong giai đoạn phát triển
        </p>
      </section>

      <SystemStatus />
    </div>
  );
}
