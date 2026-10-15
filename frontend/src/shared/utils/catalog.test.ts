import { describe, expect, it } from 'vitest';
import {
  calculateOpportunityScores,
  filterProducts,
  getMockPriceRecords,
  getSeedProductById,
  getSeedProducts,
} from '@daoye/shared';

const PRICE_TYPES = ['listing', 'sold', 'reference', 'manual', 'simulated'] as const;

/**
 * 机会评分需要价格记录作为入参，测试里显式配对，和后端建库时的方式一致。
 * 预计转卖价只能来自用户填写的行情价，所以这里为每个商品显式给出一条行情价。
 */
function seedOpportunities(marketPriceRatio = 1.12) {
  return calculateOpportunityScores(
    getSeedProducts().map((product) => ({
      product,
      priceRecords: getMockPriceRecords(product.id),
      marketPrice: Math.round((product.price * marketPriceRatio) / 100) * 100,
    }))
  );
}

describe('内置演示目录', () => {
  it('同一商品每次生成的价格记录完全一致（确定性）', () => {
    expect(getMockPriceRecords(11)).toEqual(getMockPriceRecords(11));
  });

  it('所有价格记录都带明确的类型标注，取值只能是五种之一', () => {
    const records = getMockPriceRecords(6);
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(PRICE_TYPES).toContain(record.price_type);
    }
  });

  it('五种价格类型全部出现在同一商品的记录中（便于演示类型区分）', () => {
    const types = new Set(getMockPriceRecords(1).map((record) => record.price_type));
    for (const type of PRICE_TYPES) {
      expect(types.has(type)).toBe(true);
    }
  });

  it('模拟数据必须自带说明，不能伪装成真实行情', () => {
    const simulated = getMockPriceRecords(3).filter(
      (record) => record.price_type === 'simulated'
    );
    expect(simulated.length).toBeGreaterThan(0);
    for (const record of simulated) {
      expect(record.notes).toContain('仅用于演示');
      expect(record.data_source).toBe('模拟测试数据');
    }
  });

  it('每条价格记录都带采集时间、平台、来源与可信度', () => {
    for (const record of getMockPriceRecords(21)) {
      expect(record.platform.length).toBeGreaterThan(0);
      expect(Number.isNaN(new Date(record.collected_at).getTime())).toBe(false);
      expect(record.source_url.length).toBeGreaterThan(0);
      expect(record.confidence).toBeGreaterThan(0);
      expect(record.listing_id.length).toBeGreaterThan(0);
    }
  });

  it('成交价与挂牌价分开存在，不能互相冒充', () => {
    const records = getMockPriceRecords(16);
    const sold = records.filter((record) => record.price_type === 'sold');
    const listing = records.filter((record) => record.price_type === 'listing');
    expect(sold.length).toBeGreaterThan(0);
    expect(listing.length).toBeGreaterThan(0);
    expect(sold.some((record) => record.price_type === 'listing')).toBe(false);
  });

  it('商品带有可用于核验的型号、图片与描述字段', () => {
    const product = getSeedProductById(1);
    expect(product?.model).toBeTruthy();
    expect(product?.images?.length).toBeGreaterThan(0);
    expect(product?.description?.length).toBeGreaterThan(20);
  });

  it('单件商品只覆盖少数地区，地区筛选才有区分度', () => {
    const allLocations = new Set(getMockPriceRecords(1).map((r) => r.location));
    expect(allLocations.size).toBeLessThanOrEqual(2);

    // 不同商品之间应该有地区差异，否则筛选等于没筛。
    const regionSets = getSeedProducts().map(
      (product) => new Set(getMockPriceRecords(product.id).map((r) => r.location)).size
    );
    expect(regionSets.every((size) => size <= 2)).toBe(true);
    const distinctFirstRegions = new Set(
      getSeedProducts().map((product) => getMockPriceRecords(product.id)[0].location)
    );
    expect(distinctFirstRegions.size).toBeGreaterThan(1);
  });
});

