import type { DatabaseSync } from 'node:sqlite';
import {
  categoryIdForStorage,
  type SellerProfile,
  type ProductType,
} from '@daoye/shared';
import { rowToProduct } from '../db/seed.ts';

export interface ProductQuery {
  keyword?: string;
  categoryId?: number;
  brandId?: number;
  condition?: string;
  /** 按价格记录中的所在地筛选，例如「北京」。 */
  region?: string;
  minPrice?: number;
  maxPrice?: number;
  origin?: 'seed' | 'manual' | 'import';
  sortBy?: 'price' | 'date';
  sortOrder?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

const SELECT_BASE = `
  SELECT p.*, c.name AS category_name, b.name AS brand_name
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id
  WHERE p.is_active = 1
`;

function buildWhere(query: ProductQuery) {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (query.keyword) {
    clauses.push('(p.name LIKE ? OR b.name LIKE ? OR IFNULL(p.model, \'\') LIKE ?)');
    const like = `%${query.keyword}%`;
    params.push(like, like, like);
  }
  if (query.categoryId !== undefined) {
    // 选中大分类时也要命中其子分类下的商品，否则旧数据会被筛没。
    clauses.push(
      '(p.category_id = ? OR p.category_id IN (SELECT id FROM categories WHERE parent_id = ?))'
    );
    params.push(query.categoryId, query.categoryId);
  }
  if (query.brandId !== undefined) {
    clauses.push('p.brand_id = ?');
    params.push(query.brandId);
  }
  if (query.condition) {
    clauses.push('p.condition = ?');
    params.push(query.condition);
  }
  if (query.region) {
    // 地区属于挂牌信息，存在价格记录里；只保留在该地区有报价的商品。
    clauses.push(
      'EXISTS (SELECT 1 FROM price_records pr WHERE pr.product_id = p.id AND pr.location = ?)'
    );
    params.push(query.region);
  }
  // 价格区间由前端按「元」传入，这里换算成「分」比较。
  if (query.minPrice !== undefined) {
    clauses.push('p.price >= ?');
    params.push(Math.round(query.minPrice * 100));
  }
  if (query.maxPrice !== undefined) {
    clauses.push('p.price <= ?');
    params.push(Math.round(query.maxPrice * 100));
  }
  if (query.origin) {
    clauses.push('p.origin = ?');
    params.push(query.origin);
  }

  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

export function countProducts(db: DatabaseSync, query: ProductQuery): number {
  const where = buildWhere(query);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total FROM products p
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.is_active = 1${where.sql}`
    )
    .get(...where.params) as { total: number } | undefined;
  return Number(row?.total ?? 0);
}

export function listProducts(
  db: DatabaseSync,
  query: ProductQuery
): { items: ProductType[]; total: number } {
  const where = buildWhere(query);
  // 价格与上架顺序可以直接用 SQL 排序；利润类排序需要先算机会评分，在路由层处理。
  const direction = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const orderBy =
    query.sortBy === 'price'
      ? `p.price ${direction}`
      : query.sortBy === 'date'
        ? `p.id ${direction}`
        : 'p.id ASC';
  const rows = db
    .prepare(`${SELECT_BASE}${where.sql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...where.params, query.limit, query.offset) as Array<Record<string, unknown>>;
  return {
    items: rows.map(rowToProduct),
    total: countProducts(db, query),
  };
}

export function getProductById(db: DatabaseSync, id: number): ProductType | undefined {
  const row = db.prepare(`${SELECT_BASE} AND p.id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToProduct(row) : undefined;
}

export interface CreateProductInput {
  name: string;
  category: string;
  brand?: string;
  model?: string;
  condition: string;
  price: number;
  priceType: string;
  description?: string;
  /** 卖家信誉资料；缺省表示页面未展示，不能填占位值。 */
  seller?: SellerProfile;
  origin: 'manual' | 'import';
  sourceId?: string;
  sourceRef?: string;
}

export function createProduct(db: DatabaseSync, input: CreateProductInput): number {
  const categoryId = categoryIdForStorage(input.category);
  if (!categoryId) {
    throw new Error(`未知品类：${input.category}`);
  }
  const brandRow = input.brand
    ? (db.prepare('SELECT id FROM brands WHERE name = ?').get(input.brand) as
        | { id: number }
        | undefined)
    : undefined;

  const timestamp = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO products
         (category_id, brand_id, name, model, condition, price, price_type,
          images, description, seller, origin, source_id, source_ref,
          is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
      categoryId,
      brandRow?.id ?? null,
      input.name,
      input.model ?? null,
      input.condition,
      input.price,
      input.priceType,
      input.description ?? null,
      input.seller ? JSON.stringify(input.seller) : null,
      input.origin,
      input.sourceId ?? null,
      input.sourceRef ?? null,
      timestamp,
      timestamp
    );
  return Number(result.lastInsertRowid);
}

export function findProductBySourceRef(
  db: DatabaseSync,
  sourceId: string,
  sourceRef: string
): ProductType | undefined {
  const row = db
    .prepare(
      `SELECT p.*, c.name AS category_name, b.name AS brand_name
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.source_id = ? AND p.source_ref = ?`
    )
    .get(sourceId, sourceRef) as Record<string, unknown> | undefined;
  return row ? rowToProduct(row) : undefined;
}

export interface UpdateCollectedProductInput {
  id: number;
  name: string;
  category: string;
  brand?: string;
  model?: string;
  condition: string;
  price: number;
  priceType: string;
  description?: string;
  seller?: SellerProfile;
}

export function updateCollectedProduct(
  db: DatabaseSync,
  input: UpdateCollectedProductInput
): void {
  const categoryId = categoryIdForStorage(input.category);
  if (!categoryId) throw new Error(`未知品类：${input.category}`);
  const brandRow = input.brand
    ? (db.prepare('SELECT id FROM brands WHERE name = ?').get(input.brand) as
        | { id: number }
        | undefined)
    : undefined;
  const timestamp = new Date().toISOString();
  db.prepare(
    `UPDATE products
     SET category_id = ?, brand_id = ?, name = ?, model = ?, condition = ?,
         price = ?, price_type = ?, description = ?,
         seller = COALESCE(?, seller), is_active = 1, updated_at = ?
     WHERE id = ?`
  ).run(
    categoryId,
    brandRow?.id ?? null,
    input.name,
    input.model ?? null,
    input.condition,
    input.price,
    input.priceType,
    input.description ?? null,
    input.seller ? JSON.stringify(input.seller) : null,
    timestamp,
    input.id
  );
}

/**
 * 删除商品。只允许删除用户自己录入或导入的数据，
 * 内置演示目录（origin='seed'）不允许通过接口删除，避免误删演示数据。
 */
export function deleteProduct(
  db: DatabaseSync,
  id: number
): 'deleted' | 'not-found' | 'protected' {
  const row = db.prepare('SELECT origin FROM products WHERE id = ?').get(id) as
    | { origin: string }
    | undefined;
  if (!row) return 'not-found';
  if (row.origin === 'seed') return 'protected';
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return 'deleted';
}

/** 用于「手动录入」商品的去重检查：同名同品类视为重复。 */
export function findProductByNameAndCategory(
  db: DatabaseSync,
  name: string,
  categoryId: number
): number | undefined {
  const row = db
    .prepare('SELECT id FROM products WHERE name = ? AND category_id = ? LIMIT 1')
    .get(name, categoryId) as { id: number } | undefined;
  return row?.id;
}
