import type { DatabaseSync } from 'node:sqlite';
import {
  calculateOpportunityScores,
  categoryNamesForFilter,
  type OpportunityScore,
  type RiskLevel,
} from '@daoye/shared';
import { listProducts } from '../repositories/products.ts';
import { listPriceRecordsByProduct } from '../repositories/priceRecords.ts';
import {
  describeMarketPrice,
  listMarketPrices,
  matchMarketPrice,
} from '../repositories/marketPrices.ts';

export interface OpportunityFilter {
  keyword?: string;
  categories?: string[];
  maxRiskLevel?: RiskLevel;
  minNetProfit?: number;
  minRoi?: number;
  minDataConfidence?: number;
  recommendation?: 'watch' | 'caution' | 'avoid';
  limit?: number;
}

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  insufficient: 3,
};

/**
 * 机会评分：复用 @daoye/shared 的同一份算法，
 * 数据来自 SQLite，不使用前端传来的分数（避免前端篡改影响结论）。
 */
export function computeOpportunities(
  db: DatabaseSync,
  filter: OpportunityFilter = {}
): OpportunityScore[] {
  const { items } = listProducts(db, {
    keyword: filter.keyword,
    limit: 500,
    offset: 0,
  });
  const recordsByProduct = listPriceRecordsByProduct(
    db,
    items.map((item) => item.id)
  );
  // 行情价由用户维护；匹配不到就保持未设置，不生成利润。
  const marketPrices = listMarketPrices(db);

  const scored = calculateOpportunityScores(
    items.map((product) => {
      const matched = matchMarketPrice(marketPrices, product);
      return {
        product,
        priceRecords: recordsByProduct.get(product.id) ?? [],
        marketPrice: matched?.price,
        marketPriceLabel: matched ? describeMarketPrice(matched) : undefined,
      };
    })
  );

  // 选大分类时展开成它的细分类，保证旧数据也能被筛到。
  const categoryFilter = filter.categories?.length
    ? new Set(filter.categories.flatMap((name) => categoryNamesForFilter(name)))
    : undefined;

  const filtered = scored.filter((item) => {
    if (categoryFilter && !categoryFilter.has(item.category)) return false;
    if (filter.maxRiskLevel && RISK_ORDER[item.risk_level] > RISK_ORDER[filter.maxRiskLevel]) {
      return false;
    }
    // 未设置行情价时利润为 null，无法满足「最小利润 / 最小 ROI」的筛选条件。
    if (filter.minNetProfit !== undefined) {
      if (item.net_profit === null || item.net_profit < filter.minNetProfit) return false;
    }
    if (filter.minRoi !== undefined) {
      if (item.roi === null || item.roi < filter.minRoi) return false;
    }
    if (
      filter.minDataConfidence !== undefined &&
      item.data_confidence < filter.minDataConfidence
    ) {
      return false;
    }
    if (filter.recommendation && item.recommendation !== filter.recommendation) return false;
    return true;
  });

  return filter.limit ? filtered.slice(0, filter.limit) : filtered;
}

export function summarizeOpportunities(items: OpportunityScore[]) {
  return {
    total: items.length,
    watch: items.filter((item) => item.recommendation === 'watch').length,
    caution: items.filter((item) => item.recommendation === 'caution').length,
    avoid: items.filter((item) => item.recommendation === 'avoid').length,
    riskLevels: {
      low: items.filter((item) => item.risk_level === 'low').length,
      medium: items.filter((item) => item.risk_level === 'medium').length,
      high: items.filter((item) => item.risk_level === 'high').length,
      insufficient: items.filter((item) => item.risk_level === 'insufficient').length,
    },
  };
}
