import { loadEnv } from './env';

const validEnv = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a-very-long-test-secret-0123456789abcdef',
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

  it('ném lỗi khi JWT_SECRET quá ngắn', () => {
    expect(() => loadEnv({ ...validEnv, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('không cho dùng JWT_SECRET mẫu ở production', () => {
    expect(() =>
      loadEnv({
        ...validEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'dev-only-secret-change-me-0123456789abcdef',
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it('không cho dùng khóa object storage mẫu ở production', () => {
    expect(() => loadEnv({ ...validEnv, NODE_ENV: 'production' })).toThrow(/S3_SECRET_ACCESS_KEY/);
  });

  it('không cho dùng khóa LiveKit mẫu ở production; URL API suy từ LIVEKIT_URL', () => {
    expect(() =>
      loadEnv({ ...validEnv, NODE_ENV: 'production', S3_SECRET_ACCESS_KEY: 'real-key' }),
    ).toThrow(/LIVEKIT_API_SECRET/);
    expect(loadEnv({ ...validEnv, LIVEKIT_URL: 'wss://av.example.com' }).LIVEKIT_API_URL).toBe(
      'https://av.example.com',
    );
  });

  it('COOKIE_SECURE mặc định bật ở production, tắt khi dev, ghi đè được', () => {
    const production = {
      ...validEnv,
      NODE_ENV: 'production',
      S3_SECRET_ACCESS_KEY: 'real-key',
      LIVEKIT_API_SECRET: 'livekit-production-secret-0123456789',
    };
    expect(loadEnv(validEnv).COOKIE_SECURE).toBe(false);
    expect(loadEnv(production).COOKIE_SECURE).toBe(true);
    expect(loadEnv({ ...validEnv, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
  });
});
