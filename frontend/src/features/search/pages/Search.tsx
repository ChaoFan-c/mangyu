import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Search as SearchIcon, X } from 'lucide-react';
import { SearchBar } from '../components/SearchBar';
import { ProductList } from '@/features/products/components/ProductList';
import { useProducts } from '@/shared/hooks/queries';
import { BackendNotice } from '@/shared/components/BackendNotice';
import { BRANDS, CATEGORIES, CATEGORY_GROUPS } from '@/shared/constants';
import { formatPrice } from '@/shared/utils/format';
import { cnx } from '@/shared/utils/cnx';

type SortKey = 'composite' | 'profit' | 'roi' | 'price' | 'date';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'composite', label: '综合评分' },
  { value: 'profit', label: '预计利润' },
  { value: 'roi', label: '投资回报率' },
  { value: 'price', label: '要价' },
  { value: 'date', label: '上架顺序' },
];

const CONDITION_LABELS: Record<string, string> = {
  new: '全新未拆',
  '99new': '99 新',
  '95new': '95 新',
  '90new': '90 新',
  good: '良好',
  fair: '一般',
  parts: '仅备件',
};

export function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const keyword = searchParams.get('keyword') ?? '';
  const sortBy = (searchParams.get('sortBy') as SortKey) || 'composite';
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

  const hasQuery = Array.from(searchParams.keys()).length > 0;

  const params = useMemo(
    () => ({
      keyword: keyword || undefined,
      categoryId: searchParams.get('categoryId') ?? undefined,
      brandId: searchParams.get('brandId') ?? undefined,
      condition: searchParams.get('condition') ?? undefined,
      region: searchParams.get('region') ?? undefined,
      minPrice: searchParams.get('minPrice') ?? undefined,
      maxPrice: searchParams.get('maxPrice') ?? undefined,
      sortBy,
      sortOrder,
      limit: 200,
    }),
    [searchParams, keyword, sortBy, sortOrder]
  );

  const { data, isPending, isError, error, refetch, isFetching } = useProducts(
    hasQuery ? params : { limit: 0 }
  );

  const products = hasQuery ? (data?.items ?? []) : [];
  const total = hasQuery ? (data?.total ?? 0) : 0;

  const updateSort = (nextSortBy: SortKey, nextAsc: boolean) => {
    const next = new URLSearchParams(searchParams);
    next.set('sortBy', nextSortBy);
    next.set('sortOrder', nextAsc ? 'asc' : 'desc');
    navigate({ pathname: '/search', search: next.toString() });
  };

  /** 已生效的筛选条件：只展示 URL 里真实存在的项，点 × 即从 URL 移除。 */
  const activeFilters = useMemo(() => {
    const entries: Array<{ key: string; label: string }> = [];
    const categoryId = searchParams.get('categoryId');
    if (categoryId) {
      // categoryId 既可能是 10 个大分类，也可能是细分类，两个清单都要查。
      const named =
        CATEGORY_GROUPS.find((item) => String(item.id) === categoryId)?.name ??
        CATEGORIES.find((item) => String(item.id) === categoryId)?.name;
      entries.push({ key: 'categoryId', label: `品类：${named ?? categoryId}` });
    }
    const brandId = searchParams.get('brandId');
    if (brandId) {
      const brand = BRANDS.find((item) => String(item.id) === brandId);
      entries.push({ key: 'brandId', label: `品牌：${brand?.name ?? brandId}` });
    }
    const condition = searchParams.get('condition');
    if (condition) {
      entries.push({
        key: 'condition',
        label: `成色：${CONDITION_LABELS[condition] ?? condition}`,
      });
    }
    const region = searchParams.get('region');
    if (region) entries.push({ key: 'region', label: `地区：${region}` });
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    if (minPrice) entries.push({ key: 'minPrice', label: `最低价：${formatPrice(Number(minPrice) * 100)}` });
    if (maxPrice) entries.push({ key: 'maxPrice', label: `最高价：${formatPrice(Number(maxPrice) * 100)}` });
    return entries;
  }, [searchParams]);

  const removeFilter = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    navigate({ pathname: '/search', search: next.toString() });
  };

  const resetAll = () => navigate({ pathname: '/search', search: '' });

  const offline = isError && (error as { status?: number })?.status === 0;

  return (
    <div className="space-y-5">
      <section className="panel p-4 lg:p-5">
        <SearchBar variant="full" />
      </section>

      {offline && <BackendNotice onRetry={() => void refetch()} />}

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs font-medium uppercase tracking-wide text-ink-400">
            生效筛选
          </span>
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => removeFilter(filter.key)}
              className="chip chip-active"
            >
              {filter.label}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={resetAll} className="btn btn-ghost btn-sm">
            清空全部
          </button>
        </div>
      )}

      <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="text-sm text-ink-600">
          {!hasQuery ? (
            '输入关键词或选择筛选条件后开始搜索'
          ) : (
            <>
              {keyword && (
                <>
                  关键词「<strong className="font-medium text-ink-900">{keyword}</strong>」·
                </>
              )}
              共找到 <strong className="font-semibold tabular-nums text-ink-900">{total}</strong>{' '}
              个商品
              {isFetching && <span className="ml-2 text-2xs text-ink-400">刷新中…</span>}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="text-xs text-ink-500">排序</span>
            <select
              value={sortBy}
              onChange={(event) => updateSort(event.target.value as SortKey, sortOrder === 'asc')}
              className="field field-compact w-auto pr-7"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="seg" role="group" aria-label="排序方向">
            <button
              type="button"
              onClick={() => updateSort(sortBy, false)}
              className={cnx('seg-item', sortOrder === 'desc' && 'seg-item-active')}
              aria-pressed={sortOrder === 'desc'}
              title="从高到低"
            >
              <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden="true" />
              降序
            </button>
            <button
              type="button"
              onClick={() => updateSort(sortBy, true)}
              className={cnx('seg-item', sortOrder === 'asc' && 'seg-item-active')}
              aria-pressed={sortOrder === 'asc'}
              title="从低到高"
            >
              <ArrowUpWideNarrow className="h-3.5 w-3.5" aria-hidden="true" />
              升序
            </button>
          </div>
        </div>
      </div>

      {isPending && hasQuery && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="panel overflow-hidden">
              <div className="skeleton aspect-[4/3] w-full rounded-none" />
              <div className="space-y-2 p-4">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-3 w-1/2" />
                <div className="skeleton mt-3 h-6 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isPending && isError && !offline && (
        <div className="rounded-xl border border-red-200 bg-red-50 py-12 text-center">
          <p className="text-red-700">搜索失败：{(error as Error)?.message ?? '未知错误'}</p>
          <button type="button" onClick={() => void refetch()} className="btn btn-primary mt-4">
            重试
          </button>
        </div>
      )}

      {!isPending && !isError && !hasQuery && (
        <div className="panel empty-state">
          <SearchIcon className="h-10 w-10 text-ink-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-ink-700">
            输入商品名称、品牌、型号或 SKU 开始搜索
          </p>
          <p className="hint">也可以直接用上方筛选条件按品类、成色和价格区间浏览</p>
        </div>
      )}

      {!isPending && !isError && hasQuery && (
        <ProductList products={products} onClick={(id) => navigate(`/product/${id}`)} />
      )}

      {!isPending && !isError && hasQuery && products.length > 0 && (
        <p className="text-2xs text-ink-400">
          价格数据来自本地数据库中的模拟测试数据，非真实平台行情。
        </p>
      )}
    </div>
  );
}

export default SearchPage;
