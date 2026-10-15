// 品类与品牌清单由 @daoye/shared 提供，前后端共用同一份定义。
export {
  BRANDS,
  CATEGORIES,
  CATEGORY_GROUPS,
  UNMAPPED_CATEGORY_LABEL,
  brandNameById,
  categoryGroupNameOf,
  categoryIdByName,
  categoryIdForStorage,
  categoryNameById,
  categoryNamesForFilter,
  childCategoryNamesOfGroup,
  isCategoryGroupName,
  isKnownCategoryName,
} from '@daoye/shared';

export const PRICE_TYPE_LABELS = {
  listing: '在售挂牌价',
  sold: '实际成交价',
  reference: '历史参考价',
  manual: '手动录入',
  simulated: '模拟数据',
} as const;

export const RISK_LEVEL_LABELS = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  insufficient: '信息不足',
} as const;

export const RISK_LEVEL_COLORS = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
  insufficient: '#9CA3AF',
} as const;
