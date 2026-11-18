/** Database riêng cho test, không đụng dữ liệu dev. Ghi đè bằng biến `TEST_DATABASE_URL`. */
export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? 'postgres://olympia:olympia@localhost:5440/olympia_test';
}
