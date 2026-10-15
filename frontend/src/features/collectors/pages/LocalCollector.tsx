import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Filter,
  Loader2,
  Monitor,
  Play,
  RefreshCw,
  ShieldAlert,
  Square,
  Tag,
} from 'lucide-react';
import { CATEGORY_GROUPS } from '@/shared/constants';
import {
  formatDateTime,
  formatPrice,
  getPriceTypeBadgeClass,
  getPriceTypeLabel,
} from '@/shared/utils/format';
import {
  useBrowserSearch,
  useBrowserStart,
  useBrowserStatus,
  useBrowserStop,
  useDeleteMarketPrice,
  useMarketPrices,
  useSaveMarketPrice,
} from '@/shared/hooks/queries';
import { BackendNotice } from '@/shared/components/BackendNotice';
import { cnx } from '@/shared/utils/cnx';
import type { BrowserSearchResultPayload } from '@/shared/api/endpoints';

/** 根据关键词给出一个大分类初值，用户可在表单里改成正确分类。 */
function guessCategory(keyword: string): string {
  const kw = keyword.toLowerCase();
  if (/(裙|鞋|包|衣|外套|运动|球拍|瑜伽)/.test(kw)) return '服饰 / 箱包 / 运动';
  if (/(课程|教程|会员|卡券|手办|盲盒|潮玩|模型)/.test(kw)) return '技能 / 卡券 / 潮玩';
  if (/(奶粉|纸尿裤|护肤|口红|面膜|洗发|化妆)/.test(kw)) return '母婴 / 美妆 / 个护';
  if (/(沙发|床|桌|冰箱|洗衣机|空调|瓷砖|灯具)/.test(kw)) return '家具 / 家电 / 家装';
  if (/(玉|翡翠|手串|珠宝|茶叶|礼品)/.test(kw)) return '文玩 / 珠宝 / 礼品';
  if (/(猫粮|狗粮|宠物|鲜花|零食|生鲜)/.test(kw)) return '食品 / 宠物 / 花卉';
  if (/(图书|小说|教材|游戏|switch|ps5|唱片|cd)/.test(kw)) return '图书 / 游戏 / 音像';
  if (/(汽车|轮胎|电动车|摩托|出租|租房)/.test(kw)) return '汽车 / 电动车 / 租房';
  if (/(电钻|扳手|农机|水泵|五金|设备)/.test(kw)) return '五金 / 设备 / 农牧';
  return '手机 / 数码 / 电脑';
}

