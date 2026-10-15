import { badRequest } from './http/router.ts';
import { isKnownCategoryName } from '@daoye/shared';

const PRICE_TYPES = ['listing', 'sold', 'reference', 'manual', 'simulated'] as const;
const CONDITIONS = ['new', '99new', '95new', '90new', 'good', 'fair', 'parts'] as const;
const STATUSES = ['watching', 'bought', 'sold', 'skipped'] as const;

export function asObject(value: unknown, label = '请求体'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw badRequest(`${label}必须是 JSON 对象`);
  }
  return value as Record<string, unknown>;
}

export function requiredString(
  source: Record<string, unknown>,
  key: string,
  label = key
): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`${label}不能为空`);
  }
  return value.trim();
}

export function optionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw badRequest(`${key}必须是字符串`);
  return value.trim();
}

export function requiredNumber(
  source: Record<string, unknown>,
  key: string,
  label = key
): number {
  const value = source[key];
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    throw badRequest(`${label}必须是数字`);
  }
  return num;
}

export function optionalNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === '') return undefined;
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    throw badRequest(`${key}必须是数字`);
  }
  return num;
}

export function optionalEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[]
): T | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw badRequest(`${key}只能是 ${allowed.join(' / ')} 之一`);
  }
  return value as T;
}

/** 金额以「分」传输；这里统一做非负整数校验。 */
export function requireCents(
  source: Record<string, unknown>,
  key: string,
  label = key
): number {
  const value = requiredNumber(source, key, label);
  if (!Number.isInteger(value) || value < 0) {
    throw badRequest(`${label}必须是不小于 0 的整数（单位：分）`);
  }
  return value;
}

export function optionalCents(source: Record<string, unknown>, key: string): number | undefined {
  const value = optionalNumber(source, key);
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    throw badRequest(`${key}必须是不小于 0 的整数（单位：分）`);
  }
  return value;
}

export function requireCategoryName(source: Record<string, unknown>, key = 'category'): string {
  const value = requiredString(source, key, '品类');
  // 兼容两层分类：10 个大分类与保留的细分类都算合法输入。
  if (!isKnownCategoryName(value)) {
    throw badRequest(`品类「${value}」不在支持列表中`);
  }
  return value;
}

export function optionalCondition(source: Record<string, unknown>, key = 'condition'): string {
  const value = optionalEnum(source, key, CONDITIONS);
  return value ?? '99new';
}

export function requireStatus(source: Record<string, unknown>, key = 'status'): string {
  const value = optionalEnum(source, key, STATUSES);
  if (!value) throw badRequest(`${key}必须是 ${STATUSES.join(' / ')} 之一`);
  return value;
}

export function optionalPriceType(source: Record<string, unknown>, key = 'price_type') {
  return optionalEnum(source, key, PRICE_TYPES);
}

export function clampLimit(value: string | null, fallback = 50, max = 200): number {
  if (!value) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(Math.floor(num), max);
}

export function clampOffset(value: string | null): number {
  if (!value) return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

export { PRICE_TYPES, CONDITIONS, STATUSES };
