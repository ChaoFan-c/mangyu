import type { DatabaseSync } from 'node:sqlite';
import {
  BRANDS,
  assessRisk,
  calculateProfit,
  yuanToCents,
  type CalculatorInput,
  type ProductType,
} from '@daoye/shared';
import { Router, badRequest, conflict, notFound } from '../http/router.ts';
import {
  clampLimit,
  clampOffset,
  optionalCents,
  optionalCondition,
  optionalEnum,
  optionalNumber,
  optionalString,
  requireCents,
  requireCategoryName,
  requireStatus,
  requiredString,
  asObject,
} from '../validation.ts';
import {
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
} from '../repositories/products.ts';
import {
  countPriceRecords,
  listPriceRecords,
  listRegions,
} from '../repositories/priceRecords.ts';
import {
  createFavorite,
  deleteFavorite,
  listFavorites,
  updateFavorite,
} from '../repositories/favorites.ts';
import {
  clearSearchHistory,
  deleteSearchHistory,
  listFrequentSearches,
  listSearchHistory,
  recordSearch,
  setPinned,
} from '../repositories/searchHistory.ts';
import { clearImports, listImports, recordImport } from '../repositories/imports.ts';
import {
  deleteAnalysis,
  listAnalyses,
  saveAnalysis,
} from '../repositories/analyses.ts';
import { computeOpportunities, summarizeOpportunities } from '../services/opportunities.ts';
import {
  createDefaultRegistry,
  type SourceSummary,
} from '../collectors/registry.ts';
import { ingestCollectedItem } from '../collectors/ingest.ts';
import {
  linkExternalId,
  normalizePublicUrl,
  sanitizeUrlForLog,
} from '../collectors/adapters/publicLink.ts';
import type {
  CollectedItem,
  CollectedPrice,
  SourceDescriptor,
  SourceStatus,
} from '../collectors/types.ts';
import {
  listCollectionRuns,
  recordCollectionRun,
} from '../repositories/collectionRuns.ts';
import {
  listSourceStatuses,
  saveSourceStatus,
} from '../repositories/sourceStatus.ts';
import { browserSession } from '../collectors/browserSession.ts';
import { collectBrowserCards } from '../collectors/adapters/browserAutomation.ts';
import {
  deleteMarketPrice,
  listMarketPrices,
  matchMarketPrice,
  upsertMarketPrice,
} from '../repositories/marketPrices.ts';
import { listCategories } from '../repositories/categories.ts';

