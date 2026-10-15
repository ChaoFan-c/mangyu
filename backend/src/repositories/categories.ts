import type { DatabaseSync } from 'node:sqlite';

export interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  icon: string;
  /** 大分类为 null；细分类指向所属大分类。 */
  parentId: number | null;
}

/** 分类目录：大分类在前，其下紧跟所属细分类。 */
export function listCategories(db: DatabaseSync): CategoryRow[] {
  const rows = db
    .prepare('SELECT id, name, slug, icon, parent_id FROM categories ORDER BY sort_order, id')
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    icon: String(row.icon ?? ''),
    parentId: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
  }));
}
