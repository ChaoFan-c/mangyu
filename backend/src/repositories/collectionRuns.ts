import type { DatabaseSync } from 'node:sqlite';
import type { CollectionRun, SourceStatusValue } from '../collectors/types.ts';

function toRow(row: Record<string, unknown>): CollectionRun {
  return {
    id: Number(row.id),
    sourceId: String(row.source_id),
    mode: String(row.mode) as CollectionRun['mode'],
    query: String(row.query ?? ''),
    status: String(row.status) as SourceStatusValue,
    itemCount: Number(row.item_count ?? 0),
    newProducts: Number(row.new_products ?? 0),
    newPriceRecords: Number(row.new_price_records ?? 0),
    message: String(row.message ?? ''),
    createdAt: String(row.created_at),
  };
}

export interface RecordCollectionRunInput {
  sourceId: string;
  mode: CollectionRun['mode'];
  query?: string;
  status: SourceStatusValue;
  itemCount?: number;
  newProducts?: number;
  newPriceRecords?: number;
  message?: string;
}

export function recordCollectionRun(
  db: DatabaseSync,
  input: RecordCollectionRunInput
): CollectionRun {
  const result = db
    .prepare(
      `INSERT INTO collection_runs
         (source_id, mode, query, status, item_count, new_products,
          new_price_records, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.sourceId,
      input.mode,
      input.query ?? null,
      input.status,
      input.itemCount ?? 0,
      input.newProducts ?? 0,
      input.newPriceRecords ?? 0,
      input.message ?? '',
      new Date().toISOString()
    );
  const row = db
    .prepare('SELECT * FROM collection_runs WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  return toRow(row);
}

export function listCollectionRuns(db: DatabaseSync, limit = 30): CollectionRun[] {
  const rows = db
    .prepare('SELECT * FROM collection_runs ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map(toRow);
}
