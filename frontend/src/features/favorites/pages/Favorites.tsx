import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Heart, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  trackStatusBadgeClass,
  trackStatusLabels,
  TRACK_STATUS_OPTIONS,
} from '../constants';
import type { FavoritePayload, FavoriteStatus } from '@/shared/api/endpoints';
import {
  useCreateFavorite,
  useDeleteFavorite,
  useFavorites,
  useUpdateFavorite,
} from '@/shared/hooks/queries';
import { BackendNotice } from '@/shared/components/BackendNotice';
import { CATEGORIES } from '@/shared/constants';
import { formatPrice, formatSignedPrice } from '@/shared/utils/format';
import { cnx } from '@/shared/utils/cnx';

const CONDITION_OPTIONS = [
  { value: 'new', label: '全新未拆' },
  { value: '99new', label: '99 新' },
  { value: '95new', label: '95 新' },
  { value: '90new', label: '90 新' },
  { value: 'good', label: '良好' },
  { value: 'fair', label: '一般' },
];

interface DraftState {
  productName: string;
  category: string;
  brand: string;
  condition: string;
  targetBuyPrice: string;
  targetSellPrice: string;
  notes: string;
}

const EMPTY_DRAFT: DraftState = {
  productName: '',
  category: CATEGORIES[0].name,
  brand: '',
  condition: '99new',
  targetBuyPrice: '',
  targetSellPrice: '',
  notes: '',
};

/** 只有「已售出」且两端实际成交价都填了，才算实现利润。 */
function realizedProfit(item: FavoritePayload): number | undefined {
  if (item.status !== 'sold') return undefined;
  if (item.actualBuyPrice === undefined || item.actualSellPrice === undefined) return undefined;
  return item.actualSellPrice - item.actualBuyPrice;
}

