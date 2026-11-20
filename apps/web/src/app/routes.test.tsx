import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderApp } from '../test/render';

describe('Điều hướng', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ status: 'ok', checks: {} }))),
    );
  });

  it('trang chủ hiển thị tiêu đề chính', () => {
    renderApp('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Olympia Online' })).toBeInTheDocument();
  });

  it('đường dẫn không tồn tại hiển thị trang 404 và quay về được trang chủ', async () => {
    renderApp('/khong-ton-tai');

    expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Về trang chủ' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Olympia Online' })).toBeInTheDocument();
  });
});
