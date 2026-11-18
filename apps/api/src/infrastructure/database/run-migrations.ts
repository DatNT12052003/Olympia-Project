import { loadEnv } from '../../config/env';
import { createDataSource } from './data-source';

/** Chạy migration: `up` áp dụng toàn bộ migration chưa chạy, `down` hoàn tác migration gần nhất. */
async function run(direction: string | undefined): Promise<void> {
  if (direction !== 'up' && direction !== 'down') {
    throw new Error('Cách dùng: run-migrations <up|down>');
  }
  const dataSource = createDataSource(loadEnv().DATABASE_URL);
  await dataSource.initialize();
  try {
    if (direction === 'up') {
      const applied = await dataSource.runMigrations({ transaction: 'each' });
      console.log(
        applied.length === 0
          ? 'Không có migration mới.'
          : `Đã áp dụng: ${applied.map((m) => m.name).join(', ')}`,
      );
    } else {
      await dataSource.undoLastMigration({ transaction: 'each' });
      console.log('Đã hoàn tác migration gần nhất.');
    }
  } finally {
    await dataSource.destroy();
  }
}

run(process.argv[2]).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
