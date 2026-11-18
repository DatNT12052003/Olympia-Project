import { loadEnv } from './env';

const validEnv = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadEnv', () => {
  it('áp dụng giá trị mặc định khi chỉ có biến bắt buộc', () => {
    const env = loadEnv(validEnv);

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      CORS_ORIGINS: ['http://localhost:5173'],
    });
  });

  it('tách danh sách CORS_ORIGINS và bỏ phần tử rỗng', () => {
    const env = loadEnv({ ...validEnv, CORS_ORIGINS: 'https://a.example, https://b.example,' });

    expect(env.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });

  it('ném lỗi khi thiếu DATABASE_URL', () => {
    expect(() => loadEnv({ REDIS_URL: validEnv.REDIS_URL })).toThrow(/DATABASE_URL/);
  });

  it('ném lỗi khi DATABASE_URL không phải PostgreSQL', () => {
    expect(() => loadEnv({ ...validEnv, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('ném lỗi khi PORT không hợp lệ', () => {
    expect(() => loadEnv({ ...validEnv, PORT: '70000' })).toThrow(/PORT/);
  });
});
