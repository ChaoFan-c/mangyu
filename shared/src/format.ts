import type { PriceType } from './types.ts';

export type { PriceType };

/**
 * 挂牌价 ≠ 成交价 ≠ 参考价 ≠ 手动录入 ≠ 模拟数据。
 * 界面必须始终带上类型标签，避免把挂牌价当成真实成交价。
 */
export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  sold: '成交价',
  listing: '挂牌价',
  reference: '参考价',
  manual: '手动录入',
  simulated: '模拟数据',
};

/** 徽章配色：成交价绿、挂牌价橙、参考价品牌黄、手动录入中性深色、模拟数据灰。 */
const PRICE_TYPE_BADGE: Record<PriceType, string> = {
  sold: 'bg-green-50 text-green-700 ring-green-200',
  listing: 'bg-warn-50 text-warn-700 ring-warn-200',
  reference: 'bg-brand-50 text-brand-800 ring-brand-200',
  manual: 'bg-white text-ink-800 ring-gray-300',
  simulated: 'bg-gray-100 text-ink-500 ring-gray-200',
};

const PRICE_TYPE_TEXT: Record<PriceType, string> = {
  sold: 'text-green-700',
  listing: 'text-warn-700',
  reference: 'text-brand-800',
  manual: 'text-ink-900',
  simulated: 'text-ink-500',
};

export function getPriceTypeLabel(type: PriceType): string {
  return PRICE_TYPE_LABELS[type] ?? '未知来源';
}

export function getPriceTypeBadgeClass(type: PriceType): string {
  return PRICE_TYPE_BADGE[type] ?? PRICE_TYPE_BADGE.simulated;
}

export function getPriceTypeTextClass(type: PriceType): string {
  return PRICE_TYPE_TEXT[type] ?? PRICE_TYPE_TEXT.simulated;
}

/** 金额一律以「分」存储与计算，展示时再转元，避免浮点误差。 */
export function formatPrice(cents?: number | null, decimals = 0): string {
  if (cents === undefined || cents === null || Number.isNaN(cents)) return '—';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(cents / 100);
}

/** 带正负号的金额，用于利润展示。 */
export function formatSignedPrice(cents?: number | null): string {
  if (cents === undefined || cents === null) return '—';
  const formatted = formatPrice(Math.abs(cents));
  return cents >= 0 ? `+${formatted}` : `-${formatted}`;
}

export function formatPercent(value?: number | null, decimals = 2): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('zh-CN');
}

export function formatRelativeDays(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  return `${days} 天前`;
}
