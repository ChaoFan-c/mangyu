import type { MockPriceRecord, ProductType, Recommendation, RiskLevel } from './types.ts';
import { assessRisk } from './risk.ts';
import { calculateProfit } from './calculator.ts';

export type { Recommendation };

export interface OpportunityScore {
  product_id: number;
  product_name: string;
  category: string;
  brand: string;
  condition: string;
  buy_price: number;
  /** 以下利润字段在「未设置行情价」时为 null：不生成虚假的预计利润。 */
  net_profit: number | null;
  profit_margin: number | null;
  roi: number | null;
  price_gap: number | null;
  price_gap_ratio: number | null;
  /** 预估转卖价的来源说明：用户行情价 / 未设置行情价。 */
  sell_price_source: string;
  /** 是否已由用户设置行情价（决定利润字段是否可用）。 */
  market_price_set: boolean;
  risk_level: RiskLevel;
  risk_score: number;
  data_confidence: number;
  liquidity_score: number;
  capital_occupied: number | null;
  expected_hold_days: number;
  composite_score: number;
  recommendation: Recommendation;
  recommendation_reason: string[];
}

/**
 * 机会评分不是单纯按价差排序。
 * 高价差但真伪不明、难以出手或成本不确定的商品，会因为风险、可信度、
 * 流动性与资金效率三个维度被拉低总分。
 */
const WEIGHTS = {
  net_profit: 0.2,
  roi: 0.2,
  price_gap: 0.15,
  risk: 0.15,
  data_confidence: 0.1,
  liquidity: 0.1,
  /** 资金周转效率：用年化、风险调整后的收益率衡量，避免与 ROI 重复计分。 */
  capital_velocity: 0.1,
} as const;

/** 演示场景下的默认成本假设，全部显式写出来，不藏在代码里。 */
export const DEMO_COST_ASSUMPTIONS = {
  buyShipping: 3000,
  sellShipping: 3000,
  platformFeeRate: 0.01,
  inspectionFee: 2000,
  repairFee: 0,
  accessoriesFee: 1000,
  otherFees: 500,
  negotiationBuffer: 5000,
  returnLossBuffer: 5000,
  returnProbability: 0.1,
  holdDays: 30,
} as const;

export function calculateOpportunityScores(
  items: Array<{
    product: ProductType;
    priceRecords: MockPriceRecord[];
    /** 用户为该商品匹配到的行情价（分）。未设置时不做利润测算。 */
    marketPrice?: number;
    /** 命中的行情价来源说明，例如「型号「A7M4」」。 */
    marketPriceLabel?: string;
  }>
): OpportunityScore[] {
  return items
    .map(({ product, priceRecords, marketPrice, marketPriceLabel }) =>
      buildOpportunity(product, priceRecords, marketPrice, marketPriceLabel)
    )
    .sort((a, b) => b.composite_score - a.composite_score);
}

/**
 * 价格记录由调用方提供：前端来自 API，后端来自 SQLite，评分逻辑本身不关心数据来源。
 */
