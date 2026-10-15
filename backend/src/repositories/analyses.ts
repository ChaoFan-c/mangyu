import type { DatabaseSync } from 'node:sqlite';
import type { CalculatorInput, CalculatorOutput } from '@daoye/shared';

export interface SavedAnalysis {
  id: number;
  productId: number | null;
  label: string;
  inputParams: Partial<CalculatorInput>;
  scenarios: CalculatorOutput['scenarios'];
  costCompleteness: number;
  missingFields: string[];
  warnings: string[];
  createdAt: string;
}

function toRow(row: Record<string, unknown>): SavedAnalysis {
  const parse = <T>(value: unknown, fallback: T): T => {
    try {
      return JSON.parse(String(value)) as T;
    } catch {
      return fallback;
    }
  };
  return {
    id: Number(row.id),
    productId: row.product_id === null ? null : Number(row.product_id),
    label: String(row.label ?? ''),
    inputParams: parse<Partial<CalculatorInput>>(row.input_params, {}),
    scenarios: parse<CalculatorOutput['scenarios']>(row.scenarios, {} as never),
    costCompleteness: Number(row.cost_completeness ?? 0),
    missingFields: parse<string[]>(row.missing_fields, []),
    warnings: parse<string[]>(row.warnings, []),
    createdAt: String(row.created_at),
  };
}

export interface SaveAnalysisInput {
  productId?: number;
  label?: string;
  input: Partial<CalculatorInput>;
  result: CalculatorOutput;
}

/**
 * 保存一次利润测算快照，用于「保存分析结果」。
 * 保存的是输入与算出的结果，便于日后复核当时的口径。
 */
export function saveAnalysis(db: DatabaseSync, input: SaveAnalysisInput): SavedAnalysis {
  const result = db
    .prepare(
      `INSERT INTO profit_calculations
         (product_id, label, input_params, scenarios, cost_completeness,
          missing_fields, warnings, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.productId ?? null,
      input.label ?? '',
      JSON.stringify(input.input),
      JSON.stringify(input.result.scenarios),
      input.result.costCompleteness,
      JSON.stringify(input.result.missingFields),
      JSON.stringify(input.result.warnings),
      new Date().toISOString()
    );
  const row = db
    .prepare('SELECT * FROM profit_calculations WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  return toRow(row);
}

export function listAnalyses(db: DatabaseSync, productId?: number, limit = 50): SavedAnalysis[] {
  const rows = (
    productId === undefined
      ? db
          .prepare(
            'SELECT * FROM profit_calculations ORDER BY created_at DESC, id DESC LIMIT ?'
          )
          .all(limit)
      : db
          .prepare(
            `SELECT * FROM profit_calculations WHERE product_id = ?
             ORDER BY created_at DESC, id DESC LIMIT ?`
          )
          .all(productId, limit)
  ) as Array<Record<string, unknown>>;
  return rows.map(toRow);
}

export function deleteAnalysis(db: DatabaseSync, id: number): boolean {
  const result = db.prepare('DELETE FROM profit_calculations WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}
