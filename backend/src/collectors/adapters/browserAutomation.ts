/**
 * 闲鱼「本机浏览器自动化」采集适配器。
 *
 * 与 user-link 适配器的区别：这里由本机专用浏览器渲染正常网页后，
 * 从 DOM 读取关键词搜索结果，属于用户在自己电脑上主动发起的采集。
 * 仍然遵守同一套边界：不登录绕过、不伪造签名、遇到验证码立即停。
 */

import { createHash } from 'node:crypto';
import type { SellerProfile } from '@daoye/shared';
import type {
  AdapterResult,
  CollectedItem,
  CollectionAdapter,
  HistoryResult,
  RawCardLike,
  SourceDescriptor,
  SourceStatus,
} from '../types.ts';
import {
  browserSession,
  type CollectOptions,
  type CollectOutcome,
} from '../browserSession.ts';

const DESCRIPTOR: SourceDescriptor = {
  id: 'xianyu-browser',
  name: '闲鱼本机浏览器采集（需自行登录）',
  mode: 'browser',
  legalNote:
    '在你本机的专用浏览器窗口中登录闲鱼网页版，程序从正常渲染的搜索结果页读取公开展示的商品信息；不调用站内接口、不伪造签名、不绕过验证码或风控。',
  requiresCredential: false,
  capabilities: ['status', 'search'],
  fields: ['标题', '挂牌价格', '商品链接', '图片', '发布时间'],
  limits: [
    '需要你先在专用浏览器窗口里自行完成闲鱼登录',
    '只读取搜索结果页可见卡片，不做详情页深挖',
    '遇到验证码、滑块、风控页或登录失效立即停止',
    '挂牌价固定记为 listing，绝不当作成交价',
    '不支持账号轮换、代理轮换、并发批量采集',
  ],
};

export function productExternalId(sourceUrl: string): string {
  return createHash('sha256').update(sourceUrl).digest('base64url');
}

function normalizeConditionFromTitle(title: string | undefined): string {
  if (!title) return 'unknown';
  if (/未拆封|全新|99\s*新/.test(title)) return '99new';
  if (/95\s*新|准新/.test(title)) return '95new';
  if (/9\s*成新|9新/.test(title)) return '9new';
  if (/8\s*成新|8新/.test(title)) return '8new';
  return 'unknown';
}

export function rawCardToCollectedItem(card: RawCardLike, keyword: string): CollectedItem {
  const externalId = productExternalId(card.sourceUrl);
  const condition = normalizeConditionFromTitle(card.title);
  const warnings = [
    '数据来自本机浏览器渲染的搜索结果页，页面结构变化可能导致字段缺失',
    '挂牌价不代表成交价，使用前请回到原链接核对',
  ];
  if (card.missingFields.length > 0) {
    warnings.push(`页面未展示字段：${card.missingFields.join('、')}`);
  }
  if (!card.seller) {
    warnings.push('搜索列表页未展示卖家信誉信息，卖家信誉维度会标记为无法确认');
  }

  const prices = card.priceYuan
    ? [
        {
          platform: '闲鱼',
          priceType: 'listing' as const,
          // 页面价格单位是「元」，入库统一按「分」。
          price: Math.round(card.priceYuan * 100),
          currency: 'CNY',
          condition,
          collectedAt: new Date().toISOString(),
          sourceUrl: card.sourceUrl,
          confidence: 0.6,
          notes: '搜索结果页渲染价格，仅代表挂牌价候选',
        },
      ]
    : [];

  return {
    sourceId: 'xianyu-browser',
    externalId,
    sourceRef: card.sourceUrl,
    sourceUrl: card.sourceUrl,
    name: card.title ?? `闲鱼商品（${card.sourceUrl}）`,
    condition,
    description: card.publishTimeText
      ? `页面展示的发布时间：${card.publishTimeText}（关键词：${keyword}）`
      : `关键词：${keyword}`,
    seller: card.seller,
    images: card.imageUrl ? [card.imageUrl] : [],
    prices,
    dataSource: '闲鱼本机浏览器采集（搜索结果页公开渲染数据）',
    warnings,
  };
}

export class BrowserAutomationAdapter implements CollectionAdapter {
  readonly descriptor = { ...DESCRIPTOR };

