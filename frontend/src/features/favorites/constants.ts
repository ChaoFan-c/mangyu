import type { FavoriteStatus } from '@/shared/api/endpoints';

export const trackStatusLabels: Record<FavoriteStatus, string> = {
  watching: '关注中',
  bought: '已买入',
  sold: '已售出',
  skipped: '已放弃',
};

export const trackStatusBadgeClass: Record<FavoriteStatus, string> = {
  watching: 'bg-brand-50 text-brand-800 ring-brand-200',
  bought: 'bg-ink-900 text-white ring-ink-900',
  sold: 'bg-green-50 text-green-700 ring-green-200',
  skipped: 'bg-gray-100 text-gray-600 ring-gray-200',
};

export const TRACK_STATUS_OPTIONS: Array<{ value: FavoriteStatus; label: string }> = (
  Object.keys(trackStatusLabels) as FavoriteStatus[]
).map((value) => ({ value, label: trackStatusLabels[value] }));