describe('商品筛选', () => {
  const products = getSeedProducts();

  it('按关键词匹配名称或品牌', () => {
    const byName = filterProducts(products, { keyword: 'sony' });
    const byBrand = filterProducts(products, { keyword: 'canon' });
    expect(byName.length).toBeGreaterThan(0);
    expect(
      byName.every((item) => /sony/i.test(item.name) || /sony/i.test(item.brand))
    ).toBe(true);
    expect(byBrand.length).toBeGreaterThan(0);
  });

  it('按品类筛选', () => {
    const gpus = filterProducts(products, { categoryId: '3' });
    expect(gpus.length).toBeGreaterThan(0);
    expect(gpus.every((item) => item.category === '显卡')).toBe(true);
  });

  it('关键词无匹配时返回空数组而不是全部数据', () => {
    expect(filterProducts(products, { keyword: '不存在的商品xyz' })).toHaveLength(0);
  });

  it('同型号不同成色可以被区分出来', () => {
    const phones = filterProducts(products, { categoryId: '5' });
    const conditions = new Set(phones.map((item) => item.condition));
    expect(conditions.size).toBeGreaterThan(1);
  });
});

describe('机会评分', () => {
  it('按综合评分从高到低排序', () => {
    const scores = seedOpportunities();
    expect(scores.length).toBe(getSeedProducts().length);
    for (let index = 1; index < scores.length; index++) {
      expect(scores[index - 1].composite_score).toBeGreaterThanOrEqual(
        scores[index].composite_score
      );
    }
  });

  it('评分不是所有商品都一样（避免排序完全失效）', () => {
    const scores = seedOpportunities();
    const distinct = new Set(scores.map((item) => item.composite_score));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('每条机会都带有结论依据，而不是只给一个分数', () => {
    for (const item of seedOpportunities()) {
      expect(item.recommendation_reason.length).toBeGreaterThan(0);
    }
  });

  it('三个推荐档位都非空（门槛与实际数据分布匹配）', () => {
    const scores = seedOpportunities();
    const counts = {
      watch: scores.filter((item) => item.recommendation === 'watch').length,
      caution: scores.filter((item) => item.recommendation === 'caution').length,
      avoid: scores.filter((item) => item.recommendation === 'avoid').length,
    };
    expect(counts.watch).toBeGreaterThan(0);
    expect(counts.caution).toBeGreaterThan(0);
    expect(counts.avoid).toBeGreaterThan(0);
  });

  it('不会只按价差排序：价差更大的商品综合评分未必更高', () => {
    const scores = seedOpportunities();
    const byGap = [...scores]
      .sort((a, b) => (b.price_gap ?? 0) - (a.price_gap ?? 0))
      .map((i) => i.product_id);
    const byComposite = [...scores]
      .sort((a, b) => b.composite_score - a.composite_score)
      .map((i) => i.product_id);
    expect(byGap).not.toEqual(byComposite);
  });

  it('未设置行情价时不编造利润，只保留风险与可信度维度', () => {
    const withoutMarketPrice = calculateOpportunityScores(
      getSeedProducts().map((product) => ({
        product,
        priceRecords: getMockPriceRecords(product.id),
      }))
    );
    for (const item of withoutMarketPrice) {
      expect(item.market_price_set).toBe(false);
      expect(item.net_profit).toBeNull();
      expect(item.roi).toBeNull();
      expect(item.price_gap).toBeNull();
      expect(item.sell_price_source).toBe('未设置行情价');
    }
  });

  it('风险等级只允许四种取值', () => {
    const allowed = ['low', 'medium', 'high', 'insufficient'];
    for (const item of seedOpportunities()) {
      expect(allowed).toContain(item.risk_level);
    }
  });
});

describe('getSeedProductById', () => {
  it('返回已知商品，未知 id 返回 undefined', () => {
    expect(getSeedProductById(1)?.name).toContain('Sony');
    expect(getSeedProductById(99999)).toBeUndefined();
  });
});