  async checkStatus(): Promise<SourceStatus> {
    // 状态检查必须无副作用：绝不在这里启动或连接浏览器，
    // 否则用户在「数据录入」页点一次「检查」就会弹出一个浏览器窗口。
    if (!browserSession.launched) {
      return {
        status: 'unavailable',
        message:
          browserSession.currentMode === 'connect'
            ? '尚未连接到你启动的浏览器；请到「本机采集」页面发起连接'
            : '专用浏览器尚未启动；请到「本机采集」页面点击「启动专用浏览器」',
        checkedAt: new Date().toISOString(),
      };
    }
    try {
      const status = await browserSession.loginStatus();
      return {
        status: status.loggedIn ? 'ok' : 'unavailable',
        message: status.message,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        message: `浏览器状态检查失败：${error instanceof Error ? error.message : '未知错误'}`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async searchProducts(query: string, limit: number): Promise<AdapterResult> {
    const result = await collectBrowserCards({ keyword: query, maxItems: limit });
    return {
      status: result.status,
      message: result.message,
      items: result.items,
    };
  }

  async getProductDetail(_externalId: string): Promise<AdapterResult> {
    return {
      status: 'unavailable',
      message: '本机浏览器采集当前只覆盖搜索结果页，不单独深挖详情页',
      items: [],
    };
  }

  async getPriceHistory(_externalId: string): Promise<HistoryResult> {
    return {
      status: 'unavailable',
      message: '浏览器采集不提供成交历史；价格历史由系统按重复采集的挂牌价累积',
      records: [],
    };
  }
}

export function createBrowserAutomationAdapter(): BrowserAutomationAdapter {
  return new BrowserAutomationAdapter();
}

export interface BrowserCollectResult {
  status: SourceStatus['status'];
  message: string;
  items: CollectedItem[];
  /** 与 items 一一对应的元信息：字段完整度与采集时间。 */
  entries: BrowserCollectedEntry[];
  skipped: Array<{ sourceUrl: string; reason: string }>;
  loginRequired: boolean;
  riskBlocked: boolean;
  accessDenied: boolean;
  /** 本次请求应用 / 实际确认生效的官方筛选条件。 */
  filtersRequested: string[];
  filtersApplied: string[];
  /** 筛选未生效时页面上实际可见的筛选项文案。 */
  filterCandidates: string[];
  /** 卖家信誉诊断：页面正文里出现的信誉关键词与上下文片段。 */
  sellerDiagnostics?: { keywords: string[]; snippets: string[] };
  /** 页面总共识别到的卡片数（含字段不全的）。 */
  cardsSeen: number;
}

export interface BrowserCollectedEntry {
  item: CollectedItem;
  /** 页面没有展示出来的字段。 */
  missingFields: string[];
  /** 实际读取到的字段，用于界面展示字段完整度。 */
  capturedFields: string[];
  collectedAt: string;
}

/** 列出这张卡片实际读到的字段，供界面展示完整度。 */
function capturedFieldsOf(card: {
  title?: string;
  priceYuan?: number;
  imageUrl?: string;
  publishTimeText?: string;
  seller?: SellerProfile;
}): string[] {
  const captured = ['商品链接'];
  if (card.title) captured.push('标题');
  if (card.priceYuan !== undefined) captured.push('挂牌价');
  if (card.imageUrl) captured.push('图片');
  if (card.publishTimeText) captured.push('发布时间');
  if (normalizeConditionFromTitle(card.title) !== 'unknown') captured.push('成色');
  if (card.seller) captured.push('卖家信誉');
  return captured;
}

/**
 * 采集一轮关键词搜索结果，并转换为可入库的 CollectedItem。
 * 缺少价格或标题的卡片不会入库，而是进入 skipped 列表，便于界面如实展示。
 */
export async function collectBrowserCards(
  options: CollectOptions
): Promise<BrowserCollectResult> {
  const outcome: CollectOutcome = await browserSession.collect(options);
  const usable = outcome.items.filter((card) => card.priceYuan !== undefined && card.title);
  const blockedByField = outcome.items
    .filter((card) => card.priceYuan === undefined || !card.title)
    .map((card) => ({
      sourceUrl: card.sourceUrl,
      reason: `页面未展示${card.title ? '价格' : '标题'}，未入库`,
    }));

  const collectedAt = new Date().toISOString();
  const entries: BrowserCollectedEntry[] = usable.map((card) => ({
    item: rawCardToCollectedItem(card, options.keyword),
    missingFields: card.missingFields,
    capturedFields: capturedFieldsOf(card),
    collectedAt,
  }));
  const items = entries.map((entry) => entry.item);

  const status: SourceStatus['status'] =
    outcome.accessDenied || outcome.riskBlocked
      ? 'unavailable'
      : items.length > 0
        ? 'ok'
        : 'unavailable';
  const message = outcome.stoppedReason
    ? outcome.stoppedReason
    : items.length > 0
      ? `采集到 ${items.length} 条挂牌候选${outcome.skipped.length ? `，另有 ${outcome.skipped.length} 条字段不全` : ''}`
      : '未在页面上读到可入库的商品卡片';

  return {
    status,
    message,
    items,
    entries,
    skipped: [...outcome.skipped, ...blockedByField],
    loginRequired: outcome.loginRequired,
    riskBlocked: outcome.riskBlocked,
    accessDenied: outcome.accessDenied,
    filtersRequested: outcome.filtersRequested ?? [],
    filtersApplied: outcome.filtersApplied ?? [],
    filterCandidates: outcome.filterCandidates ?? [],
    ...(outcome.sellerDiagnostics ? { sellerDiagnostics: outcome.sellerDiagnostics } : {}),
    cardsSeen: outcome.items.length,
  };
}
