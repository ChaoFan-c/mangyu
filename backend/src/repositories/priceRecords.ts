import type { DatabaseSync } from 'node:sqlite';
import type { MockPriceRecord } from '@daoye/shared';
import { rowToPriceRecord } from '../db/seed.ts';

export function listPriceRecords(db: DatabaseSync, productId: number): MockPriceRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM price_records
       WHERE product_id = ?
       ORDER BY CASE price_type
         WHEN 'sold' THEN 0
         WHEN 'listing' THEN 1
         WHEN 'reference' THEN 2
         WHEN 'manual' THEN 3
         ELSE 4 END, price ASC`
    )
    .all(productId) as Array<Record<string, unknown>>;
  return rows.map(rowToPriceRecord);
}

export function countPriceRecords(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS total FROM price_records').get() as
    | { total: number }
    | undefined;
  return Number(row?.total ?? 0);
}

/** 价格记录中出现过的所有地区，供搜索栏的「地区」筛选项使用。 */
export function listRegions(db: DatabaseSync): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT location FROM price_records
       WHERE location IS NOT NULL AND location <> ''
       ORDER BY location ASC`
    )
    .all() as Array<{ location: string }>;
  return rows.map((row) => row.location);
}

export interface CreatePriceRecordInput {
  productId: number;
  platform: string;
  price: number;
  priceType: string;
  condition?: string;
  location?: string;
  shippingFee: number;
  platformFeeRate: number;
  sourceUrl?: string;
  confidence: number;
  notes?: string;
  dataSource: string;
  sourceId?: string;
  externalId?: string;
  collectedAt?: string;
}

export function createPriceRecord(db: DatabaseSync, input: CreatePriceRecordInput): number {
  const timestamp = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO price_records
         (product_id, platform, price, price_type, condition, location, shipping_fee,
          platform_fee_rate, collected_at, source_url, confidence, listing_id,
          seller_info, notes, data_source, source_id, external_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.productId,
      input.platform,
      input.price,
      input.priceType,
      input.condition ?? null,
      input.location ?? null,
      input.shippingFee,
      input.platformFeeRate,
      input.collectedAt ?? timestamp,
      input.sourceUrl ?? null,
      input.confidence,
      input.notes ?? null,
      input.dataSource,
      input.sourceId ?? null,
      input.externalId ?? null,
      timestamp,
      timestamp
    );
  return Number(result.lastInsertRowid);
}

export function findObservedPriceRecord(
  db: DatabaseSync,
  input: {
    sourceId: string;
    externalId: string;
    priceType: string;
    condition: string;
    price: number;
  }
): number | undefined {
  const row = db
    .prepare(
      `SELECT id FROM price_records
       WHERE source_id = ? AND external_id = ? AND price_type = ?
         AND IFNULL(condition, '') = ? AND price = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(
      input.sourceId,
      input.externalId,
      input.priceType,
      input.condition,
      input.price
    ) as { id: number } | undefined;
  return row?.id;
}

export function updateObservedPriceRecord(
  db: DatabaseSync,
  id: number,
  input: {
    platform: string;
    location?: string;
    shippingFee: number;
    platformFeeRate: number;
    collectedAt: string;
    sourceUrl?: string;
    confidence: number;
    notes?: string;
    dataSource: string;
  }
): void {
  db.prepare(
    `UPDATE price_records
     SET platform = ?, location = ?, shipping_fee = ?, platform_fee_rate = ?,
         collected_at = ?, source_url = ?, confidence = ?, notes = ?,
         data_source = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.platform,
    input.location ?? null,
    input.shippingFee,
    input.platformFeeRate,
    input.collectedAt,
    input.sourceUrl ?? null,
    input.confidence,
    input.notes ?? null,
    input.dataSource,
    new Date().toISOString(),
    id
  );
}

export function listPriceRecordsBySource(
  db: DatabaseSync,
  sourceId: string,
  externalId: string
): MockPriceRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM price_records
       WHERE source_id = ? AND external_id = ?
       ORDER BY collected_at ASC, id ASC`
    )
    .all(sourceId, externalId) as Array<Record<string, unknown>>;
  return rows.map(rowToPriceRecord);
}

/** 批量取多个商品的价格记录，供机会评分一次性使用。 */
export function listPriceRecordsByProduct(
  db: DatabaseSync,
  productIds: number[]
): Map<number, MockPriceRecord[]> {
  const grouped = new Map<number, MockPriceRecord[]>();
  if (productIds.length === 0) return grouped;

  const placeholders = productIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM price_records WHERE product_id IN (${placeholders})`)
    .all(...productIds) as Array<Record<string, unknown>>;

  for (const row of rows) {
    const record = rowToPriceRecord(row);
    const list = grouped.get(record.product_id) ?? [];
    list.push(record);
    grouped.set(record.product_id, list);
  }
  for (const id of productIds) {
    if (!grouped.has(id)) grouped.set(id, []);
  }
  return grouped;
}