export function FavoritesPage() {
  const favoritesQuery = useFavorites();
  const createFavorite = useCreateFavorite();
  const updateFavorite = useUpdateFavorite();
  const deleteFavorite = useDeleteFavorite();

  const items = favoritesQuery.data?.items ?? [];

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBuy, setEditBuy] = useState('');
  const [editSell, setEditSell] = useState('');
  const [editStatus, setEditStatus] = useState<FavoriteStatus>('watching');

  const sold = items.filter((item) => item.status === 'sold');
  const realizedTotal = sold.reduce((sum, item) => sum + (realizedProfit(item) ?? 0), 0);
  const stats = {
    total: items.length,
    watching: items.filter((item) => item.status === 'watching').length,
    bought: items.filter((item) => item.status === 'bought').length,
    sold: sold.length,
    realized: realizedTotal,
  };

  const offline =
    favoritesQuery.isError && (favoritesQuery.error as { status?: number })?.status === 0;

  const handleAdd = () => {
    const problems: string[] = [];
    if (!draft.productName.trim()) problems.push('请填写商品名称');
    if (!draft.category) problems.push('请选择品类');
    const buy = draft.targetBuyPrice ? Number(draft.targetBuyPrice) : 0;
    const sell = draft.targetSellPrice ? Number(draft.targetSellPrice) : 0;
    if (draft.targetBuyPrice && !Number.isFinite(buy)) problems.push('目标买入价必须是数字');
    if (draft.targetSellPrice && !Number.isFinite(sell)) problems.push('目标卖出价必须是数字');
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    createFavorite.mutate(
      {
        productName: draft.productName.trim(),
        category: draft.category,
        brand: draft.brand.trim(),
        condition: draft.condition,
        targetBuyPrice: Math.round(buy * 100),
        targetSellPrice: Math.round(sell * 100),
        notes: draft.notes.trim(),
        status: 'watching',
      },
      {
        onSuccess: () => {
          setDraft(EMPTY_DRAFT);
          setShowForm(false);
        },
      }
    );
  };

  const startEdit = (item: FavoritePayload) => {
    setEditingId(item.id);
    setEditBuy(item.actualBuyPrice ? String(item.actualBuyPrice / 100) : '');
    setEditSell(item.actualSellPrice ? String(item.actualSellPrice / 100) : '');
    setEditStatus(item.status);
  };

  const saveEdit = (item: FavoritePayload) => {
    const patch: Record<string, unknown> = { status: editStatus };
    patch.actualBuyPrice = editBuy ? Math.round(Number(editBuy) * 100) : null;
    patch.actualSellPrice = editSell ? Math.round(Number(editSell) * 100) : null;
    updateFavorite.mutate({ id: item.id, patch });
    setEditingId(null);
  };

  return (
    <div className="space-y-5">
      {offline && <BackendNotice onRetry={() => void favoritesQuery.refetch()} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
            <Heart className="h-6 w-6 text-red-500" />
            我的收藏与交易跟踪
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            收藏商品、记录目标价与实际成交价，数据保存在本地 SQLite 数据库。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((open) => !open)}
          className="btn btn-primary"
        >
          <Plus className="h-4 w-4" />
          手动添加
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="收藏总数" value={String(stats.total)} tone="text-gray-900" />
        <StatCard label="关注中" value={String(stats.watching)} tone="text-ink-900" />
        <StatCard label="已买入" value={String(stats.bought)} tone="text-ink-900" />
        <StatCard
          label="累计实现利润（已售出）"
          value={stats.sold > 0 ? formatSignedPrice(stats.realized) : '暂无成交'}
          tone={stats.realized >= 0 ? 'text-green-700' : 'text-red-700'}
        />
      </div>

      {showForm && (
        <div className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">手动添加收藏</h2>
          {errors.length > 0 && (
            <ul className="mb-3 space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errors.map((error, index) => (
                <li key={index}>• {error}</li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="商品名称" required>
              <input
                type="text"
                value={draft.productName}
                onChange={(event) => setDraft({ ...draft, productName: event.target.value })}
                placeholder="例如 Sony A7R5 机身"
                className={inputClass}
              />
            </FormField>
            <FormField label="品类" required>
              <select
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                className={inputClass}
              >
                {CATEGORIES.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="品牌">
              <input
                type="text"
                value={draft.brand}
                onChange={(event) => setDraft({ ...draft, brand: event.target.value })}
                placeholder="例如 Sony"
                className={inputClass}
              />
            </FormField>
            <FormField label="成色">
              <select
                value={draft.condition}
                onChange={(event) => setDraft({ ...draft, condition: event.target.value })}
                className={inputClass}
              >
                {CONDITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="目标买入价（元）">
              <input
                type="number"
                min={0}
                value={draft.targetBuyPrice}
                onChange={(event) => setDraft({ ...draft, targetBuyPrice: event.target.value })}
                placeholder="例如 21000"
                className={inputClass}
              />
            </FormField>
            <FormField label="目标卖出价（元）">
              <input
                type="number"
                min={0}
                value={draft.targetSellPrice}
                onChange={(event) => setDraft({ ...draft, targetSellPrice: event.target.value })}
                placeholder="例如 23000"
                className={inputClass}
              />
            </FormField>
            <div className="sm:col-span-2 lg:col-span-3">
              <FormField label="备注">
                <textarea
                  rows={2}
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  placeholder="记录选品思路、待核实事项等"
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={createFavorite.isPending}
              className="btn btn-primary"
            >
              {createFavorite.isPending ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setErrors([]);
                setDraft(EMPTY_DRAFT);
              }}
              className="btn btn-secondary"
            >
              取消
            </button>
          </div>
          {createFavorite.isError && (
            <p className="mt-3 text-sm text-red-600">
              保存失败：{(createFavorite.error as Error).message}
            </p>
          )}
        </div>
      )}

      {favoritesQuery.isPending ? (
        <div className="panel empty-state">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="text-gray-500">正在加载收藏…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="panel empty-state">
          <Heart className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-gray-600">还没有收藏任何商品</p>
          <p className="mt-1 text-sm text-gray-400">
            在商品详情页点击「收藏」，或用上方「手动添加」记录线下看中的货
          </p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-3 text-left font-medium">商品</th>
                  <th className="px-3 py-3 text-left font-medium">品类 / 成色</th>
                  <th className="px-3 py-3 text-right font-medium">目标买入</th>
                  <th className="px-3 py-3 text-right font-medium">目标卖出</th>
                  <th className="px-3 py-3 text-right font-medium">预计价差</th>
                  <th className="px-3 py-3 text-right font-medium">实际买入 / 卖出</th>
                  <th className="px-3 py-3 text-right font-medium">实现利润</th>
                  <th className="px-3 py-3 text-left font-medium">状态</th>
                  <th className="px-3 py-3 text-left font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => {
                  const editing = editingId === item.id;
                  const gap = item.targetSellPrice - item.targetBuyPrice;
                  const profit = realizedProfit(item);
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3">
                        {item.productId ? (
                          <Link
                            to={`/product/${item.productId}`}
                            className="font-medium text-gray-900 hover:text-brand-800"
                          >
                            {item.productName}
                          </Link>
                        ) : (
                          <span className="font-medium text-gray-900">{item.productName}</span>
                        )}
                        {item.notes && (
                          <p
                            className="mt-0.5 max-w-[220px] truncate text-xs text-gray-500"
                            title={item.notes}
                          >
                            {item.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-600">
                        {item.category}
                        <span className="mx-1 text-gray-300">·</span>
                        {CONDITION_OPTIONS.find((option) => option.value === item.condition)
                          ?.label ?? item.condition}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-900">
                        {item.targetBuyPrice ? formatPrice(item.targetBuyPrice) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-900">
                        {item.targetSellPrice ? formatPrice(item.targetSellPrice) : '—'}
                      </td>
                      <td
                        className={cnx(
                          'px-3 py-3 text-right font-medium',
                          gap >= 0 ? 'text-green-700' : 'text-red-700'
                        )}
                      >
                        {item.targetBuyPrice && item.targetSellPrice
                          ? formatSignedPrice(gap)
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {editing ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              value={editBuy}
                              onChange={(event) => setEditBuy(event.target.value)}
                              placeholder="买入"
                              className="field field-compact w-20"
                            />
                            <input
                              type="number"
                              value={editSell}
                              onChange={(event) => setEditSell(event.target.value)}
                              placeholder="卖出"
                              className="field field-compact w-20"
                            />
                          </div>
                        ) : item.actualBuyPrice !== undefined ||
                          item.actualSellPrice !== undefined ? (
                          <span className="text-gray-700">
                            {item.actualBuyPrice !== undefined
                              ? formatPrice(item.actualBuyPrice)
                              : '—'}
                            <span className="mx-1 text-gray-300">/</span>
                            {item.actualSellPrice !== undefined
                              ? formatPrice(item.actualSellPrice)
                              : '—'}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td
                        className={cnx(
                          'px-3 py-3 text-right font-medium',
                          profit === undefined
                            ? 'text-gray-400'
                            : profit >= 0
                              ? 'text-green-700'
                              : 'text-red-700'
                        )}
                      >
                        {profit === undefined ? '—' : formatSignedPrice(profit)}
                      </td>
                      <td className="px-3 py-3">
                        {editing ? (
                          <select
                            value={editStatus}
                            onChange={(event) =>
                              setEditStatus(event.target.value as FavoriteStatus)
                            }
                            className="field w-auto"
                          >
                            {TRACK_STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={cnx(
                              'badge whitespace-nowrap',
                              trackStatusBadgeClass[item.status]
                            )}
                          >
                            {trackStatusLabels[item.status]}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          {editing ? (
                            <>
                              <IconButton
                                label="保存"
                                onClick={() => saveEdit(item)}
                                className="text-green-600 hover:bg-green-50"
                              >
                                <Check className="h-4 w-4" />
                              </IconButton>
                              <IconButton
                                label="取消"
                                onClick={() => setEditingId(null)}
                                className="text-gray-500 hover:bg-gray-100"
                              >
                                <X className="h-4 w-4" />
                              </IconButton>
                            </>
                          ) : (
                            <>
                              <IconButton
                                label="记录实际成交价"
                                onClick={() => startEdit(item)}
                                className="text-brand-800 hover:bg-brand-50"
                              >
                                <Pencil className="h-4 w-4" />
                              </IconButton>
                              <IconButton
                                label="删除"
                                onClick={() => {
                                  if (
                                    window.confirm(`确定删除「${item.productName}」吗？`)
                                  ) {
                                    deleteFavorite.mutate(item.id);
                                  }
                                }}
                                className="text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </IconButton>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs leading-relaxed text-gray-500">
        只有状态为「已售出」且填写了实际买入价与卖出价的记录才计入实现利润；
        未填写实际成交价的记录不会用目标价冒充真实利润。历史价格趋势需要在积累足够的真实数据后再展示。
      </p>
    </div>
  );
}

const inputClass =
  'field';

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {children}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cnx('mt-1 text-xl font-semibold tracking-tight tabular-nums', tone)}>{value}</p>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cnx('rounded p-1.5 transition-colors', className)}
    >
      {children}
    </button>
  );
}
