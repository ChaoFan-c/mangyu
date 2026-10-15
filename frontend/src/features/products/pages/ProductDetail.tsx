import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator as CalculatorIcon,
  CheckCircle,
  Clock,
  DollarSign,
  ExternalLink,
  Eye,
  Heart,
  HelpCircle,
  MapPin,
  Save,
  Shield,
  Trash2,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type { MockPriceRecord, RiskAssessmentOutput } from '@daoye/shared';
import {
  calculateProfit,
  centsToYuan,
  yuanToCents,
  type CalculatorInput,
  type CalculatorOutput,
} from '@/shared/utils/calculator';
import {
  formatDate,
  formatDateTime,
  formatPrice,
  getPriceTypeBadgeClass,
  getPriceTypeLabel,
  type PriceType,
} from '@/shared/utils/format';
import {
  getEvidenceStatusColor,
  getEvidenceStatusLabel,
  getRiskLevelColor,
  getRiskLevelLabel,
  riskLevelBadgeClass,
} from '@/shared/utils/risk';
import { DEMO_COST_ASSUMPTIONS } from '@/shared/utils/opportunity';
import { priceTimelineRatio, summarizePriceTimeline } from '@/shared/utils/priceTimeline';
import { cnx } from '@/shared/utils/cnx';
import {
  useCreateFavorite,
  useDeleteFavorite,
  useFavorites,
  useAnalyses,
  useDeleteAnalysis,
  usePriceRecords,
  useProduct,
  useRiskAssessment,
  useSaveAnalysis,
} from '@/shared/hooks/queries';
import { BackendNotice } from '@/shared/components/BackendNotice';

type TabKey = 'overview' | 'prices' | 'risk' | 'calculator';

const CONDITION_LABELS: Record<string, string> = {
  new: '全新未拆',
  '99new': '99 新',
  '95new': '95 新',
  '90new': '90 新',
  good: '良好',
  fair: '一般',
  parts: '仅备件',
};

const TAB_LABELS: Record<TabKey, { label: string; icon: typeof Eye }> = {
  overview: { label: '商品概览', icon: Eye },
  prices: { label: '价格对比', icon: DollarSign },
  risk: { label: '风险评估', icon: Shield },
  calculator: { label: '利润计算', icon: CalculatorIcon },
};