function toNumber(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

export function registerRoutes(router: Router, db: DatabaseSync): void {
  const collectorRegistry = createDefaultRegistry();

  // ---------- 健康检查 ----------
  router.get('/api/v1/health', () => ({
    status: 'ok',
    dataSource: '本地数据库；每条记录按来源字段区分演示、手动录入与本机采集数据',
    counts: {
      products: listProducts(db, { limit: 1, offset: 0 }).total,
      priceRecords: countPriceRecords(db),
    },
  }));

  // ---------- 商品数据采集 ----------
  router.get('/api/v1/data-sources', () => {
    const stored = listSourceStatuses(db);
    const enabled: SourceSummary[] = collectorRegistry.listAdapters().map((adapter) => {
      const last = stored.get(adapter.descriptor.id);
      return {
        ...adapter.descriptor,
        enabled: true,
        status: last?.status ?? 'unknown',
        message: last?.message ?? '尚未检查，点击检查后刷新状态',
        checkedAt: last?.checkedAt,
      };
    });
    const blocked: SourceSummary[] = collectorRegistry.listBlockedSources().map((source) => ({
      ...source,
      enabled: false,
      status: 'unavailable',
      message: source.legalNote,
    }));
    return { items: [...enabled, ...blocked] };
  });

  router.post('/api/v1/data-sources/:id/check', async ({ params }) => {
    const adapter = collectorRegistry.getAdapter(params.id);
    let status: SourceStatus;
    let descriptor: SourceDescriptor;
    if (adapter) {
      status = await adapter.checkStatus();
      descriptor = adapter.descriptor;
    } else {
      const blocked = collectorRegistry
        .listBlockedSources()
        .find((source) => source.id === params.id);
      if (!blocked) throw notFound(`数据源不存在：${params.id}`);
      descriptor = blocked;
      status = {
        status: 'unavailable' as const,
        message: blocked.legalNote,
        checkedAt: new Date().toISOString(),
      };
    }

    saveSourceStatus(db, descriptor.id, status);
    const run = recordCollectionRun(db, {
      sourceId: descriptor.id,
      mode: 'status',
      status: status.status,
      message: status.message,
    });
    return {
      source: {
        ...descriptor,
        enabled: Boolean(adapter),
        ...status,
      },
      run,
    };
  });

  router.get('/api/v1/collection-runs', ({ query }) => ({
    items: listCollectionRuns(db, clampLimit(query.get('limit'), 30, 100)),
  }));

  router.post('/api/v1/collection/link/preview', async ({ body }) => {
    const payload = asObject(body);
    const url = requiredString(payload, 'url', '商品链接');
    const logQuery = sanitizeUrlForLog(url);
    try {
      const preview = await collectorRegistry.previewLink(url);
      const run = recordCollectionRun(db, {
        sourceId: 'user-link',
        mode: 'link',
        query: logQuery,
        status: preview.status,
        itemCount: preview.metadata ? 1 : 0,
        message: preview.message,
      });
      return { preview, run };
    } catch (error) {
      const message = errorMessage(error);
      const run = recordCollectionRun(db, {
        sourceId: 'user-link',
        mode: 'link',
        query: logQuery,
        status: 'error',
        message,
      });
      return {
        preview: { status: 'error', message },
        run,
      };
    }
  });

  router.post('/api/v1/collection/link/import', async ({ body }) => {
    const payload = asObject(body);
    const url = requiredString(payload, 'url', '商品链接');
    let normalizedUrl: URL;
    try {
      normalizedUrl = normalizePublicUrl(url);
    } catch (error) {
      throw badRequest(errorMessage(error));
    }
    const category = requireCategoryName(payload);
    const manualPrice = optionalCents(payload, 'price');
    const hasManualPrice = manualPrice !== undefined && manualPrice > 0;
    const hasShippingFee = payload.shippingFee !== undefined;
    const shippingFee = optionalCents(payload, 'shippingFee') ?? 0;
    const location = optionalString(payload, 'location');
    const productName = optionalString(payload, 'productName');
    const brand = optionalString(payload, 'brand');
    const model = optionalString(payload, 'model');
    const condition = optionalCondition(payload);
    const description = optionalString(payload, 'description');
    const logQuery = sanitizeUrlForLog(normalizedUrl.toString());

    const preview = await collectorRegistry.previewLink(normalizedUrl.toString());
    if (preview.blocked) {
      throw badRequest(`链接不符合公开读取条件：${preview.message}`);
    }
    const metadata = preview.metadata;
    if (!metadata && !productName) {
      throw badRequest('页面读取失败，请至少手动填写商品名称和价格后再保存');
    }
    if (!metadata && !hasManualPrice) {
      throw badRequest('页面未解析到可核实价格，请手动填写人民币价格后再保存');
    }
    if (
      !hasManualPrice &&
      (!metadata?.price || metadata.currency !== 'CNY')
    ) {
      throw badRequest('页面未解析到有明确人民币币种的价格，请手动填写价格后再保存');
    }

    const sourceUrl = metadata?.sourceUrl ?? normalizedUrl.toString();
    const externalId = metadata
      ? preview.externalId ?? linkExternalId(sourceUrl)
      : linkExternalId(sourceUrl);
    const prices: CollectedPrice[] = [];
    if (metadata?.price && metadata.currency === 'CNY') {
      prices.push({
        platform: '公开网页',
        priceType: 'listing',
        price: metadata.price,
        currency: 'CNY',
        condition,
        location,
        shippingFee,
        collectedAt: new Date().toISOString(),
        sourceUrl,
        confidence: 0.55,
        notes: '来自页面结构化元数据，仅代表用户提交时页面标价，不代表成交价',
      });
    }
    if (hasManualPrice) {
      prices.push({
        platform: '用户手动补全',
        priceType: 'manual',
        price: manualPrice!,
        currency: 'CNY',
        condition,
        location,
        shippingFee,
        collectedAt: new Date().toISOString(),
        sourceUrl,
        confidence: 0.7,
        notes: '用户根据商品链接手动填写或修正的价格，不代表平台挂牌价或成交价',
      });
    }
    const warnings = [
      ...(metadata ? [] : [`页面读取失败或信息不完整：${preview.message}`]),
      '页面报价与用户补全值均不代表商品真伪、成交价或后续行情',
    ];
    if (!hasShippingFee) {
      warnings.push('未填写买入运费；价格记录中的 0 仅表示未知占位，不代表免运费，使用利润计算前需要补全实际运费');
    }
    warnings.push('平台手续费率未由数据源确认；当前价格记录中的 1% 是系统占位假设，计算利润前需要按实际平台规则修正');
    const item: CollectedItem = {
      sourceId: 'user-link',
      externalId,
      sourceRef: sourceUrl,
      sourceUrl,
      name: productName ?? metadata?.title ?? '未命名商品',
      category,
      brand: brand ?? metadata?.brand,
      model: model ?? metadata?.model,
      condition,
      description: description ?? metadata?.description,
      images: metadata?.image ? [metadata.image] : [],
      prices,
      dataSource:
        hasManualPrice && metadata?.price && metadata.currency === 'CNY'
          ? '用户提供链接：页面挂牌价与手动补全价（未登录、单次读取）'
          : hasManualPrice
            ? '用户提供链接及手动补全的价格（未登录、单次读取）'
            : '用户提供的公开页面元数据（未登录、单次读取）',
      warnings,
    };

    try {
      const ingest = ingestCollectedItem({
        db,
        sourceId: 'user-link',
        item,
      });
      const run = recordCollectionRun(db, {
        sourceId: 'user-link',
        mode: 'link',
        query: logQuery,
        status: preview.status === 'ok' ? 'ok' : 'unavailable',
        itemCount: 1,
        newProducts: ingest.createdProduct ? 1 : 0,
        newPriceRecords: ingest.newPriceRecords,
        message: hasManualPrice
          ? metadata?.price && metadata.currency === 'CNY'
            ? '已同时保存页面挂牌价和用户手动补全价，未冒充成交价'
            : '已保存用户手动补全价格，未把页面信息冒充为成交价'
          : '已保存公开页面挂牌价候选，未冒充成交价',
      });
      return {
        product: getProductById(db, ingest.productId),
        ingest,
        run,
        warnings,
      };
    } catch (error) {
      const message = errorMessage(error);
      recordCollectionRun(db, {
        sourceId: 'user-link',
        mode: 'link',
        query: logQuery,
        status: 'error',
        message,
      });
      throw error;
    }
  });

  // ---------- 本机浏览器自动化采集 ----------
  // 同一时间只允许一轮采集，避免在用户机器上叠开多个搜索会话。
  let browserSearchRunning = false;

  router.post('/api/v1/collection/browser/start', async ({ body }) => {
    const payload = body === undefined ? {} : asObject(body);
    const mode = optionalEnum(payload, 'mode', ['launch', 'connect'] as const);
    const cdpUrl = optionalString(payload, 'cdpUrl');
    try {
      browserSession.configure({ mode, cdpUrl });
    } catch (error) {
      throw badRequest(errorMessage(error));
    }

    const status = await browserSession.openHome();
    saveSourceStatus(db, 'xianyu-browser', {
      status: status.loggedIn ? 'ok' : 'unavailable',
      message: status.message,
      checkedAt: new Date().toISOString(),
    });
    return { status, notes: browserSession.lastNotes };
  });

  router.get('/api/v1/collection/browser/status', async () => {
    const status = browserSession.launched
      ? await browserSession.loginStatus()
      : {
          mode: browserSession.currentMode,
          launched: false,
          loggedIn: false,
          message:
            browserSession.currentMode === 'connect'
              ? '尚未连接到你启动的浏览器，请先点击「连接已开浏览器」'
              : '专用浏览器尚未启动，请先点击「启动专用浏览器」',
        };
    return { status, notes: browserSession.lastNotes };
  });

  router.post('/api/v1/collection/browser/stop', async () => {
    await browserSession.stop();
    return { stopped: true };
  });

  router.post('/api/v1/collection/browser/search', async ({ body }) => {
    const payload = asObject(body);
    const keyword = requiredString(payload, 'keyword', '关键词');
    const category = requireCategoryName(payload);
    const maxScrolls = optionalNumber(payload, 'maxScrolls') ?? 3;
    const maxPages = optionalNumber(payload, 'maxPages') ?? 3;
    const maxItems = optionalNumber(payload, 'maxItems') ?? 20;
    const personalOnly = payload.personalOnly === true;
    const publishWithinDays = payload.publishWithinDays === 3 ? 3 : undefined;

    if (browserSearchRunning) {
      throw conflict('已有一轮浏览器采集在进行中，请等待完成或先停止');
    }
    browserSearchRunning = true;
    try {
      const result = await collectBrowserCards({
        keyword,
        maxScrolls,
        maxPages,
        maxItems,
        filters: { personalOnly, publishWithinDays },
      });

      const ingested: Array<{
        productId: number;
        name: string;
        price: number;
        sourceUrl: string;
        createdProduct: boolean;
        collectedAt: string;
        missingFields: string[];
        capturedFields: string[];
      }> = [];
      const ingestErrors: string[] = [];
      let createdProducts = 0;
      let newPriceRecords = 0;

      for (const entry of result.entries) {
        const item = entry.item;
        try {
          const outcome = ingestCollectedItem({
            db,
            sourceId: 'xianyu-browser',
            item,
            category,
          });
          if (outcome.createdProduct) createdProducts += 1;
          newPriceRecords += outcome.newPriceRecords;
          ingested.push({
            productId: outcome.productId,
            name: item.name,
            price: item.prices[0]?.price ?? 0,
            sourceUrl: item.sourceUrl,
            createdProduct: outcome.createdProduct,
            collectedAt: entry.collectedAt,
            missingFields: entry.missingFields,
            capturedFields: entry.capturedFields,
          });
        } catch (error) {
          ingestErrors.push(`${item.sourceUrl}：${errorMessage(error)}`);
        }
      }

      const run = recordCollectionRun(db, {
        sourceId: 'xianyu-browser',
        mode: 'search',
        query:
          result.filtersApplied.length > 0
            ? `${keyword}（筛选：${result.filtersApplied.join('、')}）`
            : keyword,
        status: result.status,
        itemCount: result.items.length,
        newProducts: createdProducts,
        newPriceRecords,
        message: result.message,
      });
      saveSourceStatus(db, 'xianyu-browser', {
        status: result.status,
        message: result.message,
        checkedAt: new Date().toISOString(),
      });

      return {
        status: result.status,
        message: result.message,
        cardsSeen: result.cardsSeen,
        ingested,
        createdProducts,
        newPriceRecords,
        skipped: result.skipped,
        ingestErrors,
        loginRequired: result.loginRequired,
        riskBlocked: result.riskBlocked,
        accessDenied: result.accessDenied,
        filtersRequested: result.filtersRequested,
        filtersApplied: result.filtersApplied,
        filterCandidates: result.filterCandidates,
        sellerDiagnostics: result.sellerDiagnostics,
        notes: browserSession.lastNotes,
        run,
      };
    } catch (error) {
      const message = errorMessage(error);
      recordCollectionRun(db, {
        sourceId: 'xianyu-browser',
        mode: 'search',
        query: keyword,
        status: 'error',
        message,
      });
      throw error;
    } finally {
      browserSearchRunning = false;
    }
  });

  // ---------- 参考数据 ----------
  // 分类目录以数据库为准（10 个大分类 + 保留的细分类，含父子关系）。
  router.get('/api/v1/categories', () => ({
    items: listCategories(db),
  }));
  router.get('/api/v1/brands', () => ({ items: BRANDS }));
  router.get('/api/v1/regions', () => ({ items: listRegions(db) }));

  // ---------- 行情价（只能由用户维护，采集程序不得写入） ----------
  router.get('/api/v1/market-prices', () => ({ items: listMarketPrices(db) }));

  router.post('/api/v1/market-prices', ({ body }) => {
    const payload = asObject(body);
    const scope = optionalEnum(payload, 'scope', ['keyword', 'model'] as const) ?? 'keyword';
    const label = requiredString(payload, 'label', '关联关键词或型号');
    // 金额按「分」传输，与其它接口口径一致；0 是有效数值，未设置必须用「不提交」表达。
    const price = requireCents(payload, 'price', '行情价');
    const note = optionalString(payload, 'note');
    try {
      return { item: upsertMarketPrice(db, { scope, label, price, note }) };
    } catch (error) {
      throw badRequest(errorMessage(error));
    }
  });

  router.delete('/api/v1/market-prices/:id', ({ params }) => {
    if (!deleteMarketPrice(db, Number(params.id))) {
      throw notFound(`行情价不存在：${params.id}`);
    }
    return { removed: true };
  });

  // ---------- 商品 ----------
  router.get('/api/v1/products', ({ query }) => {
    const baseQuery = {
      keyword: query.get('keyword')?.trim() || undefined,
      categoryId: toNumber(query.get('categoryId')),
      brandId: toNumber(query.get('brandId')),
      condition: query.get('condition') || undefined,
      region: query.get('region') || undefined,
      minPrice: toNumber(query.get('minPrice')),
      maxPrice: toNumber(query.get('maxPrice')),
    };
    const limit = clampLimit(query.get('limit'), 50);
    const offset = clampOffset(query.get('offset'));
    const sortBy = query.get('sortBy') ?? 'composite';
    const sortOrder = query.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    // 利润 / ROI / 综合评分需要机会评分参与，因此在内存中排序后再分页。
    const needsScoring =
      sortBy === 'profit' || sortBy === 'roi' || sortBy === 'composite';

    let result: { items: ProductType[]; total: number };
    if (needsScoring) {
      const all = listProducts(db, { ...baseQuery, limit: 500, offset: 0 });
      const scores = computeOpportunities(db, {
        keyword: baseQuery.keyword,
        minNetProfit: undefined,
      });
      const scoreById = new Map(scores.map((item) => [item.product_id, item]));
      const key = sortBy === 'profit' ? 'net_profit' : sortBy === 'roi' ? 'roi' : 'composite_score';
      const sorted = [...all.items].sort((a, b) => {
        const left = Number((scoreById.get(a.id) as never as Record<string, number>)?.[key] ?? 0);
        const right = Number((scoreById.get(b.id) as never as Record<string, number>)?.[key] ?? 0);
        return sortOrder === 'asc' ? left - right : right - left;
      });
      result = {
        items: sorted.slice(offset, offset + limit),
        total: all.total,
      };
    } else {
      result = listProducts(db, {
        ...baseQuery,
        sortBy: sortBy === 'price' ? 'price' : 'date',
        sortOrder,
        limit,
        offset,
      });
    }

    // 关键词搜索顺带记入服务端搜索历史，保证换设备也能看到。
    const keyword = query.get('keyword')?.trim();
    if (keyword) {
      recordSearch(
        db,
        keyword,
        Object.fromEntries(query.entries()),
        result.total
      );
    }
    return result;
  });

  router.get('/api/v1/products/:id', ({ params }) => {
    const product = getProductById(db, Number(params.id));
    if (!product) throw notFound(`商品不存在：${params.id}`);
    // 行情价由用户维护：匹配不到就返回 null，界面必须显示「未设置行情价」。
    const marketPrice = matchMarketPrice(listMarketPrices(db), product);
    return { product, marketPrice: marketPrice ? marketPrice.price : null };
  });

  router.get('/api/v1/products/:id/price-records', ({ params }) => {
    const id = Number(params.id);
    if (!getProductById(db, id)) throw notFound(`商品不存在：${params.id}`);
    const items = listPriceRecords(db, id);
    return {
      items,
      counts: items.reduce<Record<string, number>>((acc, item) => {
        acc[item.price_type] = (acc[item.price_type] ?? 0) + 1;
        return acc;
      }, {}),
    };
  });

  router.post('/api/v1/products', ({ body }) => {
    const payload = asObject(body);
    const id = createProduct(db, {
      name: requiredString(payload, 'productName', '商品名称'),
      category: requireCategoryName(payload),
      brand: optionalString(payload, 'brand'),
      model: optionalString(payload, 'model'),
      condition: optionalCondition(payload),
      price: requireCents(payload, 'buyPrice', '买入价'),
      priceType: 'manual',
      description: optionalString(payload, 'description'),
      origin: 'manual',
    });
    return { product: getProductById(db, id) };
  });

  // ---------- 价格记录 ----------
  router.delete('/api/v1/products/:id', ({ params }) => {
    const outcome = deleteProduct(db, Number(params.id));
    if (outcome === 'not-found') throw notFound(`商品不存在：${params.id}`);
    if (outcome === 'protected') {
      throw conflict('内置演示商品不能删除，只能删除手动录入或导入的商品');
    }
    return { removed: true };
  });

  router.get('/api/v1/price-records', ({ query }) => {
    const productId = toNumber(query.get('productId'));
    if (productId === undefined) throw badRequest('必须提供 productId');
    return { items: listPriceRecords(db, productId) };
  });

  // ---------- 机会排行榜 ----------
  router.get('/api/v1/opportunities', ({ query }) => {
    const categories = query.get('categories')?.split(',').filter(Boolean);
    const items = computeOpportunities(db, {
      keyword: query.get('keyword')?.trim() || undefined,
      categories: categories?.length ? categories : undefined,
      maxRiskLevel: optionalEnum(
        { v: query.get('maxRiskLevel') ?? undefined },
        'v',
        ['low', 'medium', 'high', 'insufficient'] as const
      ),
      minNetProfit: toNumber(query.get('minNetProfit')),
      minRoi: toNumber(query.get('minRoi')),
      minDataConfidence: toNumber(query.get('minDataConfidence')),
      recommendation: optionalEnum(
        { v: query.get('recommendation') ?? undefined },
        'v',
        ['watch', 'caution', 'avoid'] as const
      ),
    });
    return { items, summary: summarizeOpportunities(items) };
  });

  // ---------- 利润计算（服务端复核，与前端共用同一份算法） ----------
  router.post('/api/v1/calculate', ({ body }) => {
    const payload = asObject(body);
    const numericKeys: Array<keyof CalculatorInput> = [
      'buyPrice',
      'sellPrice',
      'buyShipping',
      'sellShipping',
      'platformFeeRate',
      'inspectionFee',
      'repairFee',
      'accessoriesFee',
      'otherFees',
      'negotiationBuffer',
      'returnLossBuffer',
      'returnProbability',
      'holdDays',
    ];

    // 兼容两种入参：以「元」提交（界面口径）或以「分」提交（已换算）。
    const unit = payload.unit === 'cents' ? 'cents' : 'yuan';
    const raw: Partial<CalculatorInput> = {};
    for (const key of numericKeys) {
      const value = optionalNumber(payload, key);
      if (value !== undefined) raw[key] = value;
    }
    const input = unit === 'yuan' ? yuanToCents(raw) : raw;

    return {
      unit,
      input,
      result: calculateProfit(input),
    };
  });

  // ---------- 风险评估 ----------
  router.post('/api/v1/risk-assessment', ({ body }) => {
    const payload = asObject(body);
    const productId = optionalNumber(payload, 'productId');
    if (productId === undefined) throw badRequest('必须提供 productId');

    const product = getProductById(db, productId);
    if (!product) throw notFound(`商品不存在：${productId}`);

    const priceRecords = listPriceRecords(db, productId);
    const marketPrice = matchMarketPrice(listMarketPrices(db), product)?.price;
    return {
      productId,
      assessment: assessRisk({
        category: product.category,
        price: product.price,
        priceRecords,
        images: product.images,
        description: product.description,
        sellerInfo: product.seller,
        marketPrice,
      }),
    };
  });

  // ---------- 收藏与交易跟踪 ----------
  router.get('/api/v1/favorites', () => ({ items: listFavorites(db) }));

  router.post('/api/v1/favorites', ({ body }) => {
    const payload = asObject(body);
    return {
      favorite: createFavorite(db, {
        productId: optionalNumber(payload, 'productId'),
        productName: requiredString(payload, 'productName', '商品名称'),
        category: requireCategoryName(payload),
        brand: optionalString(payload, 'brand'),
        condition: optionalCondition(payload),
        targetBuyPrice: optionalCents(payload, 'targetBuyPrice') ?? 0,
        targetSellPrice: optionalCents(payload, 'targetSellPrice') ?? 0,
        notes: optionalString(payload, 'notes'),
        status: optionalEnum(payload, 'status', [
          'watching',
          'bought',
          'sold',
          'skipped',
        ] as const) ?? 'watching',
      }),
    };
  });

  router.patch('/api/v1/favorites/:id', ({ params, body }) => {
    const payload = asObject(body);
    const id = Number(params.id);
    const status =
      payload.status === undefined ? undefined : requireStatus(payload);
    const updated = updateFavorite(db, id, {
      targetBuyPrice: optionalCents(payload, 'targetBuyPrice'),
      targetSellPrice: optionalCents(payload, 'targetSellPrice'),
      actualBuyPrice:
        payload.actualBuyPrice === null ? null : optionalCents(payload, 'actualBuyPrice'),
      actualSellPrice:
        payload.actualSellPrice === null ? null : optionalCents(payload, 'actualSellPrice'),
      notes: optionalString(payload, 'notes'),
      status: status as never,
    });
    if (!updated) throw notFound(`收藏不存在：${params.id}`);
    return { favorite: updated };
  });

  router.delete('/api/v1/favorites/:id', ({ params }) => {
    const removed = deleteFavorite(db, Number(params.id));
    if (!removed) throw notFound(`收藏不存在：${params.id}`);
    return { removed: true };
  });

  // ---------- 搜索历史 ----------
  router.get('/api/v1/search-history', ({ query }) => ({
    items: listSearchHistory(db, clampLimit(query.get('limit'), 20, 50)),
  }));

  // 「常用搜索」与「最近搜索」是两个不同视角：前者按置顶 + 使用次数，后者按时间。
  router.get('/api/v1/search-history/frequent', ({ query }) => ({
    items: listFrequentSearches(db, clampLimit(query.get('limit'), 6, 20)),
  }));

  router.post('/api/v1/search-history', ({ body }) => {
    const payload = asObject(body);
    const filters = (payload.filters ?? {}) as Record<string, string>;
    return {
      item: recordSearch(
        db,
        requiredString(payload, 'keyword'),
        filters,
        optionalNumber(payload, 'resultCount') ?? 0
      ),
    };
  });

  router.delete('/api/v1/search-history', () => ({
    removed: clearSearchHistory(db),
  }));

  router.patch('/api/v1/search-history/:id', ({ params, body }) => {
    const payload = asObject(body);
    if (typeof payload.pinned !== 'boolean') {
      throw badRequest('pinned 必须是布尔值');
    }
    const updated = setPinned(db, Number(params.id), payload.pinned);
    if (!updated) throw notFound(`搜索记录不存在：${params.id}`);
    return { item: updated };
  });

  router.delete('/api/v1/search-history/:id', ({ params }) => {
    const removed = deleteSearchHistory(db, Number(params.id));
    if (!removed) throw notFound(`搜索记录不存在：${params.id}`);
    return { removed: true };
  });

  // ---------- 分析结果保存 ----------
  router.get('/api/v1/analyses', ({ query }) => ({
    items: listAnalyses(db, toNumber(query.get('productId'))),
  }));

  router.post('/api/v1/analyses', ({ body }) => {
    const payload = asObject(body);
    const rawInput = (payload.input ?? {}) as Partial<CalculatorInput>;
    const numericKeys: Array<keyof CalculatorInput> = [
      'buyPrice',
      'sellPrice',
      'buyShipping',
      'sellShipping',
      'platformFeeRate',
      'inspectionFee',
      'repairFee',
      'accessoriesFee',
      'otherFees',
      'negotiationBuffer',
      'returnLossBuffer',
      'returnProbability',
      'holdDays',
    ];
    const input: Partial<CalculatorInput> = {};
    for (const key of numericKeys) {
      const value = optionalNumber(rawInput as Record<string, unknown>, key);
      if (value !== undefined) input[key] = value;
    }
    // 与 /calculate 保持同一口径：默认按「元」提交并换算成「分」。
    const unit = payload.unit === 'cents' ? 'cents' : 'yuan';
    const engineInput = unit === 'yuan' ? yuanToCents(input) : input;
    // 服务端重新计算，不直接信任前端传来的结果。
    const result = calculateProfit(engineInput);
    return {
      analysis: saveAnalysis(db, {
        productId: optionalNumber(payload, 'productId'),
        label: optionalString(payload, 'label'),
        input: engineInput,
        result,
      }),
    };
  });

  router.delete('/api/v1/analyses/:id', ({ params }) => {
    const removed = deleteAnalysis(db, Number(params.id));
    if (!removed) throw notFound(`分析记录不存在：${params.id}`);
    return { removed: true };
  });

  // ---------- CSV 导入 ----------
  router.get('/api/v1/imports', () => ({ items: listImports(db) }));

  router.delete('/api/v1/imports', () => ({ removed: clearImports(db) }));

  router.post('/api/v1/imports', ({ body }) => {
    const payload = asObject(body);
    const filename = optionalString(payload, 'filename') ?? '未命名.csv';
    const rows = payload.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw badRequest('rows 必须是非空数组');
    }

    // 前端已经逐行校验过一遍，被前端拦下的行也要计入导入历史，
    // 否则历史会显示「0 失败」，与用户实际看到的结果不一致。
    const clientErrors = Array.isArray(payload.clientErrors)
      ? (payload.clientErrors as unknown[]).map((item) => String(item))
      : [];
    const totalRows =
      optionalNumber(payload, 'totalRows') ?? rows.length + clientErrors.length;

    const errors: string[] = [];
    let successRows = 0;

    db.exec('BEGIN');
    try {
      rows.forEach((row, index) => {
        const lineNo = index + 1;
        try {
          const item = asObject(row, `第 ${lineNo} 行`);
          createProduct(db, {
            name: requiredString(item, 'productName', '商品名称'),
            category: requireCategoryName(item),
            brand: optionalString(item, 'brand'),
            model: optionalString(item, 'model'),
            condition: optionalCondition(item),
            price: requireCents(item, 'buyPrice', '买入价'),
            priceType: 'manual',
            description: optionalString(item, 'description'),
            origin: 'import',
          });
          successRows += 1;
        } catch (error) {
          errors.push(`导入行 ${lineNo}：${(error as Error).message}`);
        }
      });

      const allErrors = [...clientErrors, ...errors];
      const record = recordImport(db, {
        filename,
        totalRows,
        successRows,
        failedRows: allErrors.length,
        errors: allErrors.slice(0, 50),
      });
      db.exec('COMMIT');
      return {
        record,
        successRows,
        failedRows: allErrors.length,
        errors: allErrors.slice(0, 50),
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}
