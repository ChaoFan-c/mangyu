import { describe, expect, it } from 'vitest';
import {
  calculateProfit,
  centsToYuan,
  yuanToCents,
  type CalculatorInput,
} from './calculator';

/**
 * 测试用的完整输入，金额单位为「分」。
 * 期望值在测试内部用独立算式重新推导，而不是复制被测代码。
 */
const FULL_INPUT: CalculatorInput = {
  buyPrice: 100000,
  sellPrice: 130000,
  buyShipping: 3000,
  sellShipping: 3000,
  platformFeeRate: 0.02,
  inspectionFee: 2000,
  repairFee: 1000,
  accessoriesFee: 500,
  otherFees: 500,
  negotiationBuffer: 5000,
  returnLossBuffer: 5000,
  returnProbability: 0.2,
  holdDays: 30,
};

function expectedBaseline(input: Required<CalculatorInput>) {
  const platformFee = Math.round(input.sellPrice * input.platformFeeRate);
  const totalBuyCost = input.buyPrice + input.buyShipping;
  const totalSellCost =
    input.sellShipping +
    platformFee +
    input.inspectionFee +
    input.repairFee +
    input.accessoriesFee +
    input.otherFees +
    input.negotiationBuffer;
  const netRevenue = input.sellPrice - totalSellCost;
  const netProfit = netRevenue - totalBuyCost;
  const totalInvestment = totalBuyCost + totalSellCost;
  const expectedReturnLoss =
    input.returnProbability * (input.returnLossBuffer + totalBuyCost * 0.5);
  const riskAdjustedReturn = netProfit - expectedReturnLoss;
  return {
    totalBuyCost,
    totalSellCost,
    netRevenue,
    netProfit,
    totalInvestment,
    profitMargin: (netProfit / totalInvestment) * 100,
    netProfitMargin: (netProfit / input.sellPrice) * 100,
    riskAdjustedReturn,
    annualizedRoi: (riskAdjustedReturn / totalInvestment) * (365 / input.holdDays) * 100,
  };
}

