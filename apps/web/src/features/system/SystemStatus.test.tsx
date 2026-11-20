import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderApp } from '../../test/render';

function systemStatusRegion() {
  return screen.getByRole('region', { name: 'Trạng thái hệ thống' });
}

describe('SystemStatus', () => {
  it('hiển thị trạng thái đang kiểm tra khi chưa có phản hồi', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    renderApp();

    expect(within(systemStatusRegion()).getByRole('status')).toHaveTextContent(
      'Đang kiểm tra hệ thống…',
    );
  });

  it('hiển thị hoạt động bình thường khi mọi phụ thuộc up', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ status: 'ok', checks: { database: 'up', redis: 'up' } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderApp();

    expect(await screen.findByText('Hệ thống hoạt động bình thường.')).toBeInTheDocument();
    const region = systemStatusRegion();
    expect(within(region).getByText('Cơ sở dữ liệu')).toBeInTheDocument();
    expect(within(region).getAllByText('Hoạt động')).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith('/api/health/ready', expect.anything());
  });

  it('hiển thị sự cố và phụ thuộc bị gián đoạn khi server trả 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ status: 'degraded', checks: { database: 'down', redis: 'up' } }, 503),
        ),
      ),
    );

    renderApp();

    expect(await screen.findByText('Hệ thống đang gặp sự cố.')).toBeInTheDocument();
    const databaseRow = screen.getByText('Cơ sở dữ liệu').closest('li');
    expect(databaseRow).toHaveTextContent('Gián đoạn');
  });

  it('báo lỗi kết nối và cho phép thử lại', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', checks: { database: 'up' } }));
    vi.stubGlobal('fetch', fetchMock);

    renderApp();

    expect(await screen.findByText('Không kết nối được máy chủ.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Hệ thống hoạt động bình thường.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('báo lỗi khi phản hồi không đúng định dạng', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ unexpected: true }))),
    );

    renderApp();

    expect(await screen.findByText('Không lấy được trạng thái hệ thống.')).toBeInTheDocument();
  });

  it('báo lỗi khi server trả lỗi 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Đã có lỗi xảy ra.' } }, 500),
        ),
      ),
    );

    renderApp();

    expect(await screen.findByText('Không lấy được trạng thái hệ thống.')).toBeInTheDocument();
  });
});
