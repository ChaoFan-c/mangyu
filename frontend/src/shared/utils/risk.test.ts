import { describe, expect, it } from 'vitest';
import { assessRisk } from './risk';
import { getMockPriceRecords } from '@daoye/shared';

describe('assessRisk', () => {
  it('没有任何成交价时，价格偏离维度标为无法确认，而不是猜一个结论', () => {
    const result = assessRisk({ category: '显卡', price: 500000, priceRecords: [] });
    const deviation = result.evidence.find((item) => item.id === 'price-deviation');

    expect(deviation?.status).toBe('unknown');
    expect(result.unverified_risks.join('')).toContain('无法判断价格是否异常');
  });

  it('证据不足时风险等级为「信息不足」，不会给出低风险结论', () => {
    const result = assessRisk({ category: '显卡', price: 500000, priceRecords: [] });

    expect(result.risk_level).toBe('insufficient');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('只有图片、没有成交价时，仍然不会得出低风险结论', () => {
    const result = assessRisk({
      category: '手机',
      price: 700000,
      priceRecords: [],
      images: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'],
    });

    expect(result.risk_level).not.toBe('low');
  });

  it('卖家信誉高不会被当作商品真伪的证据', () => {
    const result = assessRisk({
      category: '镜头',
      price: 1200000,
      priceRecords: [],
      sellerInfo: { name: '高分卖家', rating: 5, transactions: 900 },
    });
    const seller = result.evidence.find((item) => item.id === 'seller');

    expect(seller?.status).toBe('pass');
    expect(seller?.impact).toContain('不能作为商品真伪的证据');
  });

  it('每条证据都必须带上来源与影响说明', () => {
    const result = assessRisk({
      category: '无人机',
      price: 900000,
      priceRecords: getMockPriceRecords(16),
    });

    expect(result.evidence.length).toBeGreaterThan(0);
    for (const item of result.evidence) {
      expect(item.source.length).toBeGreaterThan(0);
      expect(item.impact.length).toBeGreaterThan(0);
      expect(item.dimension.length).toBeGreaterThan(0);
    }
  });

  it('同样的输入得到同样的结论（确定性，不随渲染抖动）', () => {
    const input = {
      category: '相机机身',
      price: 2200000,
      priceRecords: getMockPriceRecords(1),
    };
    const first = assessRisk(input);
    const second = assessRisk(input);

    expect(second.risk_level).toBe(first.risk_level);
    expect(second.score).toBe(first.score);
    expect(second.evidence.map((item) => item.status)).toEqual(
      first.evidence.map((item) => item.status)
    );
  });

  it('品类专用风险维度会出现在证据清单里', () => {
    const camera = assessRisk({ category: '相机机身', price: 2000000, priceRecords: [] });
    const lens = assessRisk({ category: '镜头', price: 1000000, priceRecords: [] });

    expect(camera.evidence.map((item) => item.dimension).join('')).toContain('快门');
    expect(lens.evidence.map((item) => item.dimension).join('')).toContain('霉斑');
  });

  it('要价明显偏离用户行情价时判为存在风险', () => {
    // 价格偏离只对「用户填写的行情价」生效：sold 记录不再充当市场均价。
    const result = assessRisk({
      category: '手机',
      price: 100000,
      marketPrice: 900000,
    });

    const deviation = result.evidence.find((item) => item.id === 'price-deviation');
    expect(deviation?.status).toBe('fail');
  });

  it('结论文字明确说明该评估不判定真伪', () => {
    const result = assessRisk({
      category: '笔记本',
      price: 1000000,
      priceRecords: getMockPriceRecords(31),
    });

    expect(result.calculation_basis).toContain('不代表商品为真品或赝品');
  });
});
