import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Filter,
  Info,
  PackageSearch,
  TrendingUp,
} from 'lucide-react';
import {
  recommendationBadgeClass,
  recommendationLabels,
  type OpportunityScore,
  type Recommendation,
} from '@/shared/utils/opportunity';
import { useOpportunities } from '@/shared/hooks/queries';
import { BackendNotice } from '@/shared/components/BackendNotice';
import { CATEGORY_GROUPS } from '@/shared/constants';
import { formatPrice } from '@/shared/utils/format';
import { getRiskLevelLabel, riskLevelBadgeClass, type RiskLevel } from '@/shared/utils/risk';
import { cnx } from '@/shared/utils/cnx';

const CONDITION_LABELS: Record<string, string> = {
  new: '全新未拆',
  '99new': '99 新',
  '95new': '95 新',
  '90new': '90 新',
  good: '良好',
  fair: '一般',
};

type SortKey = keyof Pick<
  OpportunityScore,
  | 'composite_score'
  | 'net_profit'
  | 'roi'
  | 'price_gap'
  | 'risk_score'
  | 'data_confidence'
  | 'liquidity_score'
  | 'capital_occupied'
>;

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'composite_score', label: '综合评分' },
  { key: 'net_profit', label: '预计净利润' },
  { key: 'roi', label: 'ROI' },
  { key: 'price_gap', label: '买卖价差' },
  { key: 'risk_score', label: '风险评分' },
  { key: 'data_confidence', label: '数据可信度' },
  { key: 'liquidity_score', label: '流动性' },
  { key: 'capital_occupied', label: '资金占用' },
];

const RISK_OPTIONS: Array<{ value: RiskLevel; label: string }> = [
  { value: 'insufficient', label: '不限风险等级' },
  { value: 'high', label: '高风险及以下' },
  { value: 'medium', label: '中风险及以下' },
  { value: 'low', label: '仅低风险' },
];

