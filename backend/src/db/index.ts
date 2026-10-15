import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, CATEGORY_GROUPS } from '@daoye/shared';

const here = dirname(fileURLToPath(import.meta.url));

/** 生产安装优先使用用户数据目录；DAOYE_DB_FILE 保留给现有测试。 */
export function resolveDbFile(): string {
  const fromEnv = process.env.MANGYU_DB_FILE ?? process.env.DAOYE_DB_FILE;
  if (fromEnv) return fromEnv;
  const dataDir = process.env.MANGYU_DATA_DIR;
  if (dataDir) return resolve(dataDir, 'mangyu.sqlite');
  return resolve(here, '../../data/daoye.sqlite');
}

export function openDatabase(file: string = resolveDbFile()): DatabaseSync {
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

/** 建表语句是幂等的（IF NOT EXISTS），每次启动都可安全执行。 */
export function migrate(db: DatabaseSync): void {
  const sql = readFileSync(resolve(here, 'schema.sql'), 'utf8');
  db.exec(sql);
  applyColumnMigrations(db);
  // 分类目录属于「运行必需的基础数据」，不能只在空库灌演示数据时才写入，
  // 否则已有数据库里选中的大分类会因为查不到行而触发外键失败。
  ensureCatalog(db);
}

/**
 * 幂等写入分类目录：10 个大分类 + 保留的细分类（含父子关系）。
 * 只补不删，已有行按 id 更新名称等字段，不影响商品上的 category_id。
 */
export function ensureCatalog(db: DatabaseSync): number {
  const upsert = db.prepare(
    `INSERT INTO categories (id, name, slug, icon, sort_order, parent_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       slug = excluded.slug,
       icon = excluded.icon,
       sort_order = excluded.sort_order,
       parent_id = excluded.parent_id`
  );
  CATEGORY_GROUPS.forEach((group, index) => {
    upsert.run(group.id, group.name, group.slug, group.icon, index, null);
  });
  CATEGORIES.forEach((category, index) => {
    const parentId = CATEGORY_GROUPS.find((group) => group.name === category.group)?.id ?? null;
    upsert.run(
      category.id,
      category.name,
      category.slug,
      category.icon,
      CATEGORY_GROUPS.length + index,
      parentId
    );
  });
  return CATEGORY_GROUPS.length + CATEGORIES.length;
}

/**
 * 轻量列迁移：schema.sql 只负责建新表，已有数据库需要补列。
 * 这里按「缺哪列补哪列」的方式做幂等 ALTER，不引入迁移框架，
 * 也不会因为重复执行而出错。
 */
function applyColumnMigrations(db: DatabaseSync): void {
  const additions: Array<{ table: string; column: string; definition: string }> = [
    // 「常用搜索」需要记录使用次数与是否置顶。
    { table: 'search_history', column: 'use_count', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { table: 'search_history', column: 'pinned', definition: 'INTEGER NOT NULL DEFAULT 0' },
    // 数据采集模块：记录商品来自哪个适配器、对应来源侧的哪条记录。
    { table: 'products', column: 'source_id', definition: 'TEXT' },
    { table: 'products', column: 'source_ref', definition: 'TEXT' },
    { table: 'price_records', column: 'source_id', definition: 'TEXT' },
    { table: 'price_records', column: 'external_id', definition: 'TEXT' },
    // 分类改为「10 个大分类 + 保留的细分类」两层结构，旧库需要补这一列。
    { table: 'categories', column: 'parent_id', definition: 'INTEGER' },
  ];

  for (const { table, column, definition } of additions) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    if (columns.length === 0) continue;
    if (columns.some((item) => item.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  // 依赖上面这些后补列的索引，必须在补列之后创建，否则旧库会报 no such column。
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_source_ref
      ON products(source_id, source_ref)
      WHERE source_id IS NOT NULL AND source_ref IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_price_records_external
      ON price_records(source_id, external_id);
  `);
}

export function createDatabase(file?: string): DatabaseSync {
  const db = openDatabase(file);
  migrate(db);
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}
