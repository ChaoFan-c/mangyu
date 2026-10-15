import type { DatabaseSync } from 'node:sqlite';
import type { SourceStatus, SourceStatusValue } from '../collectors/types.ts';

export interface StoredSourceStatus extends SourceStatus {
  sourceId: string;
}

function toRow(row: Record<string, unknown>): StoredSourceStatus {
  return {
    sourceId: String(row.source_id),
    status: String(row.last_status) as SourceStatusValue,
    message: String(row.last_message ?? ''),
    checkedAt: row.last_checked_at ? String(row.last_checked_at) : undefined,
  };
}

export function saveSourceStatus(
  db: DatabaseSync,
  sourceId: string,
  status: SourceStatus
): StoredSourceStatus {
  const timestamp = status.checkedAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO source_status
       (source_id, last_status, last_message, last_checked_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
       last_status = excluded.last_status,
       last_message = excluded.last_message,
       last_checked_at = excluded.last_checked_at,
       updated_at = excluded.updated_at`
  ).run(sourceId, status.status, status.message, timestamp, new Date().toISOString());
  return { sourceId, ...status, checkedAt: timestamp };
}

export function listSourceStatuses(db: DatabaseSync): Map<string, StoredSourceStatus> {
  const rows = db
    .prepare('SELECT * FROM source_status ORDER BY source_id ASC')
    .all() as Array<Record<string, unknown>>;
  return new Map(rows.map((row) => {
    const status = toRow(row);
    return [status.sourceId, status];
  }));
}

export function getSourceStatus(
  db: DatabaseSync,
  sourceId: string
): StoredSourceStatus | undefined {
  const row = db
    .prepare('SELECT * FROM source_status WHERE source_id = ?')
    .get(sourceId) as Record<string, unknown> | undefined;
  return row ? toRow(row) : undefined;
}
