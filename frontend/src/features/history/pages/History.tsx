import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, History as HistoryIcon, Star, Trash2, TrendingUp } from 'lucide-react';
import type { FavoritePayload } from '@/shared/api/endpoints';
import {
  useClearSearchHistory,
  useDeleteSearch,
  useFavorites,
  usePinSearch,
  useSearchHistory,
} from '@/shared/hooks/queries';
import { BackendNotice } from '@/shared/components/BackendNotice';
import { CATEGORIES } from '@/shared/constants';
import { formatPrice, formatSignedPrice, formatDateTime } from '@/shared/utils/format';
import { cnx } from '@/shared/utils/cnx';

interface DealRow {
  id: number;
  productId: number | null;
  productName: string;
  category: string;
  buyPrice?: number;
  sellPrice?: number;
  profit?: number;
  status: FavoritePayload['status'];
  updatedAt: string;
}

function toDealRows(items: FavoritePayload[]): DealRow[] {
  return items
    .filter((item) => item.status === 'bought' || item.status === 'sold')
    .map((item) => {
      const buy = item.actualBuyPrice;
      const sell = item.actualSellPrice;
      const profit = buy !== undefined && sell !== undefined ? sell - buy : undefined;
      return {
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        category: item.category,
        buyPrice: buy,
        sellPrice: sell,
        profit,
        status: item.status,
        updatedAt: item.updatedAt,
      };
    });
}

function holdDays(row: DealRow): number {
  const start = new Date(row.updatedAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.round((Date.now() - start) / (24 * 60 * 60 * 1000)));
}

