/**
 * 前后端共用的领域逻辑。
 * 利润计算、风险评估、机会评分这三块是纯函数，必须只有一份实现，
 * 否则前端展示与后端复核会出现两套算法。
 */
export * from './types.ts';
export * from './catalog.ts';
export * from './random.ts';
export * from './format.ts';
export * from './calculator.ts';
export * from './risk.ts';
export * from './opportunity.ts';
export * from './mockData.ts';
export * from './priceTimeline.ts';
