import { createDatabase, resolveDbFile } from './index.ts';
import { seedDatabase } from './seed.ts';

const reset = process.argv.includes('--reset');
const file = resolveDbFile();

const db = createDatabase(file);

if (reset) {
  // --reset 只清空整库，属于显式操作，不是默认行为。
  for (const table of [
    'profit_calculations',
    'search_history',
    'csv_imports',
    'favorites',
    'price_records',
    'products',
    'brands',
    'categories',
  ]) {
    db.exec(`DELETE FROM ${table}`);
  }
  console.log('已清空全部数据表');
}

const result = seedDatabase(db);
console.log(`数据库文件：${file}`);
console.log(
  `写入完成：品类 ${result.categories} 个，品牌 ${result.brands} 个，` +
    `商品 ${result.products} 件，价格记录 ${result.priceRecords} 条`
);
db.close();