describe('calculateProfit', () => {
  it('缺少必填项时拒绝计算，并指出缺了哪些字段', () => {
    const result = calculateProfit({ sellPrice: 130000 });

    expect(result.missingFields).toContain('buyPrice');
    expect(result.costCompleteness).toBe(0);
    expect(result.scenarios.baseline.netProfit).toBe(0);
    expect(result.warnings.join('')).toContain('必填项缺失');
  });

  it('缺少买入价与卖出价时不会用 0 冒充，而是明确报错', () => {
    const result = calculateProfit({});

    expect(result.missingFields).toEqual(expect.arrayContaining(['buyPrice', 'sellPrice']));
    expect(result.scenarios.conservative.netProfit).toBe(0);
    expect(result.scenarios.optimistic.netProfit).toBe(0);
  });

  it('可选成本缺失时给出警告，而不是静默按 0 计算', () => {
    const result = calculateProfit({
      buyPrice: 100000,
      sellPrice: 130000,
      platformFeeRate: 0.02,
    });

    expect(result.missingFields).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join('')).toContain('未填写');
    expect(result.costCompleteness).toBeLessThan(1);
  });

  it('按公式正确计算基准情景的利润、利润率与 ROI', () => {
    const result = calculateProfit(FULL_INPUT);
    const expected = expectedBaseline(FULL_INPUT as Required<CalculatorInput>);
    const baseline = result.scenarios.baseline;

    expect(baseline.totalBuyCost).toBe(expected.totalBuyCost);
    expect(baseline.totalSellCost).toBe(expected.totalSellCost);
    expect(baseline.netRevenue).toBe(expected.netRevenue);
    expect(baseline.netProfit).toBe(expected.netProfit);
    expect(baseline.profitMargin).toBeCloseTo(expected.profitMargin, 2);
    expect(baseline.roi).toBeCloseTo(expected.profitMargin, 2);
    expect(baseline.netProfitMargin).toBeCloseTo(expected.netProfitMargin, 2);
    expect(baseline.capitalOccupied).toBe(expected.totalBuyCost);
  });

  it('利润率为负时如实反映亏损，不做兜底', () => {
    const result = calculateProfit({
      buyPrice: 200000,
      sellPrice: 150000,
      platformFeeRate: 0.01,
      buyShipping: 0,
      sellShipping: 0,
      inspectionFee: 0,
      repairFee: 0,
      accessoriesFee: 0,
      otherFees: 0,
      negotiationBuffer: 0,
      returnLossBuffer: 0,
      returnProbability: 0,
      holdDays: 30,
    });

    expect(result.scenarios.baseline.netProfit).toBeLessThan(0);
    expect(result.scenarios.baseline.profitMargin).toBeLessThan(0);
  });

  it('风险调整收益扣除显式的预期退货损失', () => {
    const result = calculateProfit(FULL_INPUT);
    const expected = expectedBaseline(FULL_INPUT as Required<CalculatorInput>);
    const baseline = result.scenarios.baseline;

    expect(baseline.riskAdjustedReturn).toBe(Math.round(expected.riskAdjustedReturn));
    expect(baseline.riskAdjustedReturn).toBeLessThan(baseline.netProfit);
    expect(baseline.annualizedRoi).toBeCloseTo(expected.annualizedRoi, 1);
  });

  it('三情景满足 保守 ≤ 基准 ≤ 乐观', () => {
    const { scenarios } = calculateProfit(FULL_INPUT);

    expect(scenarios.conservative.netProfit).toBeLessThanOrEqual(scenarios.baseline.netProfit);
    expect(scenarios.baseline.netProfit).toBeLessThanOrEqual(scenarios.optimistic.netProfit);
    expect(scenarios.conservative.sellPrice).toBeLessThan(scenarios.optimistic.sellPrice);
  });

  it('持有天数影响年化 ROI，但不改变净利润', () => {
    const short = calculateProfit({ ...FULL_INPUT, holdDays: 15 });
    const long = calculateProfit({ ...FULL_INPUT, holdDays: 60 });

    expect(short.scenarios.baseline.netProfit).toBe(long.scenarios.baseline.netProfit);
    expect(short.scenarios.baseline.annualizedRoi).toBeGreaterThan(
      long.scenarios.baseline.annualizedRoi
    );
  });

  it('成本填写完整时完整度为 100%', () => {
    const result = calculateProfit(FULL_INPUT);

    expect(result.costCompleteness).toBe(1);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('金额单位换算', () => {
  it('元转分：22000 元必须变成 2200000 分，而不是 22000 分', () => {
    const engine = yuanToCents({ buyPrice: 22000, sellPrice: 24104, buyShipping: 30 });

    expect(engine.buyPrice).toBe(2200000);
    expect(engine.sellPrice).toBe(2410400);
    expect(engine.buyShipping).toBe(3000);
  });

  it('分转元保留两位小数', () => {
    const display = centsToYuan({ buyPrice: 2200000, buyShipping: 4635 });

    expect(display.buyPrice).toBe(22000);
    expect(display.buyShipping).toBe(46.35);
  });

  it('换算不改变非金额字段', () => {
    const engine = yuanToCents({ platformFeeRate: 0.01, returnProbability: 0.1, holdDays: 30 });

    expect(engine.platformFeeRate).toBe(0.01);
    expect(engine.returnProbability).toBe(0.1);
    expect(engine.holdDays).toBe(30);
  });

  it('往返换算不丢金额', () => {
    const roundTrip = centsToYuan(yuanToCents({ buyPrice: 19999, sellPrice: 20450 }));

    expect(roundTrip.buyPrice).toBe(19999);
    expect(roundTrip.sellPrice).toBe(20450);
  });
});
