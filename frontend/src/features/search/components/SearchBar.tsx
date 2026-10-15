import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Search, Star, Trash2, X } from 'lucide-react';
import {
  useClearSearchHistory,
  useFrequentSearches,
  usePinSearch,
  useRegions,
  useRecordSearch,
  useSearchHistory,
} from '@/shared/hooks/queries';
import { BRANDS, CATEGORIES, CATEGORY_GROUPS } from '@/shared/constants';
import { cnx } from '@/shared/utils/cnx';

export const CONDITION_OPTIONS = [
  { value: '', label: '全部成色' },
  { value: 'new', label: '全新未拆' },
  { value: '99new', label: '99 新' },
  { value: '95new', label: '95 新' },
  { value: '90new', label: '90 新' },
  { value: 'good', label: '良好' },
  { value: 'fair', label: '一般' },
  { value: 'parts', label: '仅备件' },
];

export const SORT_OPTIONS = [
  { value: 'composite', label: '综合评分' },
  { value: 'profit', label: '预计利润' },
  { value: 'roi', label: '投资回报率' },
  { value: 'price', label: '价格' },
  { value: 'date', label: '上架时间' },
];

interface SearchForm {
  keyword: string;
  categoryId: number | null;
  brandId: number | null;
  condition: string;
  region: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

function formFromParams(params: URLSearchParams): SearchForm {
  const num = (key: string) => {
    const raw = params.get(key);
    return raw ? Number(raw) : null;
  };
  return {
    keyword: params.get('keyword') ?? '',
    categoryId: num('categoryId'),
    brandId: num('brandId'),
    condition: params.get('condition') ?? '',
    region: params.get('region') ?? '',
    minPrice: num('minPrice') ?? undefined,
    maxPrice: num('maxPrice') ?? undefined,
    sortBy: params.get('sortBy') ?? 'composite',
    sortOrder: params.get('sortOrder') === 'asc' ? 'asc' : 'desc',
  };
}

const EMPTY_FORM: SearchForm = {
  keyword: '',
  categoryId: null,
  brandId: null,
  condition: '',
  region: '',
  sortBy: 'composite',
  sortOrder: 'desc',
};

interface SearchBarProps {
  /**
   * compact：顶栏用的单行关键词搜索，保持醒目且不被筛选器挤占。
   * full：搜索页用的完整搜索表单，包含品类、品牌、成色、价格区间与排序。
   */
  variant?: 'compact' | 'full';
}

export function SearchBar({ variant = 'compact' }: SearchBarProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const historyQuery = useSearchHistory(10);
  const frequentQuery = useFrequentSearches(5);
  const pinSearch = usePinSearch();
  const recordSearch = useRecordSearch();
  const clearHistory = useClearSearchHistory();
  const history = (historyQuery.data?.items ?? []).map((item) => item.keyword);
  const frequent = frequentQuery.data?.items ?? [];

  const [form, setForm] = useState<SearchForm>(() => formFromParams(searchParams));
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setForm(formFromParams(searchParams));
  }, [searchParams]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toParams = (next: SearchForm) => {
    const params = new URLSearchParams();
    const keyword = next.keyword.trim();
    if (keyword) params.set('keyword', keyword);
    if (next.categoryId) params.set('categoryId', String(next.categoryId));
    if (next.brandId) params.set('brandId', String(next.brandId));
    if (next.condition) params.set('condition', next.condition);
    if (next.region) params.set('region', next.region);
    if (next.minPrice !== undefined) params.set('minPrice', String(next.minPrice));
    if (next.maxPrice !== undefined) params.set('maxPrice', String(next.maxPrice));
    params.set('sortBy', next.sortBy);
    params.set('sortOrder', next.sortOrder);
    return params;
  };

  const hasAnyCondition = (next: SearchForm) =>
    next.keyword.trim() !== '' ||
    next.categoryId !== null ||
    next.brandId !== null ||
    next.condition !== '' ||
    next.region !== '' ||
    next.minPrice !== undefined ||
    next.maxPrice !== undefined;

