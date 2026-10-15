import type { DatabaseSync } from 'node:sqlite';

export interface SearchHistoryRow {
  id: number;
  keyword: string;
  filters: Record<string, string>;
  resultCount: number;
  /** 使用次数，用于「常用搜索」排序。 */
  useCount: number;
  /** 用户手动置顶。 */
  pinned: boolean;
  createdAt: string;
}

function toRow(row: Record<string, unknown>): SearchHistoryRow {
  let filters: Record<string, string> = {};
  try {
    const parsed = JSON.parse(String(row.filters ?? '{}'));
    if (parsed && typeof parsed === 'object') filters = parsed as Record<string, string>;
  } catch {
    filters = {};
  }
  return {
    id: Number(row.id),
    keyword: String(row.keyword),
    filters,
    resultCount: Number(row.result_count ?? 0),
    useCount: Number(row.use_count ?? 1),
    pinned: Number(row.pinned ?? 0) === 1,
    createdAt: String(row.created_at),
  };
}

export function listSearchHistory(db: DatabaseSync, limit = 20): SearchHistoryRow[] {
  const rows = db
    .prepare('SELECT * FROM search_history ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map(toRow);
}

/**
 * 「常用搜索」：置顶的排在最前，其余按使用次数降序。
 * 与「最近搜索」是两个不同视角，所以单独一个查询而不是复用上面那个。
 */
export function listFrequentSearches(db: DatabaseSync, limit = 6): SearchHistoryRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM search_history
       ORDER BY pinned DESC, use_count DESC, created_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map(toRow);
}

export function getSearchHistory(db: DatabaseSync, id: number): SearchHistoryRow | undefined {
  const row = db.prepare('SELECT * FROM search_history WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? toRow(row) : undefined;
}

/**
 * 记录一次搜索。同一关键词只保留一条：更新使用次数与结果数量，而不是插入重复行。
 */
export function recordSearch(
  db: DatabaseSync,
  keyword: string,
  filters: Record<string, string>,
  resultCount: number
): SearchHistoryRow {
  const timestamp = new Date().toISOString();

  db.exec('BEGIN');
  try {
    const existing = db
      .prepare('SELECT id, use_count FROM search_history WHERE keyword = ?')
      .get(keyword) as { id: number; use_count: number } | undefined;

    let id: number;
    if (existing) {
      db.prepare(
        `UPDATE search_history
         SET use_count = ?, result_count = ?, filters = ?, created_at = ?
         WHERE id = ?`
      ).run(existing.use_count + 1, resultCount, JSON.stringify(filters), timestamp, existing.id);
      id = existing.id;
    } else {
      const result = db
        .prepare(
          `INSERT INTO search_history (keyword, filters, result_count, use_count, pinned, created_at)
           VALUES (?, ?, ?, 1, 0, ?)`
        )
        .run(keyword, JSON.stringify(filters), resultCount, timestamp);
      id = Number(result.lastInsertRowid);
    }

    // 只保留最近 50 条，但置顶项永不因容量被淘汰。
    db.prepare(
      `DELETE FROM search_history
       WHERE pinned = 0
         AND id NOT IN (
           SELECT id FROM search_history WHERE pinned = 0
           ORDER BY created_at DESC, id DESC LIMIT 50
         )`
    ).run();

    db.exec('COMMIT');
    const row = getSearchHistory(db, id);
    if (!row) throw new Error('搜索历史写入后读取失败');
    return row;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function setPinned(
  db: DatabaseSync,
  id: number,
  pinned: boolean
): SearchHistoryRow | undefined {
  const existing = getSearchHistory(db, id);
  if (!existing) return undefined;
  db.prepare('UPDATE search_history SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
  return getSearchHistory(db, id);
}

export function deleteSearchHistory(db: DatabaseSync, id: number): boolean {
  const result = db.prepare('DELETE FROM search_history WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}

/** 清空非置顶的历史记录；置顶项需要用户先取消置顶才会被清掉。 */
export function clearSearchHistory(db: DatabaseSync): number {
  const result = db.prepare('DELETE FROM search_history WHERE pinned = 0').run();
  return Number(result.changes);
}
