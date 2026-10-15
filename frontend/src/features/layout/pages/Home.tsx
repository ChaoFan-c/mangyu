import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Database,
  Info,
  Monitor,
  PackageSearch,
  ShieldCheck,
  Tag,
  TrendingUp,
} from 'lucide-react';
import { CATEGORY_GROUPS } from '@/shared/constants';
import {
  recommendationBadgeClass,
  recommendationLabels,
} from '@/shared/utils/opportunity';
import { getRiskLevelLabel, riskLevelBadgeClass } from '@/shared/utils/risk';
import { formatDateTime, formatPrice } from '@/shared/utils/format';
import { cnx } from '@/shared/utils/cnx';
import {
  useCollectionRuns,
  useHealth,
  useMarketPrices,
  useOpportunities,
  useProducts,
} from '@/shared/hooks/queries';
import { BackendNotice } from '@/shared/components/BackendNotice';
import { SearchBar } from '@/features/search/components/SearchBar';

const CONDITION_LABELS: Record<string, string> = {
  new: '全新未拆',
  '99new': '99 新',
  '95new': '95 新',
  '90new': '90 新',
  good: '良好',
  fair: '一般',
};

const SOURCE_LABELS: Record<string, string> = {
  'xianyu-browser': '本机采集',
  'user-link': '公开链接',
  manual: '手动录入',
  csv: 'CSV 导入',
};

const RUN_MODE_LABELS: Record<string, string> = {
  status: '状态检查',
  search: '搜索采集',
  detail: '详情采集',
  history: '历史采集',
  link: '链接读取',
};

const PRINCIPLES = [
  {
    icon: Database,
    title: '数据诚实',
    desc: '模拟数据全程显式标注；挂牌价、成交价与手动行情价分开呈现，不混为一谈。',
  },
  {
    icon: Calculator,
    title: '成本完整',
    desc: '必填成本缺失时拒绝计算，可选项缺失只提示，不按 0 元制造虚高利润。',
  },
  {
    icon: ShieldCheck,
    title: '风险客观',
    desc: '没有证据就标「无法确认」，不凭图片、卖家评分或低价推断商品为真品。',
  },
];