export function buildOpportunity(
  product: ProductType,
  priceRecords: MockPriceRecord[],
  marketPrice?: number,
  marketPriceLabel?: string
): OpportunityScore {
  const risk = assessRisk({
    category: product.category,
    price: product.price,
    priceRecords,
    images: product.images,
    description: product.description,
    sellerInfo: product.seller,
    marketPrice,
  });
  const dataConfidence = calculateDataConfidence(priceRecords);
  const soldCount = priceRecords.filter((r) => r.price_type === 'sold').length;
  const liquidityScore = calculateLiquidityScore(product.category, soldCount);

  const hasMarketPrice = typeof marketPrice === 'number' && marketPrice > 0;
  const sellPriceSource = hasMarketPrice
    ? `用户填写的行情价${marketPriceLabel ? `（${marketPriceLabel}）` : ''}`
    : '未设置行情价';

  // 未设置行情价时不做任何利润测算：宁可显示「未设置」，也不用挂牌价冒充转卖价。
  if (!hasMarketPrice) {
    const withoutProfit =
      (risk.score / 100) * WEIGHTS.risk +
      dataConfidence * WEIGHTS.data_confidence +
      liquidityScore * WEIGHTS.liquidity;
    const availableWeight = WEIGHTS.risk + WEIGHTS.data_confidence + WEIGHTS.liquidity;
    const compositeScore = clamp(Math.round((withoutProfit / availableWeight) * 100), 0, 100);
    return {
      product_id: product.id,
      product_name: product.name,
      category: product.category,
      brand: product.brand,
      condition: product.condition,
      buy_price: product.price,
      net_profit: null,
      profit_margin: null,
      roi: null,
      price_gap: null,
      price_gap_ratio: null,
      sell_price_source: sellPriceSource,
      market_price_set: false,
      risk_level: risk.risk_level,
      risk_score: risk.score,
      data_confidence: Math.round(dataConfidence * 100),
      liquidity_score: Math.round(liquidityScore * 100),
      capital_occupied: null,
      expected_hold_days: DEMO_COST_ASSUMPTIONS.holdDays,
      composite_score: compositeScore,
      recommendation: 'caution',
      recommendation_reason: [
        '未设置行情价，无法计算预计利润与 ROI',
        `综合评分只由风险、数据可信度、流动性三个维度按权重归一得出（${compositeScore} 分）`,
        '请在「本机采集」页填写行情价后重新查看',
      ],
    };
  }

  const calc = calculateProfit({
    buyPrice: product.price,
    sellPrice: marketPrice,
    ...DEMO_COST_ASSUMPTIONS,
  });
  const baseline = calc.scenarios.baseline;
  const priceGap = marketPrice - product.price;
  const priceGapRatio = marketPrice > 0 ? priceGap / marketPrice : 0;
  const capitalOccupied = baseline.capitalOccupied;

  /**
   * 各维度先归一化到 0-1，按权重加权后再换算成 0-100 分。
   * 归一化区间按二手数码的实际决策空间选取：例如 ROI 区间取 -10% ~ 25%，
   * 如果用更宽的区间，8% 与 10% 的差异会被压平，排序就失去区分度。
   */
  const weightedScore =
    normalize(baseline.netProfit, -200000, 400000) * WEIGHTS.net_profit +
    normalize(baseline.roi, -10, 25) * WEIGHTS.roi +
    normalize(priceGapRatio, -0.2, 0.3) * WEIGHTS.price_gap +
    (risk.score / 100) * WEIGHTS.risk +
    dataConfidence * WEIGHTS.data_confidence +
    liquidityScore * WEIGHTS.liquidity +
    normalize(baseline.annualizedRoi, -50, 300) * WEIGHTS.capital_velocity;

  const compositeScore = clamp(Math.round(weightedScore * 100), 0, 100);

  const { recommendation, recommendation_reason } = determineRecommendation({
    netProfit: baseline.netProfit,
    roi: baseline.roi,
    riskLevel: risk.risk_level,
    dataConfidence,
    costCompleteness: calc.costCompleteness,
    liquidityScore,
    priceRecordCount: priceRecords.length,
    sellPriceSource,
  });

  return {
    product_id: product.id,
    product_name: product.name,
    category: product.category,
    brand: product.brand,
    condition: product.condition,
    buy_price: product.price,
    net_profit: baseline.netProfit,
    profit_margin: baseline.profitMargin,
    roi: baseline.roi,
    price_gap: priceGap,
    price_gap_ratio: Math.round(priceGapRatio * 1000) / 10,
    sell_price_source: sellPriceSource,
    market_price_set: true,
    risk_level: risk.risk_level,
    risk_score: risk.score,
    data_confidence: Math.round(dataConfidence * 100),
    liquidity_score: Math.round(liquidityScore * 100),
    capital_occupied: capitalOccupied,
    expected_hold_days: DEMO_COST_ASSUMPTIONS.holdDays,
    composite_score: compositeScore,
    recommendation,
    recommendation_reason,
  };
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calculateDataConfidence(priceRecords: MockPriceRecord[]): number {
  if (priceRecords.length === 0) return 0.1;

  const counts = priceRecords.reduce<Record<string, number>>((acc, record) => {
    acc[record.price_type] = (acc[record.price_type] ?? 0) + 1;
    return acc;
  }, {});

  const total = priceRecords.length;
  // 成交价样本数量是可信度的主要来源：1 条只是参考，4 条以上才算站稳。
  const soldComponent = (Math.min(counts.sold ?? 0, 4) / 4) * 0.5;
  // 有挂牌价与参考价能交叉验证，但权重低于成交价。
  const supportComponent = (counts.listing ? 0.2 : 0) + (counts.reference ? 0.1 : 0);
  // 记录总量本身就影响可信度，样本太少的结论要打折。
  const volumeComponent = (Math.min(total, 8) / 8) * 0.2;
  // 模拟数据占比越高，可信度越低。
  const simulatedPenalty = ((counts.simulated ?? 0) / total) * 0.3;

  return clamp(
    soldComponent + supportComponent + volumeComponent - simulatedPenalty,
    0.1,
    1
  );
}

function calculateLiquidityScore(category: string, soldCount: number): number {
  const baseByCategory: Record<string, number> = {
    手机: 0.9,
    笔记本: 0.85,
    平板: 0.8,
    相机机身: 0.7,
    镜头: 0.65,
    无人机: 0.6,
    显卡: 0.55,
  };
  const base = baseByCategory[category] ?? 0.5;
  return clamp(base + Math.min(0.2, soldCount * 0.05), 0, 1);
}

function determineRecommendation(params: {
  netProfit: number;
  roi: number;
  riskLevel: RiskLevel;
  dataConfidence: number;
  costCompleteness: number;
  liquidityScore: number;
  priceRecordCount: number;
  sellPriceSource: string;
}): { recommendation: Recommendation; recommendation_reason: string[] } {
  const reasons: string[] = [];
  const {
    netProfit,
    roi,
    riskLevel,
    dataConfidence,
    costCompleteness,
    liquidityScore,
    priceRecordCount,
    sellPriceSource,
  } = params;

  /**
   * 门槛取自二手数码周转的常见经验值，而不是为了让排行榜好看：
   * 一个 ~30 天的周转周期里，净利低于 800 元不值得投入精力，
   * 单周期 ROI 低于 8% 跑不赢资金占用与核验成本。
   * 这些门槛同时展示在「机会排行榜」页面上，方便用户自行判断。
   */
  const strongProfit = netProfit >= 80000 && roi >= 8;
  const solidData = dataConfidence >= 0.6 && priceRecordCount >= 5;
  const completeCost = costCompleteness >= 0.8;
  const liquid = liquidityScore >= 0.6;

  if (netProfit <= 0) {
    reasons.push(`基准情景净利润为负（${(netProfit / 100).toFixed(0)} 元），直接买入即亏损`);
    return { recommendation: 'avoid', recommendation_reason: reasons };
  }

  if (netProfit < 30000 && roi < 8) {
    reasons.push('基准情景利润空间过薄，扣掉时间成本后性价比很低');
    if (roi < 8) reasons.push(`投资回报率仅 ${roi.toFixed(1)}%`);
    return { recommendation: 'avoid', recommendation_reason: reasons };
  }

  if (riskLevel === 'insufficient') {
    reasons.push('证据不足，风险无法评估，不建议在信息补齐前下单');
    reasons.push('需先确认序列号、成色、维修史等关键信息');
    return { recommendation: 'caution', recommendation_reason: reasons };
  }

  if (riskLevel === 'high') {
    reasons.push('存在明确的高风险项，需要现场验货或压价补偿');
    if (strongProfit) reasons.push(`虽然基准净利润约 ${(netProfit / 100).toFixed(0)} 元，但风险未被覆盖`);
    return { recommendation: 'caution', recommendation_reason: reasons };
  }

  if (
    strongProfit &&
    solidData &&
    completeCost &&
    liquid &&
    (riskLevel === 'low' || riskLevel === 'medium')
  ) {
    reasons.push(`基准情景净利润约 ${(netProfit / 100).toFixed(0)} 元，ROI ${roi.toFixed(1)}%`);
    reasons.push(`售价参考来自${sellPriceSource}，价格数据可信度 ${Math.round(dataConfidence * 100)}%`);
    reasons.push(
      `风险等级为${riskLevel === 'low' ? '低风险' : '中风险'}（无高风险项），品类流动性 ${Math.round(
        liquidityScore * 100
      )}%`
    );
    reasons.push('成本项填写完整，未出现隐性成本缺口');
    return { recommendation: 'watch', recommendation_reason: reasons };
  }

  reasons.push(`有一定利润空间（约 ${(netProfit / 100).toFixed(0)} 元，ROI ${roi.toFixed(1)}%）`);
  if (riskLevel === 'medium') reasons.push('存在中等风险，需要验货确认');
  if (dataConfidence < 0.6) reasons.push(`价格数据可信度偏低（${Math.round(dataConfidence * 100)}%）`);
  if (!liquid) reasons.push('该品类流动性一般，出手周期可能较长');
  if (!completeCost) reasons.push('成本填写不完整，利润可能被低估或高估');
  if (!solidData) reasons.push('价格样本量偏少，reference 区间可能不够稳定');
  return { recommendation: 'caution', recommendation_reason: reasons };
}

export function filterOpportunities(
  opportunities: OpportunityScore[],
  filters: {
    keyword?: string;
    minNetProfit?: number;
    minRoi?: number;
    maxRiskLevel?: RiskLevel;
    minDataConfidence?: number;
    recommendation?: Recommendation;
    categories?: string[];
  }
): OpportunityScore[] {
  const riskOrder: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, insufficient: 3 };
  const keyword = filters.keyword?.trim().toLowerCase();

  return opportunities.filter((item) => {
    if (keyword && !`${item.product_name} ${item.brand}`.toLowerCase().includes(keyword)) return false;
    // 未设置行情价时利润为 null：这类商品无法满足「最小利润/最小 ROI」的条件，直接排除。
    if (filters.minNetProfit !== undefined) {
      if (item.net_profit === null || item.net_profit < filters.minNetProfit) return false;
    }
    if (filters.minRoi !== undefined) {
      if (item.roi === null || item.roi < filters.minRoi) return false;
    }
    if (filters.maxRiskLevel && riskOrder[item.risk_level] > riskOrder[filters.maxRiskLevel]) return false;
    if (filters.minDataConfidence !== undefined && item.data_confidence < filters.minDataConfidence) return false;
    if (filters.recommendation && item.recommendation !== filters.recommendation) return false;
    if (filters.categories?.length && !filters.categories.includes(item.category)) return false;
    return true;
  });
}

export const recommendationLabels: Record<Recommendation, string> = {
  watch: '值得关注',
  caution: '谨慎购买',
  avoid: '暂不推荐',
};

export const recommendationBadgeClass: Record<Recommendation, string> = {
  watch: 'bg-green-50 text-green-700 ring-green-200',
  caution: 'bg-warn-50 text-warn-700 ring-warn-200',
  avoid: 'bg-red-50 text-red-700 ring-red-200',
};
