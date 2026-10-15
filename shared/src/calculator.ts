export interface CalculatorInput {
  buyPrice: number;
  sellPrice: number;
  buyShipping?: number;
  sellShipping?: number;
  platformFeeRate?: number;
  inspectionFee?: number;
  repairFee?: number;
  accessoriesFee?: number;
  otherFees?: number;
  negotiationBuffer?: number;
  returnLossBuffer?: number;
  returnProbability?: number;
  holdDays?: number;
}

export interface ScenarioResult {
  name: string;
  buyPrice: number;
  sellPrice: number;
  totalBuyCost: number;
  totalSellCost: number;
  netRevenue: number;
  netProfit: number;
  profitMargin: number;
  roi: number;
  netProfitMargin: number;
  capitalOccupied: number;
  riskAdjustedReturn: number;
  annualizedRoi: number;
}

export interface CalculatorOutput {
  scenarios: {
    conservative: ScenarioResult;
    baseline: ScenarioResult;
    optimistic: ScenarioResult;
  };
  costCompleteness: number;
  missingFields: string[];
  warnings: string[];
}

/**
 * 以「元」为单位输入的字段。计算引擎内部一律使用「分」，
 * 界面展示与录入使用「元」，两者之间必须显式转换，避免把 22000 元当成 22000 分。
 */
export const MONEY_FIELDS: (keyof CalculatorInput)[] = [
  "buyPrice",
  "sellPrice",
  "buyShipping",
  "sellShipping",
  "inspectionFee",
  "repairFee",
  "accessoriesFee",
  "otherFees",
  "negotiationBuffer",
  "returnLossBuffer",
];

function convertMoneyFields(
  input: Partial<CalculatorInput>,
  convert: (value: number) => number
): CalculatorInput {
  const next: Partial<CalculatorInput> = { ...input };
  for (const field of MONEY_FIELDS) {
    const value = next[field];
    if (typeof value === "number") {
      next[field] = convert(value);
    }
  }
  return next as CalculatorInput;
}

/** 元 → 分，用于把用户输入交给计算引擎。 */
export function yuanToCents(input: Partial<CalculatorInput>): CalculatorInput {
  return convertMoneyFields(input, (value) => Math.round(value * 100));
}

/** 分 → 元，用于把引擎数值回填到界面。 */
export function centsToYuan(input: Partial<CalculatorInput>): CalculatorInput {
  // 保留两位小数，避免 46.35 元被抹成 46 元后回填失真。
  return convertMoneyFields(input, (value) => Math.round(value) / 100);
}

const REQUIRED_FIELDS: (keyof CalculatorInput)[] = ["buyPrice", "sellPrice"];
const OPTIONAL_FIELDS: (keyof CalculatorInput)[] = [
  "buyShipping",
  "sellShipping",
  "platformFeeRate",
  "inspectionFee",
  "repairFee",
  "accessoriesFee",
  "otherFees",
  "negotiationBuffer",
  "returnLossBuffer",
  "returnProbability",
  "holdDays",
];

/**
 * 接受部分填写的输入：用户可以先只填几个字段。
 * 必填项缺失时返回带 missingFields 的空结果，绝不用 0 顶替后继续算出一个漂亮数字。
 */
export function calculateProfit(input: Partial<CalculatorInput>): CalculatorOutput {
  const warnings: string[] = [];
  const missingFields: string[] = [];

  REQUIRED_FIELDS.forEach((field) => {
    if (input[field] === undefined || input[field] === null) {
      missingFields.push(field);
    }
  });

  OPTIONAL_FIELDS.forEach((field) => {
    if (input[field] === undefined || input[field] === null) {
      warnings.push(`可选成本项 "${field}" 未填写，将按 0 计算，可能导致利润估算偏高`);
    }
  });

  if (missingFields.length > 0) {
    return {
      scenarios: {
        conservative: createEmptyScenario("保守情景"),
        baseline: createEmptyScenario("基准情景"),
        optimistic: createEmptyScenario("乐观情景"),
      },
      costCompleteness: 0,
      missingFields,
      warnings: [...warnings, `必填项缺失：${missingFields.join("、")}，无法计算`],
    };
  }

  const complete = input as CalculatorInput;
  const baseline = computeScenario(complete, "baseline");
  const conservative = computeScenario(complete, "conservative");
  const optimistic = computeScenario(complete, "optimistic");

  const filledFields = REQUIRED_FIELDS.filter((f) => input[f] !== undefined && input[f] !== null).length +
    OPTIONAL_FIELDS.filter((f) => input[f] !== undefined && input[f] !== null).length;
  const costCompleteness = filledFields / (REQUIRED_FIELDS.length + OPTIONAL_FIELDS.length);

  return {
    scenarios: { conservative, baseline, optimistic },
    costCompleteness,
    missingFields,
    warnings,
  };
}