export function HomePage() {
  const health = useHealth();
  const opportunitiesQuery = useOpportunities({ limit: 200 });
  const productsQuery = useProducts({ limit: 200 });
  const marketPricesQuery = useMarketPrices();
  const runsQuery = useCollectionRuns(6);

  const opportunities = opportunitiesQuery.data?.items ?? [];
  const products = productsQuery.data?.items ?? [];
  const marketPrices = marketPricesQuery.data?.items ?? [];
  const runs = runsQuery.data?.items ?? [];

  const offline = [opportunitiesQuery, productsQuery, health].some(
    (query) => query.isError && (query.error as { status?: number })?.status === 0
  );

  const stats = useMemo(() => {
    const collected = products.filter((item) => item.origin !== 'seed').length;
    const withMarketPrice = opportunities.filter((item) => item.market_price_set);
    return {
      products: health.data?.counts.products ?? 0,
      priceRecords: health.data?.counts.priceRecords ?? 0,
      collected,
      collectedTruncated: (productsQuery.data?.total ?? 0) > products.length,
      marketPrices: marketPrices.length,
      profitable: withMarketPrice.length,
      highRisk: opportunities.filter((item) => item.risk_level === 'high').length,
      unverified: opportunities.filter((item) => item.risk_level === 'insufficient').length,
    };
  }, [
    products,
    opportunities,
    marketPrices.length,
    health.data?.counts.products,
    health.data?.counts.priceRecords,
    productsQuery.data?.total,
  ]);

  const topOpportunities = opportunities.slice(0, 5);
  const riskWatch = opportunities
    .filter((item) => item.risk_level === 'high' || item.risk_level === 'insufficient')
    .slice(0, 4);

  const loading = opportunitiesQuery.isPending || health.isPending;

  return (
    <div className="space-y-5">
      {offline && (
        <BackendNotice
          onRetry={() => {
            void health.refetch();
            void opportunitiesQuery.refetch();
          }}
        />
      )}

      {/* 欢迎区域：品牌主张 + 搜索入口 */}
      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-7">
          <div className="min-w-0 lg:max-w-md">
            <p className="text-2xs font-medium uppercase tracking-wide text-brand-700">
              二手商品行情工作台
            </p>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight text-ink-900 sm:text-3xl">
              让每一笔闲置交易更有数
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              搜索选品、核验风险、测算利润，再把机会排成一张可执行的清单。
            </p>
          </div>
          <div className="w-full lg:max-w-xl">
            <SearchBar />
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/collect" className="btn btn-primary">
                <Monitor className="h-4 w-4" aria-hidden="true" />
                本机采集
              </Link>
              <Link to="/opportunities" className="btn btn-secondary">
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                机会排行榜
              </Link>
              <Link to="/calculator" className="btn btn-secondary">
                <Calculator className="h-4 w-4" aria-hidden="true" />
                利润计算器
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 核心统计：只展示有真实数据来源的指标 */}
      <section>
        <SectionTitle title="数据概览" hint={`价格记录 ${stats.priceRecords} 条`} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="在库商品"
            value={loading ? null : String(stats.products)}
            hint={`覆盖 ${CATEGORY_GROUPS.length} 个闲鱼大类`}
            icon={PackageSearch}
          />
          <Kpi
            label="采集入库"
            value={
              loading
                ? null
                : `${stats.collectedTruncated ? '≥' : ''}${stats.collected}`
            }
            hint="来自本机采集、公开链接或导入"
            icon={Monitor}
          />
          <Kpi
            label="已设置行情价"
            value={loading ? null : String(stats.marketPrices)}
            hint="利润测算的前提，需你手动填写"
            icon={Tag}
          />
          <Kpi
            label="可计算利润"
            value={loading ? null : String(stats.profitable)}
            hint={
              stats.products > stats.profitable
                ? `其余 ${stats.products - stats.profitable} 件未设置行情价`
                : '全部商品已具备行情价'
            }
            icon={TrendingUp}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* 机会榜预览 */}
        <section className="panel xl:col-span-2">
          <div className="panel-hd">
            <h2 className="panel-title">
              <TrendingUp className="h-4 w-4 text-brand-700" aria-hidden="true" />
              机会榜预览
            </h2>
            <Link
              to="/opportunities"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-800 hover:underline"
            >
              查看完整排行榜
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="skeleton h-5 w-full" />
              ))}
            </div>
          ) : topOpportunities.length === 0 ? (
            <div className="empty-state">
              <PackageSearch className="h-10 w-10 text-ink-300" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-ink-700">还没有可分析的商品</p>
              <p className="hint">先在「本机采集」里采集商品，再填写行情价</p>
              <Link to="/collect" className="btn btn-primary mt-3">
                去本机采集
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-5 py-2.5 text-left">商品</th>
                    <th className="px-3 py-2.5 text-right">挂牌价</th>
                    <th className="px-3 py-2.5 text-right">预计利润</th>
                    <th className="px-3 py-2.5 text-right">ROI</th>
                    <th className="px-3 py-2.5 text-left">风险</th>
                    <th className="px-5 py-2.5 text-left">结论</th>
                  </tr>
                </thead>
                <tbody>
                  {topOpportunities.map((item) => (
                    <tr key={item.product_id} className="table-row">
                      <td className="max-w-[280px] px-5 py-3">
                        <Link
                          to={`/product/${item.product_id}`}
                          className="block truncate font-medium text-ink-900 hover:text-brand-800"
                        >
                          {item.product_name}
                        </Link>
                        <p className="mt-0.5 truncate text-2xs text-ink-400">
                          {item.category} · {CONDITION_LABELS[item.condition] ?? item.condition}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-ink-700">
                        {formatPrice(item.buy_price)}
                      </td>
                      <td
                        className={cnx(
                          'whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums',
                          item.net_profit === null
                            ? 'text-ink-400'
                            : item.net_profit >= 0
                              ? 'text-green-700'
                              : 'text-red-600'
                        )}
                      >
                        {item.net_profit === null ? '未设置行情价' : formatPrice(item.net_profit)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-ink-700">
                        {item.roi === null ? '—' : `${item.roi.toFixed(1)}%`}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span className={cnx('badge', riskLevelBadgeClass[item.risk_level])}>
                          {getRiskLevelLabel(item.risk_level)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <span className={cnx('badge', recommendationBadgeClass[item.recommendation])}>
                          {recommendationLabels[item.recommendation]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-5">
          {/* 风险提醒 */}
          <section className="panel">
            <div className="panel-hd">
              <h2 className="panel-title">
                <AlertTriangle className="h-4 w-4 text-warn-500" aria-hidden="true" />
                需要核实的商品
              </h2>
              <span className="text-2xs text-ink-400">
                高风险 {stats.highRisk} · 信息不足 {stats.unverified}
              </span>
            </div>
            {riskWatch.length === 0 ? (
              <p className="px-5 py-6 text-xs leading-relaxed text-ink-500">
                当前没有标记为高风险或信息不足的商品。风险结论随证据变化，采集新数据后会重新计算。
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {riskWatch.map((item) => (
                  <li key={item.product_id} className="flex items-start gap-3 px-5 py-3">
                    <span
                      className={cnx(
                        'mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full',
                        item.risk_level === 'high' ? 'bg-red-500' : 'bg-gray-300'
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/product/${item.product_id}`}
                        className="block truncate text-sm font-medium text-ink-900 hover:text-brand-800"
                      >
                        {item.product_name}
                      </Link>
                      <p className="mt-0.5 text-2xs text-ink-500">
                        {getRiskLevelLabel(item.risk_level)} ·{' '}
                        {item.risk_level === 'high'
                          ? '存在明确风险项，需现场验货或压价'
                          : '证据不足，补齐信息前不做结论'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 最近采集 */}
          <section className="panel">
            <div className="panel-hd">
              <h2 className="panel-title">
                <Monitor className="h-4 w-4 text-ink-500" aria-hidden="true" />
                最近采集
              </h2>
              <Link
                to="/collect"
                className="text-2xs font-medium text-brand-800 hover:underline"
              >
                采集页
              </Link>
            </div>
            {runs.length === 0 ? (
              <p className="px-5 py-6 text-xs leading-relaxed text-ink-500">
                还没有采集记录。采集会写入商品与价格记录，并在「历史记录」中留下运行日志。
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {runs.map((run) => (
                  <li key={run.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-ink-900">
                        {run.query || RUN_MODE_LABELS[run.mode] || run.mode}
                      </span>
                      <span
                        className={cnx(
                          'badge flex-shrink-0',
                          run.status === 'ok'
                            ? 'bg-green-50 text-green-700 ring-green-200'
                            : 'bg-warn-50 text-warn-700 ring-warn-200'
                        )}
                      >
                        {run.status === 'ok' ? '成功' : '未完成'}
                      </span>
                    </div>
                    <p className="mt-1 text-2xs text-ink-400">
                      {SOURCE_LABELS[run.sourceId] ?? run.sourceId} ·{' '}
                      {RUN_MODE_LABELS[run.mode] ?? run.mode} · 识别 {run.itemCount} 条 · 新建{' '}
                      {run.newProducts} 商品 / {run.newPriceRecords} 价格记录 ·{' '}
                      {formatDateTime(run.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* 品类入口 */}
      <section className="panel p-5">
        <SectionTitle title="按闲鱼大类浏览" />
        <div className="flex flex-wrap gap-2">
          {CATEGORY_GROUPS.map((group) => (
            <Link key={group.id} to={`/search?categoryId=${group.id}`} className="chip">
              {group.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <SectionTitle title="平台原则" />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PRINCIPLES.map((principle) => {
            const Icon = principle.icon;
            return (
              <li key={principle.title} className="flex gap-3">
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-ink-900">{principle.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{principle.desc}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 flex items-start gap-2 border-t border-gray-100 pt-3 text-2xs leading-relaxed text-ink-400">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          利润与风险结论均基于当前掌握的数据与显式假设，属于估算而非承诺；历史价格趋势只在积累足够真实数据后展示。
        </p>
      </section>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      {hint && <span className="text-2xs text-ink-400">{hint}</span>}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | null;
  hint: string;
  icon: typeof Tag;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-500">{label}</p>
        <Icon className="h-4 w-4 text-ink-300" aria-hidden="true" />
      </div>
      {value === null ? (
        <div className="skeleton mt-2 h-7 w-16" />
      ) : (
        <p className="stat-value mt-1.5">{value}</p>
      )}
      <p className="mt-1.5 text-2xs leading-relaxed text-ink-400">{hint}</p>
    </div>
  );
}