export function LocalCollectorPage() {
  const [keyword, setKeyword] = useState('iPhone 15 256GB');
  const [category, setCategory] = useState(() => guessCategory('iPhone 15 256GB'));
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [mode, setMode] = useState<'launch' | 'connect'>('launch');
  const [cdpUrl, setCdpUrl] = useState('http://127.0.0.1:9222');
  const [maxScrolls, setMaxScrolls] = useState(3);
  const [maxPages, setMaxPages] = useState(3);
  const [maxItems, setMaxItems] = useState(20);
  const [personalOnly, setPersonalOnly] = useState(false);
  const [publishWithin3Days, setPublishWithin3Days] = useState(false);
  const [marketScope, setMarketScope] = useState<'keyword' | 'model'>('model');
  const [marketKey, setMarketKey] = useState('');
  const [marketPriceYuan, setMarketPriceYuan] = useState('');
  const [marketNotice, setMarketNotice] = useState<string | null>(null);
  const [result, setResult] = useState<BrowserSearchResultPayload | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const statusQuery = useBrowserStatus(true);
  const startBrowser = useBrowserStart();
  const stopBrowser = useBrowserStop();
  const runSearch = useBrowserSearch();
  const marketPricesQuery = useMarketPrices();
  const saveMarketPrice = useSaveMarketPrice();
  const deleteMarketPrice = useDeleteMarketPrice();

  useEffect(() => {
    if (!categoryTouched) setCategory(guessCategory(keyword));
  }, [keyword, categoryTouched]);

  const status = statusQuery.data?.status;
  const notes = statusQuery.data?.notes ?? [];
  const offline = statusQuery.isError && (statusQuery.error as { status?: number })?.status === 0;
  const activeMode = status?.mode ?? mode;

  const handleStart = () => {
    setFormError(null);
    startBrowser.mutate(
      activeMode === 'connect' ? { mode: 'connect', cdpUrl } : { mode: 'launch' },
      {
        onError: (error) => setFormError((error as Error).message),
      }
    );
  };

  const handleCollect = () => {
    setFormError(null);
    if (!keyword.trim()) {
      setFormError('请先填写搜索关键词');
      return;
    }
    runSearch.mutate(
      {
        keyword: keyword.trim(),
        category,
        maxScrolls,
        maxPages,
        maxItems,
        personalOnly,
        ...(publishWithin3Days ? { publishWithinDays: 3 } : {}),
      },
      {
        onSuccess: (data) => setResult(data),
        onError: (error) => {
          setResult(null);
          setFormError((error as Error).message);
        },
      }
    );
  };

  const statusTone = status?.loggedIn ? 'ok' : status?.launched ? 'warn' : 'idle';

  const marketPrices = marketPricesQuery.data?.items ?? [];

  const handleSaveMarketPrice = () => {
    setMarketNotice(null);
    const label = marketKey.trim();
    if (!label) {
      setMarketNotice('请填写关联的关键词或型号，例如 iPhone 15 256GB');
      return;
    }
    if (marketPriceYuan.trim() === '') {
      setMarketNotice('请填写行情价；留空表示未设置，不能用 0 代替');
      return;
    }
    const yuan = Number(marketPriceYuan);
    if (!Number.isFinite(yuan) || yuan < 0) {
      setMarketNotice('行情价必须是有效的非负数（单位：元）');
      return;
    }
    saveMarketPrice.mutate(
      { scope: marketScope, label, price: Math.round(yuan * 100) },
      {
        onSuccess: () => {
          setMarketKey('');
          setMarketPriceYuan('');
          setMarketNotice('行情价已保存；利润计算会优先使用它，采集程序不会覆盖。');
        },
        onError: (error) => setMarketNotice((error as Error).message),
      }
    );
  };

  return (
    <div className="space-y-5">
      {offline && <BackendNotice onRetry={() => void statusQuery.refetch()} />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">本机采集</h1>
          <p className="mt-1 text-sm text-ink-500">
            在当前已登录闲鱼网页版的浏览器中读取搜索结果页，并写入本地数据库；不绕过登录、验证码与风控。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="浏览器连接方式">
            <button
              type="button"
              onClick={() => setMode('launch')}
              className={cnx('seg-item', activeMode === 'launch' && 'seg-item-active')}
              aria-pressed={activeMode === 'launch'}
            >
              程序启动浏览器
            </button>
            <button
              type="button"
              onClick={() => setMode('connect')}
              className={cnx('seg-item', activeMode === 'connect' && 'seg-item-active')}
              aria-pressed={activeMode === 'connect'}
            >
              连接我的浏览器
            </button>
          </div>
          <button
            type="button"
            onClick={handleStart}
            disabled={startBrowser.isPending}
            className="btn btn-primary"
          >
            {startBrowser.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Monitor className="h-4 w-4" aria-hidden="true" />
            )}
            {activeMode === 'connect' ? '连接已开浏览器' : '启动专用浏览器'}
          </button>
          <button
            type="button"
            onClick={() => void statusQuery.refetch()}
            className="btn btn-secondary"
          >
            <RefreshCw
              className={cnx('h-4 w-4', statusQuery.isFetching && 'animate-spin')}
              aria-hidden="true"
            />
            刷新状态
          </button>
          <button
            type="button"
            onClick={() => stopBrowser.mutate()}
            disabled={stopBrowser.isPending}
            className="btn btn-secondary"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            {activeMode === 'connect' ? '断开连接' : '停止浏览器'}
          </button>
        </div>
      </div>

      {/* 会话状态 */}
      <div
        className={cnx(
          'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm',
          statusTone === 'ok' && 'border-green-200 bg-green-50 text-green-800',
          statusTone === 'warn' && 'border-warn-200 bg-warn-50 text-warn-800',
          statusTone === 'idle' && 'border-gray-200 bg-white text-ink-600'
        )}
      >
        {statusTone === 'ok' ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        ) : statusTone === 'warn' ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        ) : (
          <Monitor className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 break-words">
          {status?.message ?? '正在检查专用浏览器状态…'}
          {status?.url && (
            <span className="ml-2 text-2xs opacity-70">{status.url.split('?')[0]}</span>
          )}
        </span>
      </div>

      {activeMode === 'connect' && (
        <div className="panel p-4">
          <label className="block max-w-md">
            <span className="label">调试地址</span>
            <input
              type="text"
              value={cdpUrl}
              onChange={(event) => setCdpUrl(event.target.value)}
              className="field"
            />
          </label>
          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            先在带调试端口的独立配置目录里启动 Chrome，在其中登录闲鱼，再点上方「连接已开浏览器」：
          </p>
          <code className="mt-2 block overflow-x-auto rounded-lg bg-gray-100 px-3 py-2 text-2xs text-ink-700">
            powershell -File work\start-chrome-cdp.ps1
          </code>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* 采集参数 */}
        <section className="panel xl:col-span-2">
          <div className="panel-hd">
            <h2 className="panel-title">
              <Filter className="h-4 w-4 text-ink-500" aria-hidden="true" />
              采集参数
            </h2>
            <span className="text-2xs text-ink-400">参数含义与后端一致，未做改动</span>
          </div>

          <div className="space-y-5 p-5">
            <fieldset>
              <legend className="mb-2 text-2xs font-medium uppercase tracking-wide text-ink-400">
                搜索目标
              </legend>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="block md:col-span-2">
                  <span className="label">搜索关键词</span>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="例如 iPhone 15 256GB"
                    className="field"
                  />
                </label>
                <label className="block">
                  <span className="label">入库品类（闲鱼 10 大类）</span>
                  <select
                    value={category}
                    onChange={(event) => {
                      setCategoryTouched(true);
                      setCategory(event.target.value);
                    }}
                    className="field"
                  >
                    {CATEGORY_GROUPS.map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="border-t border-gray-100 pt-4">
              <legend className="mb-2 text-2xs font-medium uppercase tracking-wide text-ink-400">
                采集范围
              </legend>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="label">加载屏数</span>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={maxScrolls}
                    onChange={(event) => setMaxScrolls(Number(event.target.value))}
                    className="field tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="label">翻页数</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={maxPages}
                    onChange={(event) => setMaxPages(Number(event.target.value))}
                    className="field tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="label">最多入库</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={maxItems}
                    onChange={(event) => setMaxItems(Number(event.target.value))}
                    className="field tabular-nums"
                  />
                </label>
              </div>
              <p className="hint mt-2">
                允许范围：加载屏数 0-12 · 翻页数 1-10 · 最多入库 1-200 条
              </p>
            </fieldset>

            <fieldset className="border-t border-gray-100 pt-4">
              <legend className="mb-2 text-2xs font-medium uppercase tracking-wide text-ink-400">
                官网筛选
              </legend>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <Switch
                  checked={personalOnly}
                  onChange={setPersonalOnly}
                  label="个人闲置"
                  description="在页面上实际点选并确认生效后才开始采集"
                />
                <Switch
                  checked={publishWithin3Days}
                  onChange={setPublishWithin3Days}
                  label="3 天内发布"
                  description="按发布时间过滤，避免采集到长期挂单"
                />
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={handleCollect}
                disabled={runSearch.isPending || !status?.loggedIn}
                className="btn btn-primary px-5"
              >
                {runSearch.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4" aria-hidden="true" />
                )}
                {runSearch.isPending ? '采集中…' : '开始采集'}
              </button>
              <span
                className={cnx(
                  'text-xs',
                  formError ? 'font-medium text-red-600' : 'text-ink-500'
                )}
                role={formError ? 'alert' : undefined}
              >
                {formError ??
                  (status?.loggedIn
                    ? '采集会写入商品与价格记录，行情价不会被动。'
                    : '需先在专用浏览器窗口内登录闲鱼。')}
              </span>
            </div>
          </div>
        </section>

        {/* 行情价 */}
        <section className="panel">
          <div className="panel-hd">
            <h2 className="panel-title">
              <Tag className="h-4 w-4 text-brand-700" aria-hidden="true" />
              行情价
            </h2>
            <span className="text-2xs text-ink-400">仅你手动维护</span>
          </div>
          <div className="space-y-3 p-5">
            <p className="hint">
              你自己判断的参考市场价，与采集到的挂牌价分开保存；采集程序不会写入或覆盖。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">关联方式</span>
                <select
                  value={marketScope}
                  onChange={(event) =>
                    setMarketScope(event.target.value as 'keyword' | 'model')
                  }
                  className="field"
                >
                  <option value="model">按型号</option>
                  <option value="keyword">按关键词</option>
                </select>
              </label>
              <label className="block">
                <span className="label">行情价（元）</span>
                <input
                  type="number"
                  min={0}
                  value={marketPriceYuan}
                  onChange={(event) => setMarketPriceYuan(event.target.value)}
                  placeholder="留空 = 未设置"
                  className="field tabular-nums"
                />
              </label>
            </div>
            <label className="block">
              <span className="label">{marketScope === 'model' ? '型号' : '关键词'}</span>
              <input
                type="text"
                value={marketKey}
                onChange={(event) => setMarketKey(event.target.value)}
                placeholder={marketScope === 'model' ? '例如 iPhone 15 256GB' : '例如 iPhone 15'}
                className="field"
              />
            </label>
            <button
              type="button"
              onClick={handleSaveMarketPrice}
              disabled={saveMarketPrice.isPending}
              className="btn btn-secondary w-full"
            >
              {saveMarketPrice.isPending ? '保存中…' : '保存行情价'}
            </button>

            {marketNotice && (
              <p className="rounded-lg bg-gray-100 px-3 py-2 text-xs leading-relaxed text-ink-600">
                {marketNotice}
              </p>
            )}

            {marketPrices.length > 0 ? (
              <ul className="divide-y divide-gray-100 border-t border-gray-100 pt-2">
                {marketPrices.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate text-xs text-ink-600">
                      {item.scope === 'model' ? '型号' : '关键词'}「{item.label}」
                      <span className="ml-2 font-medium tabular-nums text-ink-900">
                        {formatPrice(item.price)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteMarketPrice.mutate(item.id)}
                      className="flex-shrink-0 rounded px-1.5 py-0.5 text-xs text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      aria-label={`删除行情价 ${item.label}`}
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-gray-100 pt-3 text-xs text-ink-400">
                尚未设置行情价，利润与 ROI 会显示为未设置。
              </p>
            )}
          </div>
        </section>
      </div>

      {/* 本次采集结果 */}
      {result && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryTile label="页面识别卡片" value={result.cardsSeen} />
            <SummaryTile label="成功入库" value={result.ingested.length} />
            <SummaryTile label="新增商品" value={result.createdProducts} />
            <SummaryTile label="新增价格记录" value={result.newPriceRecords} />
          </div>

          {result.filtersRequested.length > 0 && (
            <div className="panel px-4 py-3 text-xs text-ink-600">
              本次筛选请求：{result.filtersRequested.join('、')}；已确认生效：
              {result.filtersApplied.length > 0 ? result.filtersApplied.join('、') : '无'}
            </div>
          )}

          {result.status !== 'ok' && result.message && (
            <div className="rounded-xl border border-warn-200 bg-warn-50 px-4 py-3 text-sm text-warn-800">
              {result.message}
            </div>
          )}

          {(result.filterCandidates.length > 0 || result.sellerDiagnostics) && (
            <div className="panel p-4">
              <h3 className="panel-title mb-2">页面诊断</h3>
              <div className="space-y-1.5 text-xs text-ink-600">
                {result.filterCandidates.length > 0 && (
                  <p>
                    <span className="font-medium text-ink-700">页面上可见的筛选项：</span>
                    {result.filterCandidates.join(' | ')}
                  </p>
                )}
                {result.sellerDiagnostics && (
                  <>
                    <p>
                      <span className="font-medium text-ink-700">本页出现的信誉关键词：</span>
                      {result.sellerDiagnostics.keywords.length > 0
                        ? result.sellerDiagnostics.keywords.join('、')
                        : '一个都没有（说明搜索结果页本身不展示卖家信誉）'}
                    </p>
                    {result.sellerDiagnostics.snippets.length > 0 && (
                      <ul className="space-y-0.5 font-mono text-2xs text-ink-400">
                        {result.sellerDiagnostics.snippets.map((snippet, index) => (
                          <li key={index} className="truncate">
                            {snippet}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <section className="panel">
            <div className="panel-hd">
              <h2 className="panel-title">本次采集结果</h2>
              <span className="text-2xs text-ink-400">{result.message}</span>
            </div>
            {result.ingested.length === 0 ? (
              <p className="px-5 py-6 text-sm leading-relaxed text-ink-500">
                {result.status !== 'ok'
                  ? '本轮未采集到可入库的商品，具体原因见上方提示。'
                  : '本轮没有可入库的商品。常见原因是未登录、页面结构变化，或关键词无结果。'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-5 py-2.5 text-left">商品标题</th>
                      <th className="px-3 py-2.5 text-right">挂牌价</th>
                      <th className="px-3 py-2.5 text-left">价格类型</th>
                      <th className="px-3 py-2.5 text-left">字段完整度</th>
                      <th className="px-3 py-2.5 text-left">采集时间</th>
                      <th className="px-3 py-2.5 text-left">入库结果</th>
                      <th className="px-5 py-2.5 text-left">来源链接</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.ingested.map((row) => (
                      <tr key={row.productId} className="table-row">
                        <td className="max-w-[22rem] px-5 py-2.5">
                          <Link
                            to={`/product/${row.productId}`}
                            className="block max-w-[22rem] truncate text-ink-900 hover:text-brand-800"
                          >
                            {row.name}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-900">
                          {formatPrice(row.price)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cnx('badge', getPriceTypeBadgeClass('listing'))}>
                            {getPriceTypeLabel('listing')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-500">
                          {row.capturedFields.join(' / ')}
                          {row.missingFields.length > 0 && (
                            <span className="ml-1 text-warn-700">
                              缺{row.missingFields.join('、')}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-400">
                          {formatDateTime(row.collectedAt)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-ink-600">
                          {row.createdProduct ? '新建商品' : '更新已有商品价格'}
                        </td>
                        <td className="px-5 py-2.5">
                          <a
                            href={row.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-800 hover:underline"
                          >
                            打开
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {result.skipped.length > 0 && (
            <div className="rounded-xl border border-warn-200 bg-warn-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-warn-800">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                字段不完整、未入库的记录（{result.skipped.length}）
              </div>
              <ul className="space-y-1 text-xs text-warn-700">
                {result.skipped.slice(0, 20).map((entry) => (
                  <li key={entry.sourceUrl} className="truncate">
                    {entry.reason} · {entry.sourceUrl}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.ingestErrors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-red-700">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                入库失败（{result.ingestErrors.length}）
              </div>
              <ul className="space-y-1 text-xs text-red-600">
                {result.ingestErrors.map((entry) => (
                  <li key={entry} className="truncate">
                    {entry}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(result.riskBlocked || result.loginRequired || result.accessDenied) && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {result.accessDenied
                ? '站点拒绝了自动化访问（「非法访问 / 请使用正常浏览器访问」）。已停止，未做任何绕过尝试；请改用你自己正常浏览器的会话人工核对结果。'
                : result.riskBlocked
                  ? '采集被验证码或风控页面中断，已按边界停止，未做任何绕过尝试。'
                  : '未检测到登录态，请在专用浏览器窗口登录后重试。'}
            </div>
          )}
        </div>
      )}

      <section className="panel p-5">
        <h2 className="panel-title mb-2">采集日志</h2>
        {notes.length === 0 ? (
          <p className="text-xs text-ink-400">暂无记录。</p>
        ) : (
          <ul className="space-y-1 text-xs leading-relaxed text-ink-600">
            {notes.slice(-10).map((note, index) => (
              <li key={`${note}-${index}`} className="border-t border-gray-100 pt-1.5 first:border-0 first:pt-0">
                {note}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel px-4 py-3">
      <div className="text-xs text-ink-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-ink-900">{value}</div>
    </div>
  );
}

/** 开关：用 role="switch" 保留键盘操作，状态不只用颜色表达。 */
function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cnx(
          'mt-0.5 inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full border transition-colors duration-150',
          checked
            ? 'border-brand-500 bg-brand-400 justify-end'
            : 'border-gray-300 bg-gray-200 justify-start'
        )}
      >
        <span
          aria-hidden="true"
          className="mx-0.5 h-4 w-4 rounded-full bg-white shadow-sm"
        />
      </button>
      <span className="min-w-0">
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className="block text-left text-sm font-medium text-ink-900"
        >
          {label}
          <span className="ml-1.5 text-2xs font-normal text-ink-400">
            {checked ? '已开启' : '已关闭'}
          </span>
        </button>
        {description && <span className="hint block">{description}</span>}
      </span>
    </div>
  );
}

export default LocalCollectorPage;