function computeScenario(input: CalculatorInput, type: "conservative" | "baseline" | "optimistic"): ScenarioResult {
  const adj = getScenarioAdjustments(type);

  const buyPrice = input.buyPrice;
  const sellPrice = Math.round(input.sellPrice * adj.sellPriceMultiplier);

  const buyShipping = (input.buyShipping || 0) * adj.costMultiplier;
  const sellShipping = (input.sellShipping || 0) * adj.costMultiplier;
  const platformFee = Math.round(sellPrice * (input.platformFeeRate || 0.01));
  const inspectionFee = (input.inspectionFee || 0) * adj.costMultiplier;
  const repairFee = (input.repairFee || 0) * adj.costMultiplier;
  const accessoriesFee = (input.accessoriesFee || 0) * adj.costMultiplier;
  const otherFees = (input.otherFees || 0) * adj.costMultiplier;
  const negotiationBuffer = (input.negotiationBuffer || 0) * adj.costMultiplier;

  const totalBuyCost = buyPrice + buyShipping;
  const totalSellCost = sellShipping + platformFee + inspectionFee + repairFee + accessoriesFee + otherFees + negotiationBuffer;

  const netRevenue = sellPrice - totalSellCost;
  const netProfit = netRevenue - totalBuyCost;
  const totalInvestment = totalBuyCost + totalSellCost;

  const profitMargin = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;
  const roi = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;
  const netProfitMargin = sellPrice > 0 ? (netProfit / sellPrice) * 100 : 0;
  const capitalOccupied = totalBuyCost;

  const returnProbability = input.returnProbability || 0.1;
  const returnLossBuffer = input.returnLossBuffer || 0;
  const expectedReturnLoss = returnProbability * (returnLossBuffer + totalBuyCost * 0.5);
  const riskAdjustedReturn = netProfit - expectedReturnLoss;

  const holdDays = input.holdDays || 30;
  const annualizedRoi = totalInvestment > 0 ? (riskAdjustedReturn / totalInvestment) * (365 / holdDays) * 100 : 0;

  return {
    name: type === "conservative" ? "保守情景" : type === "baseline" ? "基准情景" : "乐观情景",
    buyPrice,
    sellPrice,
    totalBuyCost: Math.round(totalBuyCost),
    totalSellCost: Math.round(totalSellCost),
    netRevenue: Math.round(netRevenue),
    netProfit: Math.round(netProfit),
    profitMargin: Math.round(profitMargin * 100) / 100,
    roi: Math.round(roi * 100) / 100,
    netProfitMargin: Math.round(netProfitMargin * 100) / 100,
    capitalOccupied: Math.round(capitalOccupied),
    riskAdjustedReturn: Math.round(riskAdjustedReturn),
    annualizedRoi: Math.round(annualizedRoi * 100) / 100,
  };
}

function getScenarioAdjustments(type: "conservative" | "baseline" | "optimistic") {
  switch (type) {
    case "conservative":
      return { sellPriceMultiplier: 0.9, costMultiplier: 1.2 };
    case "baseline":
      return { sellPriceMultiplier: 1.0, costMultiplier: 1.0 };
    case "optimistic":
      return { sellPriceMultiplier: 1.1, costMultiplier: 0.8 };
  }
}

function createEmptyScenario(name: string): ScenarioResult {
  return {
    name,
    buyPrice: 0,
    sellPrice: 0,
    totalBuyCost: 0,
    totalSellCost: 0,
    netRevenue: 0,
    netProfit: 0,
    profitMargin: 0,
    roi: 0,
    netProfitMargin: 0,
    capitalOccupied: 0,
    riskAdjustedReturn: 0,
    annualizedRoi: 0,
  };
}

export function formatCalculatorOutput(output: CalculatorOutput): string {
  const { scenarios, costCompleteness, missingFields, warnings } = output;
  let result = `成本完整度：${Math.round(costCompleteness * 100)}%\n\n`;

  if (missingFields.length > 0) {
    result += `⚠️ 必填项缺失：${missingFields.join("、")}\n`;
  }

  Object.values(scenarios).forEach((s) => {
    result += `=== ${s.name} ===\n`;
    result += `买入价：${(s.buyPrice / 100).toFixed(2)} 元\n`;
    result += `卖出价：${(s.sellPrice / 100).toFixed(2)} 元\n`;
    result += `总买入成本：${(s.totalBuyCost / 100).toFixed(2)} 元\n`;
    result += `总卖出成本：${(s.totalSellCost / 100).toFixed(2)} 元\n`;
    result += `净收入：${(s.netRevenue / 100).toFixed(2)} 元\n`;
    result += `净利润：${(s.netProfit / 100).toFixed(2)} 元\n`;
    result += `利润率：${s.profitMargin.toFixed(2)}%\n`;
    result += `ROI：${s.roi.toFixed(2)}%\n`;
    result += `净利润率(占销售额)：${s.netProfitMargin.toFixed(2)}%\n`;
    result += `资金占用：${(s.capitalOccupied / 100).toFixed(2)} 元\n`;
    result += `风险调整收益：${(s.riskAdjustedReturn / 100).toFixed(2)} 元\n`;
    result += `年化ROI：${s.annualizedRoi.toFixed(2)}%\n\n`;
  });

  if (warnings.length > 0) {
    result += `⚠️ 提示：\n${warnings.map((w) => `  - ${w}`).join("\n")}`;
  }

  return result;
}