export function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const productId = Number(id);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const productQuery = useProduct(productId);
  const priceQuery = usePriceRecords(productId);
  const riskQuery = useRiskAssessment(productId);
  const favoritesQuery = useFavorites();
  const createFavorite = useCreateFavorite();
  const deleteFavorite = useDeleteFavorite();

  const product = productQuery.data?.product;
  const priceRecords = useMemo(() => priceQuery.data?.items ?? [], [priceQuery.data]);
  // 风险结论由服务端给出，界面不再自行推断。
  const risk = riskQuery.data?.assessment ?? null;
  const existingFavorite = favoritesQuery.data?.items.find(
    (item) => item.productId === productId
  );
  const favorited = Boolean(existingFavorite);

  const offline =
    (productQuery.error as { status?: number } | null)?.status === 0 ||
    (priceQuery.error as { status?: number } | null)?.status === 0;

  if (productQuery.isPending) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        <p className="text-gray-500">正在加载商品数据…</p>
      </div>
    );
  }

  if (offline) {
    return (
      <div className="space-y-4">
        <BackendNotice
          onRetry={() => {
            void productQuery.refetch();
            void priceQuery.refetch();
          }}
        />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-warn-400" />
        <p className="text-lg font-medium text-gray-900">未找到该商品</p>
        <p className="mt-1 text-sm text-gray-500">商品 ID：{id}</p>
        <Link
          to="/search"
          className="mt-6 inline-block btn btn-primary"
        >
          返回搜索
        </Link>
      </div>
    );
  }

  const allPrices = priceRecords.map((r) => r.price);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);

  // 预计转卖价只能来自用户填写的行情价；没填就不猜，也不拿挂牌价冒充。
  const marketPrice = productQuery.data?.marketPrice ?? null;
  const hasMarketPrice = typeof marketPrice === 'number' && marketPrice > 0;
  const assumedSellPrice = hasMarketPrice ? (marketPrice as number) : 0;
  const calcInput: CalculatorInput = {
    buyPrice: product.price,
    sellPrice: assumedSellPrice,
    ...DEMO_COST_ASSUMPTIONS,
  };
  const calcResult = calculateProfit(calcInput);
  const baseline = calcResult.scenarios.baseline;

  const handleFavorite = () => {
    if (existingFavorite) {
      deleteFavorite.mutate(existingFavorite.id);
      return;
    }
    createFavorite.mutate({
      productId: product.id,
      productName: product.name,
      category: product.category,
      brand: product.brand,
      condition: product.condition,
      targetBuyPrice: product.price,
      targetSellPrice: assumedSellPrice,
      notes: '',
      status: 'watching',
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-1 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
          aria-label="返回上一页"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <nav className="mb-1 flex flex-wrap items-center gap-1 text-sm text-gray-500">
            <Link to="/" className="hover:text-gray-700">
              首页
            </Link>
            <span>/</span>
            <Link to="/search" className="hover:text-gray-700">
              商品搜索
            </Link>
            <span>/</span>
            <span className="text-gray-900">{product.name}</span>
          </nav>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">{product.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span className="rounded-md bg-gray-100 px-2 py-0.5">{product.category}</span>
            <span className="rounded-md bg-gray-100 px-2 py-0.5">{product.brand}</span>
            <span className="rounded-md bg-gray-100 px-2 py-0.5">
              {CONDITION_LABELS[product.condition] ?? product.condition}
            </span>
            <span className="badge bg-warn-50 text-warn-700 ring-warn-200">模拟测试数据</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleFavorite}
          className={cnx('btn flex-shrink-0', favorited ? 'btn-quiet-danger' : 'btn-secondary')}
          aria-pressed={favorited}
        >
          <Heart className={cnx('h-4 w-4', favorited && 'fill-current')} />
          <span className="hidden sm:inline">{favorited ? '已收藏' : '收藏'}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="当前要价（模拟挂牌）"
          value={formatPrice(product.price)}
          hint="卖家要价，不等于成交价"
          tone="amber"
        />
        <MetricCard
          label="行情价（用户填写）"
          value={hasMarketPrice ? formatPrice(marketPrice) : '未设置行情价'}
          hint={
            hasMarketPrice
              ? '你在「本机采集」页手动填写的参考市场价'
              : '未设置时不给出预计利润'
          }
          tone="blue"
        />
        <MetricCard
          label="基准情景净利润"
          value={hasMarketPrice ? formatPrice(baseline.netProfit) : '未设置行情价'}
          hint={
            hasMarketPrice
              ? `ROI ${baseline.roi.toFixed(1)}% · 净利率 ${baseline.netProfitMargin.toFixed(1)}%`
              : '请先在「本机采集」页填写行情价'
          }
          tone={hasMarketPrice ? (baseline.netProfit >= 0 ? 'green' : 'red') : 'blue'}
        />
        <MetricCard
          label="风险等级"
          value={getRiskLevelLabel(risk?.risk_level ?? 'insufficient')}
          hint={`评分 ${risk?.score ?? 0}/100 · 证据覆盖 ${Math.round((risk?.confidence ?? 0) * 100)}%`}
          tone={
            risk?.risk_level === 'high'
              ? 'red'
              : risk?.risk_level === 'medium'
                ? 'amber'
                : risk?.risk_level === 'low'
                  ? 'green'
                  : 'blue'
          }
        />
      </div>

      <div className="panel">
        <div className="flex gap-1 overflow-x-auto border-b border-gray-100 p-2">
          {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => {
            const Icon = TAB_LABELS[key].icon;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cnx(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === key
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon className="h-4 w-4" />
                {TAB_LABELS[key].label}
              </button>
            );
          })}
        </div>

        <div className="p-4 lg:p-6">
          {activeTab === 'overview' && (
            <OverviewTab
              product={product}
              priceRecords={priceRecords}
              risk={risk}
              calcResult={calcResult}
              minPrice={minPrice}
              maxPrice={maxPrice}
              marketPrice={marketPrice}
              dataSourceLabel={
                product.source_id
                  ? '采集 / 导入数据（来自页面）'
                  : '模拟测试数据（非真实行情）'
              }
            />
          )}
          {activeTab === 'prices' && <PricesTab priceRecords={priceRecords} />}
          {activeTab === 'risk' && <RiskTab risk={risk} />}
          {activeTab === 'calculator' && (
            <CalculatorTab
              initialInput={calcInput}
              productName={product.name}
              productId={product.id}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'amber' | 'blue' | 'green' | 'red' | 'purple';
}) {
  const toneClass = {
    amber: 'text-warn-700',
    blue: 'text-ink-900',
    green: 'text-green-700',
    red: 'text-red-700',
    purple: 'text-ink-900',
  }[tone];

  return (
    <div className="panel p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <p
        className={cnx(
          'mt-1.5 text-lg font-semibold leading-snug tracking-tight tabular-nums',
          toneClass
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-2xs leading-relaxed text-ink-400">{hint}</p>
    </div>
  );
}

function OverviewTab({
  product,
  priceRecords,
  risk,
  calcResult,
  minPrice,
  maxPrice,
  marketPrice,
  dataSourceLabel,
}: {
  product: {
    category: string;
    brand: string;
    condition: string;
    model?: string;
    seller?: {
      name?: string;
      rating?: number;
      transactions?: number;
      zhimaLevel?: string;
      goodRatePercent?: number;
      soldCount?: number;
      source?: string;
    };
  };
  priceRecords: MockPriceRecord[];
  risk: RiskAssessmentOutput | null;
  calcResult: CalculatorOutput;
  minPrice: number;
  maxPrice: number;
  marketPrice: number | null;
  dataSourceLabel: string;
}) {
  const baseline = calcResult.scenarios.baseline;
  const hasMarketPrice = typeof marketPrice === 'number' && marketPrice > 0;
  const counts = countByType(priceRecords);
  const lastCollected = priceRecords
    .map((r) => r.collected_at)
    .sort()
    .at(-1);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Section title="商品基本信息">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="品类" value={product.category} />
            <Field label="品牌" value={product.brand} />
            <Field label="成色" value={CONDITION_LABELS[product.condition] ?? product.condition} />
            <Field label="型号" value={product.model ?? '—'} />
            <Field label="数据来源" value={dataSourceLabel} />
            <Field label="采集时间" value={formatDateTime(lastCollected)} />
            <Field label="价格记录" value={`${priceRecords.length} 条`} />
            <Field label="挂牌 / 成交" value={`${counts.listing} / ${counts.sold} 条`} />
            <Field label="数据完整度" value={`${Math.round(calcResult.costCompleteness * 100)}%`} />
          </dl>
        </Section>

        <Section title="卖家信誉（页面展示）">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="卖家昵称" value={product.seller?.name ?? '页面未展示'} />
            <Field
              label="卖家好评率"
              value={
                typeof product.seller?.goodRatePercent === 'number'
                  ? `${product.seller.goodRatePercent}%`
                  : '页面未展示'
              }
            />
            <Field label="芝麻信用" value={product.seller?.zhimaLevel ?? '页面未展示'} />
            <Field
              label="已售件数"
              value={
                typeof product.seller?.soldCount === 'number'
                  ? String(product.seller.soldCount)
                  : typeof product.seller?.transactions === 'number'
                    ? String(product.seller.transactions)
                    : '页面未展示'
              }
            />
            <Field label="数据来源" value={product.seller?.source ?? '无（未采集到信誉信息）'} />
          </dl>
          <p className="mt-2 text-xs text-gray-500">
            未展示的字段一律显示「页面未展示」，不推断也不按低分计入；信誉结论见「风险评估」页。
          </p>
        </Section>

        <Section title="价格区间（按数据类型区分）">
          <div className="grid grid-cols-3 gap-3">
            <RangeCard label="最低记录价" value={formatPrice(minPrice)} tone="green" />
            <RangeCard
              label="行情价（用户填写）"
              value={hasMarketPrice ? formatPrice(marketPrice) : '未设置行情价'}
              tone="blue"
            />
            <RangeCard label="最高记录价" value={formatPrice(maxPrice)} tone="red" />
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">价格类型</th>
                  <th className="px-3 py-2 text-right font-medium">记录数</th>
                  <th className="px-3 py-2 text-left font-medium">含义</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(
                  [
                    ['sold', '实际成交参考价，判断行情的最重要依据'],
                    ['listing', '平台当前挂牌价，卖家要价，不等于成交价'],
                    ['reference', '历史参考价，用于估算价格区间'],
                    ['manual', '用户手动录入的价格'],
                    ['simulated', '纯模拟占位数据，不得作为行情依据'],
                  ] as Array<[PriceType, string]>
                ).map(([type, meaning]) => (
                  <tr key={type}>
                    <td className="px-3 py-2">
                      <span
                        className={cnx(
                          'rounded-full px-2 py-0.5 text-xs',
                          getPriceTypeBadgeClass(type)
                        )}
                      >
                        {getPriceTypeLabel(type)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      {counts[type] ?? 0}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <div className="space-y-5">
        <Section title="风险评估摘要">
          <div className="flex items-center gap-4">
            <div
              className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-full border-4"
              style={{ borderColor: getRiskLevelColor(risk?.risk_level ?? 'insufficient') }}
            >
              <span
                className="text-xl font-semibold tabular-nums"
                style={{ color: getRiskLevelColor(risk?.risk_level ?? 'insufficient') }}
              >
                {risk?.score ?? 0}
              </span>
            </div>
            <div className="min-w-0">
              <span
                className={cnx(
                  'rounded-full px-2.5 py-1 text-sm font-medium',
                  riskLevelBadgeClass[risk?.risk_level ?? 'insufficient']
                )}
              >
                {getRiskLevelLabel(risk?.risk_level ?? 'insufficient')}
              </span>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
                证据覆盖率 {Math.round((risk?.confidence ?? 0) * 100)}%，共 {risk?.evidence.length ?? 0}{' '}
                个维度
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-gray-600">
            {risk?.calculation_basis ?? '暂无评估依据'}
          </p>
        </Section>

        <Section title="利润摘要（基准情景）">
          <dl className="space-y-2 text-sm">
            <SummaryRow label="预计净利润" value={formatPrice(baseline.netProfit)} tone={baseline.netProfit >= 0 ? 'green' : 'red'} strong />
            <SummaryRow label="利润率（净利润 ÷ 总投入）" value={`${baseline.profitMargin.toFixed(2)}%`} />
            <SummaryRow label="ROI（同口径）" value={`${baseline.roi.toFixed(2)}%`} />
            <SummaryRow label="净利率（净利润 ÷ 销售额）" value={`${baseline.netProfitMargin.toFixed(2)}%`} />
            <SummaryRow label="资金占用" value={formatPrice(baseline.capitalOccupied)} />
            <SummaryRow label="风险调整后收益" value={formatPrice(baseline.riskAdjustedReturn)} />
          </dl>
          {calcResult.missingFields.length > 0 && (
            <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">
              缺少必填项：{calcResult.missingFields.join('、')}，当前结果不可用
            </p>
          )}
        </Section>

        <Section title="交易建议">
          <ul className="space-y-2 text-xs leading-relaxed text-gray-600">
            {(risk?.recommended_actions ?? []).slice(0, 3).map((action, index) => (
              <li key={index} className="flex gap-2">
                <span className="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-800">
                  {index + 1}
                </span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

const PRICE_DOT_CLASS: Record<PriceType, string> = {
  sold: 'bg-green-500',
  listing: 'bg-warn-500',
  reference: 'bg-brand-300',
  manual: 'bg-ink-700',
  simulated: 'bg-gray-400',
};

function PriceTimeline({ priceRecords }: { priceRecords: MockPriceRecord[] }) {
  const summary = summarizePriceTimeline(priceRecords);
  const sorted = [...priceRecords].sort(
    (a, b) => new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime()
  );
  const presentTypes = [...new Set(sorted.map((record) => record.price_type))] as PriceType[];

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <TrendingUp className="h-4 w-4 text-gray-400" />
          价格采集时间分布
        </h3>
        <span className="text-xs text-gray-500">
          {summary.count} 条记录 · 跨 {summary.distinctDates} 个日期
        </span>
      </div>

      {summary.enough ? (
        <div className="mt-4">
          <div className="relative h-14 rounded-md bg-gray-50">
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gray-200" />
            {sorted.map((record) => {
              const ratio = priceTimelineRatio(record.collected_at, summary);
              return (
                <span
                  key={record.id}
                  title={`${getPriceTypeLabel(record.price_type)} · ${record.platform} · ${formatPrice(
                    record.price
                  )} · ${formatDateTime(record.collected_at)}`}
                  className={cnx(
                    'absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white',
                    PRICE_DOT_CLASS[record.price_type] ?? PRICE_DOT_CLASS.simulated
                  )}
                  style={{ left: `${(ratio * 100).toFixed(2)}%` }}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-gray-500">
            <span>{formatDate(sorted[0].collected_at)}</span>
            <span>{formatDate(sorted[sorted.length - 1].collected_at)}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {presentTypes.map((type) => (
              <span key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span
                  className={cnx(
                    'h-2.5 w-2.5 rounded-full',
                    PRICE_DOT_CLASS[type] ?? PRICE_DOT_CLASS.simulated
                  )}
                />
                {getPriceTypeLabel(type)}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            图中的采集时间与价格均为模拟构造值。它展示的是「这些记录分布在什么时间、什么价位」，
            不是该商品在真实市场上的价格走势，也不构成对未来价格的预测。
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
          目前只有 {summary.count} 条价格记录、跨 {summary.distinctDates} 个日期，样本不足以展示走势。
          这里刻意不画趋势线——用两三个点连出「看起来很精确」的曲线会误导判断。
          等到积累到足够的真实成交或挂牌记录后，这里会自动展示价格分布。
        </p>
      )}
    </div>
  );
}

function PricesTab({ priceRecords }: { priceRecords: MockPriceRecord[] }) {
  const order: PriceType[] = ['sold', 'listing', 'reference', 'manual', 'simulated'];
  const grouped = priceRecords.reduce<Record<string, MockPriceRecord[]>>((acc, record) => {
    (acc[record.price_type] ??= []).push(record);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
        所有记录均来自模拟测试数据，采集时间与来源链接为构造值，仅用于演示多平台比价与数据类型区分，
        不代表任何平台的真实报价或成交记录。
      </p>
      <PriceTimeline priceRecords={priceRecords} />
      {order.map((type) => {
        const records = grouped[type];
        if (!records?.length) return null;
        return (
          <div key={type} className="overflow-hidden rounded-lg border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={cnx('rounded-full px-2 py-0.5 text-xs font-medium', getPriceTypeBadgeClass(type))}
                >
                  {getPriceTypeLabel(type)}
                </span>
                <span className="text-sm text-gray-600">{records.length} 条记录</span>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{record.platform}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {record.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(record.collected_at)}
                      </span>
                      <span>成色 {CONDITION_LABELS[record.condition] ?? record.condition}</span>
                      <span>可信度 {Math.round(record.confidence * 100)}%</span>
                      <span>平台费率 {(record.platform_fee_rate * 100).toFixed(1)}%</span>
                    </div>
                    {record.notes && (
                      <p className="mt-1 text-xs text-warn-700">{record.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 sm:flex-shrink-0">
                    <div className="text-right">
                      <p className="text-lg font-semibold tabular-nums text-ink-900">{formatPrice(record.price)}</p>
                      <p className="text-xs text-gray-500">
                        运费 {formatPrice(record.shipping_fee)} · 到手 {formatPrice(record.price + record.shipping_fee)}
                      </p>
                    </div>
                    <a
                      href={record.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-1 text-xs text-brand-800 hover:underline"
                      title="模拟来源链接"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      来源
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RiskTab({ risk }: { risk: RiskAssessmentOutput | null }) {
  if (!risk) {
    return <p className="py-10 text-center text-gray-500">暂无风险评估数据</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center">
        <div
          className="grid h-20 w-20 flex-shrink-0 place-items-center rounded-full border-4"
          style={{ borderColor: getRiskLevelColor(risk.risk_level) }}
        >
          <span className="text-2xl font-semibold tabular-nums" style={{ color: getRiskLevelColor(risk.risk_level) }}>
            {risk.score}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cnx(
                'rounded-full px-3 py-1 text-base font-medium',
                riskLevelBadgeClass[risk.risk_level]
              )}
            >
              {getRiskLevelLabel(risk.risk_level)}
            </span>
            <span className="text-sm text-gray-500">
              证据覆盖率 {Math.round(risk.confidence * 100)}%
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">{risk.calculation_basis}</p>
        </div>
      </div>

      <div className="rounded-lg border border-warn-200 bg-warn-50 p-3 text-xs leading-relaxed text-warn-900">
        本模块只展示当前掌握的证据与不确定性。仅凭商品图片、卖家评分或低价都<strong>不能</strong>
        认定商品为真品；标注为「无法确认」的项目必须补证或线下验货后才能作为决策依据。
      </div>

      <Section title={`证据清单（${risk.evidence.length} 项）`} bare>
        <div className="space-y-2">
          {risk.evidence.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3 sm:flex-row sm:items-start"
            >
              <div
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: `${getEvidenceStatusColor(item.status)}22` }}
              >
                {item.status === 'pass' && (
                  <CheckCircle className="h-4 w-4" style={{ color: getEvidenceStatusColor(item.status) }} />
                )}
                {item.status === 'warning' && (
                  <AlertTriangle className="h-4 w-4" style={{ color: getEvidenceStatusColor(item.status) }} />
                )}
                {item.status === 'fail' && (
                  <XCircle className="h-4 w-4" style={{ color: getEvidenceStatusColor(item.status) }} />
                )}
                {item.status === 'unknown' && (
                  <HelpCircle className="h-4 w-4" style={{ color: getEvidenceStatusColor(item.status) }} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-gray-900">{item.dimension}</p>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: `${getEvidenceStatusColor(item.status)}22`,
                      color: getEvidenceStatusColor(item.status),
                    }}
                  >
                    {getEvidenceStatusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                <p className="mt-1 text-xs text-gray-500">
                  来源：{item.source} · 影响：{item.impact}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {risk.unverified_risks.length > 0 && (
        <Section title="尚未验证的风险">
          <ul className="space-y-2 text-sm text-gray-600">
            {risk.unverified_risks.map((item, index) => (
              <li key={index} className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warn-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="建议采取的核验措施">
        <ol className="space-y-2 text-sm text-gray-600">
          {risk.recommended_actions.map((action, index) => (
            <li key={index} className="flex gap-2">
              <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-medium text-brand-800">
                {index + 1}
              </span>
              <span>{action}</span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

const CALC_FIELDS: Array<{
  key: keyof CalculatorInput;
  label: string;
  unit: string;
  step: number;
  required?: boolean;
  hint?: string;
}> = [
  { key: 'buyPrice', label: '预计买入价', unit: '元', step: 1, required: true },
  { key: 'sellPrice', label: '预计转售价', unit: '元', step: 1, required: true },
  { key: 'buyShipping', label: '买入运费', unit: '元', step: 1 },
  { key: 'sellShipping', label: '卖出运费', unit: '元', step: 1 },
  { key: 'platformFeeRate', label: '平台手续费率', unit: '小数，0.01 = 1%', step: 0.001 },
  { key: 'inspectionFee', label: '验货 / 检测费', unit: '元', step: 1 },
  { key: 'repairFee', label: '维修费用', unit: '元', step: 1 },
  { key: 'accessoriesFee', label: '清洁 / 配件 / 包装', unit: '元', step: 1 },
  { key: 'otherFees', label: '其他成本', unit: '元', step: 1 },
  { key: 'negotiationBuffer', label: '预计议价空间', unit: '元', step: 1 },
  { key: 'returnLossBuffer', label: '退货损失准备金', unit: '元', step: 1 },
  { key: 'returnProbability', label: '退货概率', unit: '小数，0.1 = 10%', step: 0.01 },
  { key: 'holdDays', label: '预计持有天数', unit: '天', step: 1 },
];

function CalculatorTab({
  initialInput,
  productName,
  productId,
}: {
  initialInput: CalculatorInput;
  productName: string;
  productId: number;
}) {
  // 引擎输入是「分」，界面录入与展示统一用「元」。
  const [input, setInput] = useState<CalculatorInput>(() => centsToYuan(initialInput));
  useEffect(() => setInput(centsToYuan(initialInput)), [initialInput]);

  const result = calculateProfit(yuanToCents(input));

  const analysesQuery = useAnalyses(productId);
  const saveAnalysis = useSaveAnalysis();
  const deleteAnalysis = useDeleteAnalysis();
  const [label, setLabel] = useState('');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const handleSave = () => {
    if (result.missingFields.length > 0) {
      setSaveNotice('必填项缺失，无法保存这次测算');
      return;
    }
    setSaveNotice(null);
    saveAnalysis.mutate(
      {
        productId,
        label: label.trim() || undefined,
        input: input as unknown as Record<string, unknown>,
      },
      {
        onSuccess: () => {
          setLabel('');
          setSaveNotice('已保存到本地数据库，可在下方查看');
        },
        onError: (error) => setSaveNotice(`保存失败：${(error as Error).message}`),
      }
    );
  };

  const handleChange = (key: keyof CalculatorInput, raw: string) => {
    const value = raw === '' ? undefined : Number(raw);
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-5">
      <p className="rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
        计算对象：<strong>{productName}</strong>。金额单位为元，内部按「分」计算以避免浮点误差。
        标 <span className="text-red-600">*</span> 的为必填项，缺失时不会给出利润结果；
        可选项留空会按 0 计入并给出提示，避免默认零成本造成虚高利润。
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CALC_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="ml-0.5 text-red-600">*</span>}
              <span className="ml-1 text-xs font-normal text-gray-400">({field.unit})</span>
            </label>
            <input
              type="number"
              min={0}
              step={field.step}
              value={input[field.key] ?? ''}
              onChange={(event) => handleChange(field.key, event.target.value)}
              placeholder={field.required ? '必填' : '可选，留空按 0 计算'}
              className={cnx(
                'w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2',
                field.required && (input[field.key] === undefined || input[field.key] === null)
                  ? 'border-red-300 focus:ring-red-400'
                  : 'border-gray-300 focus:ring-brand-400'
              )}
            />
          </div>
        ))}
      </div>

      {result.missingFields.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-red-800">
            <XCircle className="h-4 w-4" />
            必填项缺失，已停止计算
          </p>
          <p className="mt-1 text-sm text-red-700">
            请补全：{result.missingFields.map((key) => CALC_FIELDS.find((f) => f.key === key)?.label ?? key).join('、')}
          </p>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-warn-200 bg-warn-50 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-warn-800">
            <AlertTriangle className="h-4 w-4" />
            估算假设提示（{result.warnings.length} 条）
          </p>
          <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-warn-800">
            {result.warnings.map((warning, index) => (
              <li key={index}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {(['conservative', 'baseline', 'optimistic'] as const).map((key) => {
          const scenario = result.scenarios[key];
          const palette = {
            conservative: { border: 'border-warn-200', bg: 'bg-warn-50', text: 'text-warn-800' },
            baseline: { border: 'border-brand-200', bg: 'bg-brand-50', text: 'text-brand-800' },
            optimistic: { border: 'border-green-200', bg: 'bg-green-50', text: 'text-green-800' },
          }[key];
          return (
            <div key={key} className={cnx('rounded-lg border p-4', palette.border, palette.bg)}>
              <h4 className={cnx('mb-3 flex items-center gap-2 font-semibold', palette.text)}>
                {key === 'conservative' && <AlertTriangle className="h-4 w-4" />}
                {key === 'baseline' && <TrendingUp className="h-4 w-4" />}
                {key === 'optimistic' && <CheckCircle className="h-4 w-4" />}
                {scenario.name}
              </h4>
              <dl className="space-y-1.5 text-sm">
                <SummaryRow label="买入价" value={formatPrice(scenario.buyPrice)} />
                <SummaryRow label="卖出价" value={formatPrice(scenario.sellPrice)} />
                <SummaryRow label="总买入成本" value={formatPrice(scenario.totalBuyCost)} />
                <SummaryRow label="总交易成本" value={formatPrice(scenario.totalSellCost)} />
                <SummaryRow label="净收入" value={formatPrice(scenario.netRevenue)} />
                <SummaryRow
                  label="净利润"
                  value={formatPrice(scenario.netProfit)}
                  tone={scenario.netProfit >= 0 ? 'green' : 'red'}
                  strong
                />
                <SummaryRow label="利润率" value={`${scenario.profitMargin.toFixed(2)}%`} />
                <SummaryRow label="ROI" value={`${scenario.roi.toFixed(2)}%`} />
                <SummaryRow label="净利率（占销售额）" value={`${scenario.netProfitMargin.toFixed(2)}%`} />
                <SummaryRow label="资金占用" value={formatPrice(scenario.capitalOccupied)} />
                <SummaryRow label="风险调整收益" value={formatPrice(scenario.riskAdjustedReturn)} />
                <SummaryRow label="年化 ROI" value={`${scenario.annualizedRoi.toFixed(2)}%`} />
              </dl>
            </div>
          );
        })}
      </div>

      <Section title="计算口径说明">
        <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs leading-relaxed text-gray-600 md:grid-cols-2">
          <p>总买入成本 = 买入价 + 买入运费</p>
          <p>
            总交易成本 = 卖出运费 + 平台手续费 + 验货费 + 维修费 + 配件费 + 其他成本 + 议价空间
          </p>
          <p>净收入 = 卖出价 − 总交易成本</p>
          <p>净利润 = 净收入 − 总买入成本</p>
          <p>利润率 = 净利润 ÷ 总投入成本 × 100%</p>
          <p>ROI = 净利润 ÷ 总投入成本 × 100%（本项目与利润率同口径，界面同时展示以免混淆）</p>
          <p>净利率 = 净利润 ÷ 卖出价 × 100%</p>
          <p>资金占用 = 总买入成本</p>
          <p>预期退货损失 = 退货概率 × (退货准备金 + 总买入成本 × 50%)</p>
          <p>风险调整收益 = 净利润 − 预期退货损失</p>
          <p>年化 ROI = 风险调整收益 ÷ 总投入成本 × (365 ÷ 持有天数) × 100%</p>
        </div>
        <p className="mt-3 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
          三情景假设：保守（售价 ×0.9，成本 ×1.2）、基准（×1.0 / ×1.0）、乐观（售价 ×1.1，成本 ×0.8）。
          退货损失基于显式概率与准备金计算，未使用任何未经说明的「精确预测」。
        </p>
      </Section>

      <Section title="保存分析结果">
        <p className="mb-3 text-xs leading-relaxed text-gray-600">
          保存的是这次的输入与算出的三情景结果，写入本地数据库，方便日后复核当时的口径。
          必填项缺失时不允许保存——不完整的测算保存下来只会误导未来的自己。
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">备注（可选）</label>
            <input
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="例如：按 21000 元谈成后复算"
              className="field"
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveAnalysis.isPending}
            className="btn btn-primary"
          >
            <Save className="h-4 w-4" />
            {saveAnalysis.isPending ? '保存中…' : '保存本次测算'}
          </button>
        </div>
        {saveNotice && (
          <p
            className={cnx(
              'mt-2 text-xs',
              saveNotice.startsWith('保存失败') || saveNotice.includes('无法保存')
                ? 'text-red-600'
                : 'text-green-700'
            )}
          >
            {saveNotice}
          </p>
        )}

        {analysesQuery.isPending ? (
          <p className="mt-4 text-xs text-gray-500">正在加载已保存的测算…</p>
        ) : (analysesQuery.data?.items.length ?? 0) === 0 ? (
          <p className="mt-4 text-xs text-gray-500">这件商品还没有保存过测算。</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {analysesQuery.data!.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs text-gray-700">
                    {item.label || '未命名测算'}
                    <span className="ml-2 text-gray-400">{formatDateTime(item.createdAt)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    基准净利润 {formatPrice(item.scenarios.baseline.netProfit)} · ROI{' '}
                    {item.scenarios.baseline.roi.toFixed(1)}% · 成本完整度{' '}
                    {Math.round(item.costCompleteness * 100)}%
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteAnalysis.mutate(item.id)}
                  title="删除这条测算"
                  aria-label="删除这条测算"
                  className="rounded p-1.5 text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  bare,
}: {
  title: string;
  children: React.ReactNode;
  bare?: boolean;
}) {
  return (
    <section
      className={cnx(!bare && 'border-t border-gray-100 pt-4 first:border-t-0 first:pt-0')}
    >
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-400">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function SummaryRow({
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
          strong ? 'font-semibold' : 'font-medium',
          tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : 'text-gray-900'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function RangeCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'green' | 'blue' | 'red';
}) {
  const toneClass = {
    green: 'text-green-700',
    blue: 'text-brand-800',
    red: 'text-red-700',
  }[tone];
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cnx('mt-1 text-lg font-semibold tabular-nums', toneClass)}>{value}</p>
    </div>
  );
}

function countByType(records: MockPriceRecord[]): Partial<Record<PriceType, number>> {
  return records.reduce<Partial<Record<PriceType, number>>>((acc, record) => {
    acc[record.price_type] = (acc[record.price_type] ?? 0) + 1;
    return acc;
  }, {});
}
