import type { DatabaseSync } from 'node:sqlite';

export interface CsvImportRow {
  id: number;
  filename: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  errors: string[];
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

function toRow(row: Record<string, unknown>): CsvImportRow {
  let errors: string[] = [];
  try {
    const parsed = JSON.parse(String(row.errors ?? '[]'));
    if (Array.isArray(parsed)) errors = parsed.map((item) => String(item));
  } catch {
    errors = [];
  }
  return {
    id: Number(row.id),
    filename: String(row.filename),
    totalRows: Number(row.total_rows),
    successRows: Number(row.success_rows),
    failedRows: Number(row.failed_rows),
    errors,
    status: String(row.status) as CsvImportRow['status'],
    createdAt: String(row.created_at),
  };
}

export function listImports(db: DatabaseSync, limit = 50): CsvImportRow[] {
  const rows = db
    .prepare('SELECT * FROM csv_imports ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map(toRow);
}

export function clearImports(db: DatabaseSync): number {
  const result = db.prepare('DELETE FROM csv_imports').run();
  return Number(result.changes);
}

export interface RecordImportInput {
  filename: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  errors: string[];
}

export function recordImport(db: DatabaseSync, input: RecordImportInput): CsvImportRow {
  const result = db
    .prepare(
      `INSERT INTO csv_imports
         (filename, total_rows, success_rows, failed_rows, errors, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.filename,
      input.totalRows,
      input.successRows,
      input.failedRows,
      JSON.stringify(input.errors),
      input.failedRows === 0 ? 'completed' : input.successRows === 0 ? 'failed' : 'completed',
      new Date().toISOString()
    );
  const row = db
    .prepare('SELECT * FROM csv_imports WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  return toRow(row);
}