export function HistoryPage() {
  const [activeTab, setActiveTab] = useState<'deals' | 'search'>('deals');
  const [categoryFilter, setCategoryFilter] = useState('');

  const favoritesQuery = useFavorites();
  const historyQuery = useSearchHistory(20);
  const clearHistory = useClearSearchHistory();
  const pinSearch = usePinSearch();
  const deleteSearch = useDeleteSearch();

  const dealRows = useMemo(() => toDealRows(favoritesQuery.data?.items ?? []), [favoritesQuery.data]);
  const filteredDeals = useMemo(
    () => (categoryFilter ? dealRows.filter((row) => row.category === categoryFilter) : dealRows),
    [dealRows, categoryFilter]
  );

  const closed = filteredDeals.filter((row) => row.status === 'sold' && row.profit !== undefined);
  const realized = closed.reduce((sum, row) => sum + (row.profit ?? 0), 0);
  const wins = closed.filter((row) => (row.profit ?? 0) > 0).length;
  const holdDaysList = closed.map(holdDays);
  const stats = {
    count: filteredDeals.length,
    closedCount: closed.length,
    realized,
    winRate: closed.length ? (wins / closed.length) * 100 : undefined,
    avgHoldDays: holdDaysList.length
      ? holdDaysList.reduce((sum, value) => sum + value, 0) / holdDaysList.length
      : undefined,
  };

  const history = historyQuery.data?.items ?? [];
  const offline =
    (favoritesQuery.isError && (favoritesQuery.error as { status?: number })?.status === 0) ||
    (historyQuery.isError && (historyQuery.error as { status?: number })?.status === 0);

  return (
    <div className="space-y-5">
      {offline && (
        <BackendNotice
          onRetry={() => {
            void favoritesQuery.refetch();
            void historyQuery.refetch();
          }}
        />
      )}

      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
          <HistoryIcon className="h-6 w-6 text-brand-700" />
          历史记录
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          交易记录来自「我的收藏」中标记为已买入 / 已售出的条目；搜索历史由服务端记录，换浏览器也能看到。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="在跟踪的交易" value={String(stats.count)} tone="text-gray-900" />
        <Stat label="已结算交易" value={String(stats.closedCount)} tone="text-ink-900" />
        <Stat
          label="累计实现利润"
          value={stats.closedCount ? formatSignedPrice(stats.realized) : '暂无结算'}
          tone={stats.realized >= 0 ? 'text-green-700' : 'text-red-700'}
        />
        <Stat
          label="平均持有天数（按最近更新估算）"
          value={stats.avgHoldDays !== undefined ? stats.avgHoldDays.toFixed(0) + ' 天' : '—'}
          tone="text-ink-900"
        />
      </div>

      <div className="panel">
        <div className="flex border-b border-gray-100">
          <TabButton active={activeTab === 'deals'} onClick={() => setActiveTab('deals')}>
            交易记录（{dealRows.length}）
          </TabButton>
          <TabButton active={activeTab === 'search'} onClick={() => setActiveTab('search')}>
            搜索历史（{history.length}）
          </TabButton>
        </div>

        <div className="p-4">
          {activeTab === 'deals' && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="field w-auto"
                >
                  <option value="">全部品类</option>
                  {CATEGORIES.map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-gray-500">
                  {stats.winRate !== undefined
                    ? '已结算胜率 ' + stats.winRate.toFixed(0) + '%'
                    : '填好实际成交价后即可统计胜率'}
                </span>
              </div>

              {favoritesQuery.isPending ? (
                <p className="py-12 text-center text-gray-500">正在加载交易记录…</p>
              ) : filteredDeals.length === 0 ? (
                <EmptyState
                  icon={<TrendingUp className="h-12 w-12 text-gray-300" />}
                  title="还没有交易记录"
                  hint="在「我的收藏」里把条目状态改为「已买入」，并填写实际买入价与卖出价"
                  linkTo="/favorites"
                  linkText="去我的收藏"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">商品</th>
                        <th className="px-3 py-2 text-left font-medium">品类</th>
                        <th className="px-3 py-2 text-right font-medium">实际买入</th>
                        <th className="px-3 py-2 text-right font-medium">实际卖出</th>
                        <th className="px-3 py-2 text-right font-medium">实现利润</th>
                        <th className="px-3 py-2 text-right font-medium">距最近更新</th>
                        <th className="px-3 py-2 text-left font-medium">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredDeals.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-3 py-3">
                            {row.productId ? (
                              <Link
                                to={`/product/${row.productId}`}
                                className="font-medium text-gray-900 hover:text-brand-800"
                              >
                                {row.productName}
                              </Link>
                            ) : (
                              <span className="font-medium text-gray-900">{row.productName}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-gray-600">{row.category}</td>
                          <td className="px-3 py-3 text-right text-gray-900">
                            {row.buyPrice !== undefined ? formatPrice(row.buyPrice) : '—'}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-900">
                            {row.sellPrice !== undefined ? formatPrice(row.sellPrice) : '持有中'}
                          </td>
                          <td
                            className={cnx(
                              'px-3 py-3 text-right font-medium',
                              row.profit === undefined
                                ? 'text-gray-400'
                                : row.profit >= 0
                                  ? 'text-green-700'
                                  : 'text-red-700'
                            )}
                          >
                            {row.profit === undefined ? '未结算' : formatSignedPrice(row.profit)}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-600">
                            {holdDays(row)} 天
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={cnx(
                                'badge whitespace-nowrap',
                                row.status === 'sold'
                                  ? 'bg-green-50 text-green-700 ring-green-200'
                                  : 'bg-brand-50 text-brand-800 ring-brand-200'
                              )}
                            >
                              {row.status === 'sold' ? '已售出' : '持有中'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {activeTab === 'search' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  最近 {history.length} 条关键词记录
                </span>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('确定清空全部搜索历史吗？')) clearHistory.mutate();
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    清空
                  </button>
                )}
              </div>

              {historyQuery.isPending ? (
                <p className="py-12 text-center text-gray-500">正在加载搜索历史…</p>
              ) : history.length === 0 ? (
                <EmptyState
                  icon={<Clock className="h-12 w-12 text-gray-300" />}
                  title="还没有搜索历史"
                  hint="在顶部搜索栏输入关键词后会在这里留下记录"
                  linkTo="/search"
                  linkText="去搜索"
                />
              ) : (
                <ul className="space-y-2">
                  {history.map((item) => (
                    <li
                      key={item.id}
                      className={cnx(
                        'flex items-center gap-2 rounded-lg bg-gray-50 pr-2',
                        item.pinned && 'ring-1 ring-warn-300'
                      )}
                    >
                      <Link
                        to={`/search?keyword=${encodeURIComponent(item.keyword)}`}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-gray-100"
                      >
                        <span className="flex min-w-0 items-center gap-2 font-medium text-gray-900">
                          {item.pinned && (
                            <Star className="h-3.5 w-3.5 flex-shrink-0 fill-current text-warn-500" />
                          )}
                          <span className="truncate">{item.keyword}</span>
                        </span>
                        <span className="flex-shrink-0 text-xs text-gray-500">
                          使用 {item.useCount} 次 ·{' '}
                          {item.resultCount > 0 ? `${item.resultCount} 条结果 · ` : ''}
                          {formatDateTime(item.createdAt)}
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => pinSearch.mutate({ id: item.id, pinned: !item.pinned })}
                        title={item.pinned ? '取消置顶' : '置顶为常用搜索'}
                        aria-label={item.pinned ? '取消置顶' : '置顶为常用搜索'}
                        className="flex-shrink-0 rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-warn-600"
                      >
                        <Star className={cnx('h-4 w-4', item.pinned && 'fill-current text-warn-500')} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSearch.mutate(item.id)}
                        title="删除这条记录"
                        aria-label="删除这条记录"
                        className="flex-shrink-0 rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cnx(
        'whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-colors',
        active
          ? 'border-brand-500 text-brand-800'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cnx('mt-1 text-xl font-semibold tracking-tight tabular-nums', tone)}>{value}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
  linkTo,
  linkText,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  linkTo: string;
  linkText: string;
}) {
  return (
    <div className="py-14 text-center">
      <div className="mb-3 flex justify-center">{icon}</div>
      <p className="text-gray-600">{title}</p>
      <p className="mt-1 text-sm text-gray-400">{hint}</p>
      <Link
        to={linkTo}
        className="mt-4 inline-block btn btn-primary"
      >
        {linkText}
      </Link>
    </div>
  );
}
