import { createApp } from './app.ts';
import { createDatabase, resolveDbFile } from './db/index.ts';
import { seedDatabase } from './db/seed.ts';
import { countProducts } from './repositories/products.ts';
import { browserSession } from './collectors/browserSession.ts';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const dbFile = resolveDbFile();
const here = dirname(fileURLToPath(import.meta.url));
const staticDir = process.env.MANGYU_STATIC_DIR ?? resolve(here, '../../frontend/dist');

const db = createDatabase(dbFile);

// 生产环境不自动写入演示行情；开发者可显式启用。
if (process.env.MANGYU_SEED_DEMO === '1' && countProducts(db, { limit: 1, offset: 0 }) === 0) {
  const result = seedDatabase(db);
  console.log(
    `首次启动：已写入演示数据（商品 ${result.products} 件，价格记录 ${result.priceRecords} 条）`
  );
}

const { server } = createApp({ db, staticDir });

server.listen(port, host, () => {
  console.log(`忙鱼后端已启动：http://${host}:${port}`);
  console.log(`数据库文件：${dbFile}`);
  console.log(`前端目录：${staticDir}`);
  console.log('数据来源以每条记录的来源标记为准；未知行情不会被填充为确定值。');
});

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`收到 ${signal}，正在关闭服务…`);
  await browserSession.stop().catch(() => undefined);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
