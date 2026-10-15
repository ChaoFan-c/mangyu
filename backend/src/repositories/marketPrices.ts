import type { DatabaseSync } from 'node:sqlite';
import type { MarketPrice } from '@daoye/shared';
import { nowIso } from '../db/index.ts';

export type MarketPriceScope = 'keyword' | 'model';

/** 归一化匹配键：忽略大小写、空格与全角符号差异，保证「iPhone 15」与「iphone 15」命中同一条。 */
export function normalizeMarketKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[（）]/g, (char) => (char === '（' ? '(' : ')'));
}

function rowToMarketPrice(row: Record<string, unknown>): MarketPrice {
  return {
    id: Number(row.id),
    scope: String(row.scope) as MarketPriceScope,
    scopeKey: String(row.scope_key),
    label: String(row.label),
    price: Number(row.price),
    note: row.note ? String(row.note) : undefined,
    updatedAt: String(row.updated_at),
  };
}

export function listMarketPrices(db: DatabaseSync): MarketPrice[] {
  const rows = db
    .prepare('SELECT * FROM market_prices ORDER BY updated_at DESC, id DESC')
    .all() as Array<Record<string, unknown>>;
  return rows.map(rowToMarketPrice);
}

export interface UpsertMarketPriceInput {
  scope: MarketPriceScope;
  /** 用户原始输入，用于展示。 */
  label: string;
  /** 金额单位：分。 */
  price: number;
  note?: string;
}

/** 同一 (scope, key) 只保留一条：再次保存视为用户主动更新，并保留创建时间。 */
export function upsertMarketPrice(
  db: DatabaseSync,
  input: UpsertMarketPriceInput
): MarketPrice {
  const key = normalizeMarketKey(input.label);
  if (!key) throw new Error('行情价的关联关键词或型号不能为空');
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO market_prices (scope, scope_key, label, price, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope, scope_key) DO UPDATE SET
       label = excluded.label,
       price = excluded.price,
       note = excluded.note,
       updated_at = excluded.updated_at`
  ).run(input.scope, key, input.label.trim(), input.price, input.note ?? null, timestamp, timestamp);

  const row = db
    .prepare('SELECT * FROM market_prices WHERE scope = ? AND scope_key = ?')
    .get(input.scope, key) as Record<string, unknown> | undefined;
  if (!row) throw new Error('行情价保存失败');
  return rowToMarketPrice(row);
}

export function deleteMarketPrice(db: DatabaseSync, id: number): boolean {
  const result = db.prepare('DELETE FROM market_prices WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}

/**
 * 为某个商品匹配行情价。
 * 顺序：
 * 1. 型号精确相等（最精确，避免不同容量串价）；
 * 2. 商品名包含该键（采集商品的 model 常为空，只能靠名称关联），
 *    多条命中时取最长的一条，避免「iPhone 15」抢走「iPhone 15 256GB」。
 * 返回命中的那一条，调用方会把它的 label 一并展示，保证可解释。
 */
export function matchMarketPrice(
  prices: MarketPrice[],
  product: { name: string; model?: string }
): MarketPrice | undefined {
  if (product.model) {
    const modelKey = normalizeMarketKey(product.model);
    if (modelKey) {
      const byModel = prices.find(
        (price) => price.scope === 'model' && price.scopeKey === modelKey
      );
      if (byModel) return byModel;
    }
  }
  const name = normalizeMarketKey(product.name);
  if (!name) return undefined;
  const contained = prices.filter(
    (price) => price.scopeKey && name.includes(price.scopeKey)
  );
  contained.sort((left, right) => right.scopeKey.length - left.scopeKey.length);
  return contained[0];
}

/** 命中来源的可读说明，用于「售价参考来自哪里」这类展示。 */
export function describeMarketPrice(price: MarketPrice): string {
  return `${price.scope === 'model' ? '型号' : '关键词'}「${price.label}」`;
}
