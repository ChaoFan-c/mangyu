import type { DatabaseSync } from 'node:sqlite';

export interface FavoriteRow {
  id: number;
  productId: number | null;
  productName: string;
  category: string;
  brand: string;
  condition: string;
  targetBuyPrice: number;
  targetSellPrice: number;
  actualBuyPrice?: number;
  actualSellPrice?: number;
  notes: string;
  status: 'watching' | 'bought' | 'sold' | 'skipped';
  createdAt: string;
  updatedAt: string;
}

function toFavorite(row: Record<string, unknown>): FavoriteRow {
  return {
    id: Number(row.id),
    productId: row.product_id === null ? null : Number(row.product_id),
    productName: String(row.product_name),
    category: String(row.category),
    brand: String(row.brand ?? ''),
    condition: String(row.condition ?? '99new'),
    targetBuyPrice: Number(row.target_buy_price ?? 0),
    targetSellPrice: Number(row.target_sell_price ?? 0),
    actualBuyPrice:
      row.actual_buy_price === null || row.actual_buy_price === undefined
        ? undefined
        : Number(row.actual_buy_price),
    actualSellPrice:
      row.actual_sell_price === null || row.actual_sell_price === undefined
        ? undefined
        : Number(row.actual_sell_price),
    notes: String(row.notes ?? ''),
    status: String(row.status) as FavoriteRow['status'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listFavorites(db: DatabaseSync): FavoriteRow[] {
  const rows = db
    .prepare('SELECT * FROM favorites ORDER BY created_at DESC, id DESC')
    .all() as Array<Record<string, unknown>>;
  return rows.map(toFavorite);
}

export function getFavorite(db: DatabaseSync, id: number): FavoriteRow | undefined {
  const row = db.prepare('SELECT * FROM favorites WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? toFavorite(row) : undefined;
}

export interface CreateFavoriteInput {
  productId?: number;
  productName: string;
  category: string;
  brand?: string;
  condition: string;
  targetBuyPrice: number;
  targetSellPrice: number;
  notes?: string;
  status: FavoriteRow['status'];
}

export function createFavorite(db: DatabaseSync, input: CreateFavoriteInput): FavoriteRow {
  const timestamp = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO favorites
         (product_id, product_name, category, brand, condition, target_buy_price,
          target_sell_price, actual_buy_price, actual_sell_price, notes, status,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`
    )
    .run(
      input.productId ?? null,
      input.productName,
      input.category,
      input.brand ?? '',
      input.condition,
      input.targetBuyPrice,
      input.targetSellPrice,
      input.notes ?? '',
      input.status,
      timestamp,
      timestamp
    );
  const created = getFavorite(db, Number(result.lastInsertRowid));
  if (!created) throw new Error('收藏创建后读取失败');
  return created;
}

export interface UpdateFavoriteInput {
  targetBuyPrice?: number;
  targetSellPrice?: number;
  actualBuyPrice?: number | null;
  actualSellPrice?: number | null;
  notes?: string;
  status?: FavoriteRow['status'];
}

export function updateFavorite(
  db: DatabaseSync,
  id: number,
  patch: UpdateFavoriteInput
): FavoriteRow | undefined {
  const existing = getFavorite(db, id);
  if (!existing) return undefined;

  const assignments: string[] = [];
  const params: Array<string | number | null> = [];

  const set = (column: string, value: string | number | null) => {
    assignments.push(`${column} = ?`);
    params.push(value);
  };

  if (patch.targetBuyPrice !== undefined) set('target_buy_price', patch.targetBuyPrice);
  if (patch.targetSellPrice !== undefined) set('target_sell_price', patch.targetSellPrice);
  if (patch.actualBuyPrice !== undefined) set('actual_buy_price', patch.actualBuyPrice);
  if (patch.actualSellPrice !== undefined) set('actual_sell_price', patch.actualSellPrice);
  if (patch.notes !== undefined) set('notes', patch.notes);
  if (patch.status !== undefined) set('status', patch.status);

  if (assignments.length === 0) return existing;

  set('updated_at', new Date().toISOString());
  db.prepare(`UPDATE favorites SET ${assignments.join(', ')} WHERE id = ?`).run(
    ...params,
    id
  );
  return getFavorite(db, id);
}

export function deleteFavorite(db: DatabaseSync, id: number): boolean {
  const result = db.prepare('DELETE FROM favorites WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}
