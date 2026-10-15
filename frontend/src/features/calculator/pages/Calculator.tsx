import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Calculator as CalculatorIcon,
  CheckCircle,
  RotateCcw,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  calculateProfit,
  yuanToCents,
  type CalculatorInput,
  type CalculatorOutput,
} from '@/shared/utils/calculator';
import { formatPrice } from '@/shared/utils/format';
import { cnx } from '@/shared/utils/cnx';

interface FieldSpec {
  key: keyof CalculatorInput;
  label: string;
  unit: string;
  step: number;
  required?: boolean;
}

const REQUIRED_KEYS: Array<keyof CalculatorInput> = ['buyPrice', 'sellPrice'];

const FIELDS: FieldSpec[] = [
  { key: 'buyPrice', label: '预计买入价', unit: '元', step: 1, required: true },
  { key: 'sellPrice', label: '预计转售价', unit: '元', step: 1, required: true },
  { key: 'buyShipping', label: '买入运费', unit: '元', step: 1 },
  { key: 'sellShipping', label: '卖出运费', unit: '元', step: 1 },
  { key: 'platformFeeRate', label: '平台手续费率', unit: '0.01 = 1%', step: 0.001 },
  { key: 'inspectionFee', label: '验货 / 检测费', unit: '元', step: 1 },
  { key: 'repairFee', label: '维修费用', unit: '元', step: 1 },
  { key: 'accessoriesFee', label: '清洁 / 配件 / 包装', unit: '元', step: 1 },
  { key: 'otherFees', label: '其他成本', unit: '元', step: 1 },
  { key: 'negotiationBuffer', label: '预计议价空间', unit: '元', step: 1 },
  { key: 'returnLossBuffer', label: '退货损失准备金', unit: '元', step: 1 },
  { key: 'returnProbability', label: '退货概率', unit: '0.1 = 10%', step: 0.01 },
  { key: 'holdDays', label: '预计持有天数', unit: '天', step: 1 },
];

const DEFAULTS: CalculatorInput = {
  buyPrice: 0,
  sellPrice: 0,
  buyShipping: 30,
  sellShipping: 30,
  platformFeeRate: 0.01,
  inspectionFee: 20,
  repairFee: 0,
  accessoriesFee: 10,
  otherFees: 5,
  negotiationBuffer: 50,
  returnLossBuffer: 50,
  returnProbability: 0.1,
  holdDays: 30,
};

/** URL 参数允许从其他页面带着具体数字跳进来。 */
function readFromParams(params: URLSearchParams): Partial<CalculatorInput> {
  const patch: Partial<CalculatorInput> = {};
  for (const field of FIELDS) {
    const raw = params.get(field.key);
    if (raw === null || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isNaN(value)) patch[field.key] = value;
  }
  return patch;
}