export function OpportunitiesPage() {
  const [keyword, setKeyword] = useState('');
  const [minNetProfitYuan, setMinNetProfitYuan] = useState('');
  const [minRoi, setMinRoi] = useState('');
  const [maxRiskLevel, setMaxRiskLevel] = useState<RiskLevel>('insufficient');
  const [minConfidence, setMinConfidence] = useState('');
  const [recommendation, setRecommendation] = useState<Recommendation | ''>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('composite_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 筛选交给后端（作用于完整数据集），排序在返回的完整结果上做。
  const params = useMemo(
    () => ({
      keyword: keyword.trim() || undefined,
      minNetProfit: minNetProfitYuan ? Math.round(Number(minNetProfitYuan) * 100) : undefined,
      minRoi: minRoi ? Number(minRoi) : undefined,
      maxRiskLevel: maxRiskLevel === 'insufficient' ? undefined : maxRiskLevel,
      minDataConfidence: minConfidence ? Number(minConfidence) : undefined,
      recommendation: recommendation || undefined,
      categories: categories.length ? categories.join(',') : undefined,
      limit: 200,
    }),
    [keyword, minNetProfitYuan, minRoi, maxRiskLevel, minConfidence, recommendation, categories]
  );

  const { data, isPending, isError, error, refetch } = useOpportunities(params);
  const allOpportunities = data?.items ?? [];

  const rows = useMemo(
    () =>
      [...allOpportunities].sort((a, b) => {
      const delta = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? delta : -delta;
      }),
    [allOpportunities, sortKey, sortAsc]
  );

  const counts = {
    watch: rows.filter((row) => row.recommendation === 'watch').length,
    caution: rows.filter((row) => row.recommendation === 'caution').length,
    avoid: rows.filter((row) => row.recommendation === 'avoid').length,
  };

  const offline = isError && (error as { status?: number })?.status === 0;

  const resetFilters = () => {
    setKeyword('');
    setMinNetProfitYuan('');
    setMinRoi('');
    setMaxRiskLevel('insufficient');
    setMinConfidence('');
    setRecommendation('');
    setCategories([]);
  };

  return (
    <div className="space-y-5">
      {offline && <BackendNotice onRetry={() => void refetch()} />}

      {!isError && !isPending && (
        <div className="rounded-lg border border-warn-200 bg-warn-50 px-4 py-2 text-xs text-warn-900">
          本页所有价格、卖家与验货记录均为<strong className="mx-1">模拟测试数据</strong>
          ，未接入任何真实平台行情；结论只反映当前假设下的估算。
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
            <TrendingUp className="h-6 w-6 text-brand-700" />
            套利机会排行榜
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            按净利润、ROI、价差、风险、数据可信度、流动性与资金占用多维加权评分，不按单一价差排序。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((open) => !open)}
          className="btn btn-secondary"
          aria-expanded={showFilters}
        >
          <Filter className="h-4 w-4" />
          筛选条件
        </button>
      </div>

      {showFilters && (
        <div className="panel p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">商品关键词</label>
              <input
                type="text"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="商品名称或品牌"
                className="field"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                最小净利润（元）
              </label>
              <input
                type="number"
                value={minNetProfitYuan}
                onChange={(event) => setMinNetProfitYuan(event.target.value)}
                placeholder="例如 1000"
                className="field"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">最小 ROI（%）</label>
              <input
                type="number"
                value={minRoi}
                onChange={(event) => setMinRoi(event.target.value)}
                placeholder="例如 15"
                className="field"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">最大风险等级</label>
              <select
                value={maxRiskLevel}
                onChange={(event) => setMaxRiskLevel(event.target.value as RiskLevel)}
                className="field"
              >
                {RISK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                最小数据可信度（%）
              </label>
              <input
                type="number"
                value={minConfidence}
                onChange={(event) => setMinConfidence(event.target.value)}
                placeholder="例如 60"
                className="field"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">推荐等级</label>
              <select
                value={recommendation}
                onChange={(event) => setRecommendation(event.target.value as Recommendation | '')}
                className="field"
              >
                <option value="">全部等级</option>
                <option value="watch">值得关注</option>
                <option value="caution">谨慎购买</option>
                <option value="avoid">暂不推荐</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700">品类</span>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_GROUPS.map((category) => {
                  const checked = categories.includes(category.name);
                  return (
                    <label
                      key={category.id}
                      className={cnx(
                        'cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors',
                        checked
                          ? 'border-brand-300 bg-brand-50 text-brand-800'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={(event) =>
                          setCategories((prev) =>
                            event.target.checked
                              ? [...prev, category.name]
                              : prev.filter((name) => name !== category.name)
                          )
                        }
                      />
                      {category.name}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="btn btn-secondary mt-4"
          >
            清空筛选条件
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 panel px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
          <span>
            共 <strong className="text-gray-900">{rows.length}</strong> 个机会
          </span>
          <span className="flex items-center gap-1.5 text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
            值得关注 {counts.watch}
          </span>
          <span className="flex items-center gap-1.5 text-warn-700">
            <span className="h-1.5 w-1.5 rounded-full bg-warn-500" aria-hidden="true" />
            谨慎购买 {counts.caution}
          </span>
          <span className="flex items-center gap-1.5 text-red-700">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
            暂不推荐 {counts.avoid}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="field w-auto"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                按{option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortAsc((asc) => !asc)}
            className="btn btn-secondary items-center gap-1"
            title={sortAsc ? '当前升序，点击改为降序' : '当前降序，点击改为升序'}
          >
            {sortAsc ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            {sortAsc ? '升序' : '降序'}
          </button>
        </div>
      </div>

      {isPending ? (
        <div className="panel empty-state">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="text-gray-500">正在计算机会评分…</p>
        </div>
      ) : isError && !offline ? (
        <div className="rounded-xl border border-red-200 bg-red-50 py-12 text-center">
          <p className="text-red-700">
            加载失败：{(error as Error)?.message ?? '未知错误'}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 btn btn-primary"
          >
            重试
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="panel empty-state">
          <PackageSearch className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-gray-600">没有符合条件的商品</p>
          <p className="mt-1 text-sm text-gray-400">试着放宽净利润、ROI 或风险等级条件</p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1140px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2.5 text-left">排名</th>
                  <th className="px-3 py-2.5 text-left">商品</th>
                  <th className="px-3 py-2.5 text-right">要价</th>
                  <th className="px-3 py-2.5 text-right">净利润</th>
                  <th className="px-3 py-2.5 text-right">ROI</th>
                  <th className="px-3 py-2.5 text-right">价差</th>
                  <th className="px-3 py-2.5 text-left">风险</th>
                  <th className="px-3 py-2.5 text-right">可信度</th>
                  <th className="px-3 py-2.5 text-right">流动性</th>
                  <th className="px-3 py-2.5 text-right">资金占用</th>
                  <th className="px-3 py-2.5 text-left">结论</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const expanded = expandedId === row.product_id;
                  return (
                    <Fragment key={row.product_id}>
                      <tr
                        className="table-row cursor-pointer"
                        onClick={() => setExpandedId(expanded ? null : row.product_id)}
                      >
                        <td className="px-3 py-3">
                          <span className="badge badge-brand whitespace-nowrap">
                            #{index + 1}
                          </span>
                          <p className="mt-1 text-2xs tabular-nums text-gray-500">
                            {row.composite_score} 分
                          </p>
                        </td>
                        <td className="max-w-[320px] px-3 py-3">
                          <Link
                            to={`/product/${row.product_id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="line-clamp-2 font-medium text-gray-900 hover:text-brand-800"
                            title={row.product_name}
                          >
                            {row.product_name}
                          </Link>
                          <p className="mt-0.5 truncate text-2xs text-gray-500">
                            {row.category} · {row.brand} ·{' '}
                            {CONDITION_LABELS[row.condition] ?? row.condition}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-900">
                          {formatPrice(row.buy_price)}
                        </td>
                        <td
                          className={cnx(
                            'whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums',
                            row.net_profit === null
                              ? 'text-gray-500'
                              : row.net_profit >= 0
                                ? 'text-green-700'
                                : 'text-red-700'
                          )}
                        >
                          {row.net_profit === null ? '未设置行情价' : formatPrice(row.net_profit)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-ink-900">
                          {row.roi === null ? '—' : `${row.roi.toFixed(1)}%`}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-900">
                          {row.price_gap === null ? '—' : formatPrice(row.price_gap)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={cnx(
                              'badge whitespace-nowrap',
                              riskLevelBadgeClass[row.risk_level]
                            )}
                          >
                            {getRiskLevelLabel(row.risk_level)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-600">
                          {row.data_confidence}%
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-600">
                          {row.liquidity_score}%
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-600">
                          {formatPrice(row.capital_occupied)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={cnx(
                              'badge whitespace-nowrap',
                              recommendationBadgeClass[row.recommendation]
                            )}
                          >
                            {recommendationLabels[row.recommendation]}
                          </span>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={11} className="px-4 py-3">
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-700">
                              <Info className="h-3.5 w-3.5" />
                              结论依据
                            </p>
                            <ul className="space-y-1 text-xs leading-relaxed text-gray-600">
                              {row.recommendation_reason.map((reason, reasonIndex) => (
                                <li key={reasonIndex}>• {reason}</li>
                              ))}
                              <li>
                                • 预估持有周期约 {row.expected_hold_days} 天，成本假设采用演示默认值（含运费、
                                平台费率、验货费、议价空间与退货准备金）
                              </li>
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">评分模型</h3>
        <div className="grid grid-cols-1 gap-2 text-xs text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.entries({
            净利润: 20,
            ROI: 20,
            买卖价差: 15,
            风险水平: 15,
            数据可信度: 10,
            流动性: 10,
            年化资金周转: 10,
          }) as Array<[string, number]>).map(([label, weight]) => (
            <div key={label} className="rounded-lg border border-gray-200 p-3">
              <p className="font-medium text-gray-900">
                {label} 权重 {weight}%
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-600">
          推荐结论按以下规则给出：净利润为负、或净利润低于 300 元且 ROI 低于 8% 直接判为
          「暂不推荐」；证据不足（风险无法评估）或存在明确高风险项时，即使价差很高也只给
          「谨慎购买」；只有同时满足净利润 ≥ 800 元、单周期 ROI ≥ 8%、风险为低或中且无高风险项、
          价格数据可信度 ≥ 60%、成本填写完整、品类流动性达标，才会进入「值得关注」。
        </p>
      </div>
    </div>
  );
}