  /** full 变体下筛选条件立即生效，不必先输入关键词。 */
  const updateFilter = (patch: Partial<SearchForm>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (variant === 'full' && hasAnyCondition(next)) {
        navigate({ pathname: '/search', search: toParams(next).toString() });
      }
      return next;
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasAnyCondition(form)) return;
    if (form.keyword.trim()) {
      recordSearch.mutate({
        keyword: form.keyword.trim(),
        filters: Object.fromEntries(toParams(form).entries()),
        resultCount: 0,
      });
    }
    navigate({ pathname: '/search', search: toParams(form).toString() });
    setOpen(false);
  };

  const applyKeyword = (keyword: string) => {
    recordSearch.mutate({ keyword, filters: {}, resultCount: 0 });
    const params = new URLSearchParams(searchParams);
    params.set('keyword', keyword);
    navigate({ pathname: '/search', search: params.toString() });
    setOpen(false);
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    navigate({ pathname: '/search', search: '' });
    setOpen(false);
  };

  // 品类筛选用的是 10 个大分类；品牌仍然挂在细分类上，所以按子分类 id 匹配。
  const childIdsOfSelectedGroup = form.categoryId
    ? CATEGORIES.filter(
        (category) =>
          category.group === CATEGORY_GROUPS.find((group) => group.id === form.categoryId)?.name
      ).map((category) => category.id)
    : [];
  const brands = form.categoryId
    ? BRANDS.filter((brand) => childIdsOfSelectedGroup.includes(brand.category_id))
    : BRANDS;

  const regionsQuery = useRegions();
  const regions = regionsQuery.data?.items ?? [];

  const showHistory = open && history.length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={form.keyword}
            onChange={(event) => setForm((prev) => ({ ...prev, keyword: event.target.value }))}
            onFocus={() => setOpen(true)}
            placeholder="搜索商品名称、品牌、型号或 SKU"
            autoComplete="off"
            aria-label="搜索商品"
            className="field py-2 pl-9 pr-9"
          />
          {form.keyword && (
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, keyword: '' }))}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
              aria-label="清空关键词"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {showHistory && (
            <div className="animate-slide-down absolute left-0 right-0 top-full z-40 mt-1 panel overflow-hidden shadow-pop">
              {frequent.length > 0 && (
                <>
                  <div className="border-b border-gray-100 bg-gray-50 px-3 py-1.5">
                    <span className="text-xs font-medium text-gray-600">常用搜索</span>
                    <span className="ml-2 text-xs text-gray-400">
                      置顶优先，其余按使用次数
                    </span>
                  </div>
                  <ul className="border-b border-gray-100 py-1">
                    {frequent.map((item) => (
                      <li key={`frequent-${item.id}`} className="flex items-center">
                        <button
                          type="button"
                          onClick={() => applyKeyword(item.keyword)}
                          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Star
                            className={cnx(
                              'h-3.5 w-3.5 flex-shrink-0',
                              item.pinned ? 'fill-current text-warn-500' : 'text-gray-300'
                            )}
                          />
                          <span className="truncate">{item.keyword}</span>
                          <span className="ml-auto flex-shrink-0 text-xs text-gray-400">
                            {item.useCount} 次
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            pinSearch.mutate({ id: item.id, pinned: !item.pinned })
                          }
                          title={item.pinned ? '取消置顶' : '置顶为常用搜索'}
                          aria-label={item.pinned ? '取消置顶' : '置顶为常用搜索'}
                          className="mr-2 rounded p-1 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        >
                          {item.pinned ? '取消置顶' : '置顶'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5">
                <span className="text-xs text-gray-500">搜索历史</span>
                <button
                  type="button"
                  onClick={() => clearHistory.mutate()}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  <Trash2 className="h-3 w-3" />
                  清空
                </button>
              </div>
              <ul className="max-h-56 overflow-auto">
                {history.map((keyword) => (
                  <li key={keyword}>
                    <button
                      type="button"
                      onClick={() => applyKeyword(keyword)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <span className="truncate">{keyword}</span>
                      <Clock className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button type="submit" disabled={!hasAnyCondition(form)} className="btn btn-primary flex-shrink-0">
          搜索
        </button>

        {variant === 'full' && (
          <button
            type="button"
            onClick={reset}
            className="btn btn-secondary flex-shrink-0"
          >
            清空条件
          </button>
        )}
      </form>

      {variant === 'full' && (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="text-xs font-medium text-gray-600">
            品类
            <select
              value={form.categoryId ?? ''}
              onChange={(event) =>
                updateFilter({
                  categoryId: event.target.value ? Number(event.target.value) : null,
                  brandId: null,
                })
              }
              className="field mt-1"
            >
              <option value="">全部品类</option>
              {CATEGORY_GROUPS.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-gray-600">
            品牌
            <select
              value={form.brandId ?? ''}
              onChange={(event) =>
                updateFilter({ brandId: event.target.value ? Number(event.target.value) : null })
              }
              className="field mt-1"
            >
              <option value="">全部品牌</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-gray-600">
            成色
            <select
              value={form.condition}
              onChange={(event) => updateFilter({ condition: event.target.value })}
              className="field mt-1"
            >
              {CONDITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-gray-600">
            最低价（元）
            <input
              type="number"
              min={0}
              value={form.minPrice ?? ''}
              onChange={(event) =>
                updateFilter({
                  minPrice: event.target.value ? Number(event.target.value) : undefined,
                })
              }
              placeholder="不限"
              className="field mt-1"
            />
          </label>

          <label className="text-xs font-medium text-gray-600">
            最高价（元）
            <input
              type="number"
              min={0}
              value={form.maxPrice ?? ''}
              onChange={(event) =>
                updateFilter({
                  maxPrice: event.target.value ? Number(event.target.value) : undefined,
                })
              }
              placeholder="不限"
              className="field mt-1"
            />
          </label>

          <label className="text-xs font-medium text-gray-600">
            地区
            <select
              value={form.region}
              onChange={(event) => updateFilter({ region: event.target.value })}
              className="field mt-1"
            >
              <option value="">全部地区</option>
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>

        </div>
      )}
    </div>
  );
}