export function CalculatorPage() {
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState<CalculatorInput>(() => ({
    ...DEFAULTS,
    ...readFromParams(searchParams),
  }));

  const result: CalculatorOutput = useMemo(
    () => calculateProfit(yuanToCents(input)),
    [input]
  );

  const filledCount = FIELDS.filter(
    (field) => input[field.key] !== undefined && input[field.key] !== null
  ).length;
  const completeness = Math.round((filledCount / FIELDS.length) * 100);

  const handleChange = (key: keyof CalculatorInput, raw: string) => {
    setInput((prev) => ({ ...prev, [key]: raw === '' ? undefined : Number(raw) }));
  };

  const missingRequired = REQUIRED_KEYS.filter(
    (key) => input[key] === undefined || input[key] === null || Number.isNaN(input[key])
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
            <CalculatorIcon className="h-6 w-6 text-brand-800" />
            利润计算器
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            全成本核算 + 三情景对比。金额按「分」计算后换算为元，避免浮点误差。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInput(DEFAULTS)}
          className="btn btn-secondary"
        >
          <RotateCcw className="h-4 w-4" />
          重置为默认值
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="panel p-4 lg:sticky lg:top-[120px]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">成本与价格设置</h2>
              <span className="text-xs text-gray-500">已填 {completeness}%</span>
            </div>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full bg-brand-400 transition-all"
                style={{ width: `${completeness}%` }}
              />
            </div>

            <div className="space-y-3">
              {FIELDS.map((field) => {
                const isMissing =
                  field.required &&
                  (input[field.key] === undefined || input[field.key] === null);
                return (
                  <div key={field.key}>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      {field.label}
                      {field.required && <span className="ml-0.5 text-red-600">*</span>}
                      <span className="ml-1 text-xs font-normal text-gray-400">
                        （{field.unit}）
                      </span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={field.step}
                      value={input[field.key] ?? ''}
                      onChange={(event) => handleChange(field.key, event.target.value)}
                      placeholder={field.required ? '必填' : '留空按 0 计入并提示'}
                      className={cnx(
                        'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2',
                        isMissing
                          ? 'border-red-300 bg-red-50 focus:ring-red-400'
                          : 'border-gray-300 bg-white focus:ring-brand-400'
                      )}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-5 lg:col-span-2">
          {missingRequired.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="flex items-center gap-2 font-medium text-red-800">
                <XCircle className="h-5 w-5" />
                必填项缺失，已停止计算
              </p>
              <p className="mt-1 text-sm text-red-700">
                请填写：
                {missingRequired
                  .map((key) => FIELDS.find((field) => field.key === key)?.label ?? key)
                  .join('、')}
                。缺失关键成本时不会用 0 代替，避免给出虚高利润。
              </p>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="rounded-xl border border-warn-200 bg-warn-50 p-4">
              <p className="flex items-center gap-2 font-medium text-warn-800">
                <AlertTriangle className="h-5 w-5" />
                估算假设提示（{result.warnings.length} 条）
              </p>
              <ul className="mt-2 space-y-1 text-sm text-warn-800">
                {result.warnings.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(['conservative', 'baseline', 'optimistic'] as const).map((key) => {
              const scenario = result.scenarios[key];
              const palette = {
                conservative: {
                  wrap: 'border-warn-200 bg-warn-50',
                  title: 'text-warn-800',
                  icon: <AlertTriangle className="h-4 w-4" />,
                },
                baseline: {
                  wrap: 'border-brand-200 bg-brand-50',
                  title: 'text-ink-900',
                  icon: <TrendingUp className="h-4 w-4" />,
                },
                optimistic: {
                  wrap: 'border-green-200 bg-green-50',
                  title: 'text-green-800',
                  icon: <CheckCircle className="h-4 w-4" />,
                },
              }[key];

              return (
                <div key={key} className={cnx('rounded-xl border p-4', palette.wrap)}>
                  <h3 className={cnx('mb-3 flex items-center gap-2 font-semibold', palette.title)}>
                    {palette.icon}
                    {scenario.name}
                  </h3>
                  <dl className="space-y-1.5 text-sm">
                    <Row label="买入价" value={formatPrice(scenario.buyPrice)} />
                    <Row label="卖出价" value={formatPrice(scenario.sellPrice)} />
                    <Row label="总买入成本" value={formatPrice(scenario.totalBuyCost)} />
                    <Row label="总交易成本" value={formatPrice(scenario.totalSellCost)} />
                    <Row label="净收入" value={formatPrice(scenario.netRevenue)} />
                    <Row
                      label="净利润"
                      value={formatPrice(scenario.netProfit)}
                      tone={scenario.netProfit >= 0 ? 'green' : 'red'}
                      strong
                    />
                    <Row label="利润率" value={`${scenario.profitMargin.toFixed(2)}%`} />
                    <Row label="ROI" value={`${scenario.roi.toFixed(2)}%`} />
                    <Row
                      label="净利率（占销售额）"
                      value={`${scenario.netProfitMargin.toFixed(2)}%`}
                    />
                    <Row label="资金占用" value={formatPrice(scenario.capitalOccupied)} />
                    <Row
                      label="风险调整收益"
                      value={formatPrice(scenario.riskAdjustedReturn)}
                    />
                    <Row label="年化 ROI" value={`${scenario.annualizedRoi.toFixed(2)}%`} />
                  </dl>
                </div>
              );
            })}
          </div>

          <div className="panel p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">计算公式（口径明示）</h3>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs leading-relaxed text-gray-600 md:grid-cols-2">
              <p>总买入成本 = 买入价 + 买入运费</p>
              <p>总交易成本 = 卖出运费 + 平台手续费 + 验货费 + 维修费 + 配件费 + 其他成本 + 议价空间</p>
              <p>净收入 = 卖出价 − 总交易成本</p>
              <p>净利润 = 净收入 − 总买入成本</p>
              <p>利润率 = 净利润 ÷ 总投入成本 × 100%</p>
              <p>ROI = 净利润 ÷ 总投入成本 × 100%</p>
              <p>净利率（占销售额）= 净利润 ÷ 卖出价 × 100%</p>
              <p>资金占用 = 总买入成本</p>
              <p>平台手续费 = 卖出价 × 平台手续费率</p>
              <p>预期退货损失 = 退货概率 × (退货准备金 + 总买入成本 × 50%)</p>
              <p>风险调整收益 = 净利润 − 预期退货损失</p>
              <p>年化 ROI = 风险调整收益 ÷ 总投入成本 × (365 ÷ 持有天数) × 100%</p>
            </div>
            <div className="mt-3 space-y-1 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
              <p className="font-medium text-gray-800">为什么利润率与 ROI 数字相同？</p>
              <p>
                本项目按需求把两者定义为同一口径（净利润 ÷ 总投入成本）。为避免混淆，界面同时给出
                「净利率（占销售额）」作为第三个指标，并在此处显式说明定义。
              </p>
              <p className="pt-1 font-medium text-gray-800">三情景假设</p>
              <p>保守：售价 ×0.9、成本 ×1.2 ｜ 基准：售价 ×1.0、成本 ×1.0 ｜ 乐观：售价 ×1.1、成本 ×0.8</p>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            想看具体商品的完整分析？
            <Link to="/search" className="ml-1 text-brand-800 hover:underline">
              从商品搜索进入详情页
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: 'green' | 'red';
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd
        className={cnx(
          strong ? 'font-bold' : 'font-medium',
          tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : 'text-gray-900'
        )}
      >
        {value}
      </dd>
    </div>
  );
}
