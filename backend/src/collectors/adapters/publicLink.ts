import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type {
  AdapterResult,
  CollectedItem,
  CollectionAdapter,
  HistoryResult,
  LinkFetchResult,
  LinkMetadata,
  SourceStatus,
} from '../types.ts';

const DESCRIPTOR = {
  id: 'user-link',
  name: '用户提供公开链接',
  mode: 'user_link' as const,
  legalNote:
    '仅对用户逐条提交的公开页面做一次无登录 HTTP 读取；不批量搜索、不使用账号、不绕过验证码或访问限制。',
  requiresCredential: false,
  capabilities: ['status', 'detail', 'link_import'] as const,
  fields: ['页面标题', '页面描述', '页面图片', '品牌', '型号', '页面报价'],
  limits: [
    '单链接单次读取',
    '遵守 robots.txt',
    '遇到 401/403/429 或风控页面立即停止',
    '页面报价只能标记为挂牌价',
  ],
};

const MAX_BODY_BYTES = 2_000_000;
const MAX_ROBOTS_BYTES = 128_000;

type HostResolver = (
  host: string
) => Promise<Array<{ address: string; family: number }>>;

interface LinkDependencies {
  fetchImpl: typeof fetch;
  resolveHost: HostResolver;
}

const defaultDependencies: LinkDependencies = {
  fetchImpl: fetch,
  resolveHost: (host) => lookup(host, { all: true, verbatim: true }),
};

export interface UserLinkAdapterOptions {
  /** 测试时注入，生产环境默认使用全局 fetch。 */
  fetchImpl?: typeof fetch;
  /** 测试时注入，生产环境默认使用 DNS 解析。 */
  resolveHost?: HostResolver;
  /** 单页读取超时时间，默认 8000ms。 */
  requestTimeoutMs?: number;
  /** robots.txt 读取超时时间，默认 4000ms。 */
  robotsTimeoutMs?: number;
}

class PublicLinkError extends Error {
  readonly blocked: boolean;

  constructor(message: string, blocked = false) {
    super(message);
    this.name = 'PublicLinkError';
    this.blocked = blocked;
  }
}

export function normalizePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new PublicLinkError('商品链接格式不合法', true);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PublicLinkError('只支持 http 或 https 公开链接', true);
  }
  if (url.username || url.password) {
    throw new PublicLinkError('链接不能包含账号或密码', true);
  }
  url.hash = '';
  return url;
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const version = isIP(normalized);
  if (version === 4) {
    const parts = normalized.split('.').map(Number);
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && parts[2] === 0) ||
      (a === 192 && b === 0 && parts[2] === 2) ||
      (a === 198 && b === 51 && parts[2] === 100) ||
      (a === 203 && b === 0 && parts[2] === 113) ||
      a === 0 ||
      a >= 224
    );
  }
  if (version === 6) {
    const mapped = normalized.startsWith('::ffff:')
      ? normalized.slice('::ffff:'.length)
      : undefined;
    if (mapped) {
      if (mapped.includes('.')) return isPrivateAddress(mapped);
      const groups = mapped.split(':');
      if (groups.length === 2) {
        const high = Number.parseInt(groups[0], 16);
        const low = Number.parseInt(groups[1], 16);
        if (Number.isInteger(high) && Number.isInteger(low)) {
          return isPrivateAddress(
            `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
          );
        }
      }
    }
    const value = normalized;
    return (
      value === '::1' ||
      value === '::' ||
      value.startsWith('fc') ||
      value.startsWith('fd') ||
      value.startsWith('fe80:')
    );
  }
  return true;
}

async function assertPublicHost(
  url: URL,
  resolveHost: HostResolver
): Promise<void> {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new PublicLinkError('不允许读取本机或内网地址', true);
  }
  if (isIP(host) && isPrivateAddress(host)) {
    throw new PublicLinkError('不允许读取本机或内网地址', true);
  }
  if (isIP(host)) return;
  const addresses = await resolveHost(host);
  if (addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new PublicLinkError(
      '链接主机解析到本机、内网或保留地址，已拒绝读取',
      true
    );
  }
}

export function sanitizeUrlForLog(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return 'invalid-link';
  }
}

export function linkExternalId(sourceUrl: string): string {
  return createHash('sha256').update(sourceUrl).digest('base64url');
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('页面内容过大，已拒绝读取');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        throw new Error('页面内容超过大小限制，已拒绝读取');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

async function fetchText(
  rawUrl: string,
  options: { maxBytes: number; timeoutMs: number; htmlOnly?: boolean },
  dependencies: LinkDependencies
): Promise<{ response: Response; text: string; finalUrl: string }> {
  let current = normalizePublicUrl(rawUrl);
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    await assertPublicHost(current, dependencies.resolveHost);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response;
    try {
      response = await dependencies.fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: options.htmlOnly
            ? 'text/html,application/xhtml+xml'
            : 'text/plain,text/html;q=0.8,*/*;q=0.1',
          'user-agent': 'DaoyeRadar/0.1 single-user-link-check',
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`页面返回 ${response.status} 重定向但缺少目标地址`);
      if (redirectCount === 3) throw new Error('页面重定向次数超过 3 次');
      current = normalizePublicUrl(new URL(location, current).toString());
      continue;
    }
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      throw new PublicLinkError(
        `页面返回 ${response.status}，需要登录、授权或触发限流，已停止读取`,
        true
      );
    }
    if (!response.ok) {
      throw new Error(`页面读取失败（HTTP ${response.status}）`);
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (options.htmlOnly && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error(`页面不是 HTML 内容（${contentType || '未知类型'}）`);
    }
    const text = await readLimitedText(response, options.maxBytes);
    return { response, text, finalUrl: current.toString() };
  }
  throw new Error('页面重定向处理失败');
}

function parseRobots(content: string, pathname: string): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: { agents: string[]; rules: Array<{ allow: boolean; path: string }> } | undefined;
  for (const originalLine of content.split(/\r?\n/)) {
    const line = originalLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const exact = groups.find((group) => group.agents.includes('daoyeradar'));
  const wildcard = groups.find((group) => group.agents.includes('*'));
  const rules = (exact ?? wildcard)?.rules ?? [];
  const matches = rules
    .filter((rule) => rule.path && pathname.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length);
  return matches[0]?.allow ?? true;
}

async function assertRobotsAllows(
  url: URL,
  dependencies: LinkDependencies,
  timeoutMs: number
): Promise<void> {
  const robotsUrl = new URL('/robots.txt', url.origin).toString();
  try {
    const result = await fetchText(robotsUrl, {
      maxBytes: MAX_ROBOTS_BYTES,
      timeoutMs,
    }, dependencies);
    if (!parseRobots(result.text, url.pathname)) {
      throw new PublicLinkError('目标页面被 robots.txt 禁止读取', true);
    }
  } catch (error) {
    if (error instanceof PublicLinkError) throw error;
    const message = error instanceof Error ? error.message : '未知错误';
    if (message.includes('HTTP 404') || message.includes('HTTP 410')) return;
    throw new Error(`无法确认 robots.txt 是否允许读取：${message}`);
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}

function tagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function findProductJson(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProductJson(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const type = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
  if (type.some((item) => String(item).toLowerCase() === 'product')) return record;
  for (const child of Object.values(record)) {
    const found = findProductJson(child);
    if (found) return found;
  }
  return undefined;
}

function firstOffer(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return value.map(firstOffer).find(Boolean);
  if (!value || typeof value !== 'object') return undefined;
  return value as Record<string, unknown>;
}

function parseJsonLd(html: string): Partial<LinkMetadata> {
  const scripts = [
    ...html.matchAll(
      /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];
  for (const match of scripts) {
    try {
      const product = findProductJson(JSON.parse(match[1].trim()));
      if (!product) continue;
      const offer = firstOffer(product.offers);
      const priceValue = offer?.price ?? offer?.lowPrice;
      const price = Number(priceValue);
      return {
        title: typeof product.name === 'string' ? product.name : undefined,
        description:
          typeof product.description === 'string' ? product.description : undefined,
        image:
          typeof product.image === 'string'
            ? product.image
            : Array.isArray(product.image) && typeof product.image[0] === 'string'
              ? product.image[0]
              : undefined,
        brand:
          typeof product.brand === 'string'
            ? product.brand
            : product.brand && typeof product.brand === 'object'
              ? String((product.brand as Record<string, unknown>).name ?? '')
              : undefined,
        model:
          typeof product.model === 'string'
            ? product.model
            : typeof product.mpn === 'string'
              ? product.mpn
              : undefined,
        price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : undefined,
        currency:
          typeof offer?.priceCurrency === 'string' ? offer.priceCurrency.toUpperCase() : undefined,
      };
    } catch {
      continue;
    }
  }
  return {};
}

export function parseHtmlMetadata(html: string, sourceUrl: string): LinkMetadata {
  const meta: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = tagAttributes(match[0]);
    const key = (attributes.property ?? attributes.name ?? '').toLowerCase();
    if (key && attributes.content) meta[key] = attributes.content.trim();
  }
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const jsonLd = parseJsonLd(html);
  const ogPrice = Number(meta['product:price:amount'] ?? meta['og:price:amount']);
  return {
    title:
      meta['og:title'] ??
      jsonLd.title ??
      (titleMatch ? decodeHtml(titleMatch[1]).trim() : undefined),
    description: meta['og:description'] ?? meta.description ?? jsonLd.description,
    image: meta['og:image'] ?? jsonLd.image,
    brand: meta['product:brand'] ?? jsonLd.brand,
    model: meta['product:model'] ?? jsonLd.model,
    price:
      jsonLd.price ??
      (Number.isFinite(ogPrice) && ogPrice > 0 ? Math.round(ogPrice * 100) : undefined),
    currency:
      meta['product:price:currency']?.toUpperCase() ??
      meta['og:price:currency']?.toUpperCase() ??
      jsonLd.currency,
    sourceUrl,
  };
}

export class UserLinkAdapter implements CollectionAdapter {
  readonly descriptor = {
    ...DESCRIPTOR,
    capabilities: [...DESCRIPTOR.capabilities],
  };

  private readonly dependencies: LinkDependencies;
  private readonly requestTimeoutMs: number;
  private readonly robotsTimeoutMs: number;

  constructor(options: UserLinkAdapterOptions = {}) {
    this.dependencies = {
      fetchImpl: options.fetchImpl ?? defaultDependencies.fetchImpl,
      resolveHost: options.resolveHost ?? defaultDependencies.resolveHost,
    };
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8_000;
    this.robotsTimeoutMs = options.robotsTimeoutMs ?? 4_000;
  }

  async checkStatus(): Promise<SourceStatus> {
    return {
      status: 'ok',
      message: '公开链接入口已就绪：逐条读取、遵守 robots.txt，不处理登录或验证码页面。',
      checkedAt: new Date().toISOString(),
    };
  }

  async fetchMetadata(rawUrl: string): Promise<LinkFetchResult> {
    try {
      const url = normalizePublicUrl(rawUrl);
      await assertRobotsAllows(url, this.dependencies, this.robotsTimeoutMs);
      const result = await fetchText(url.toString(), {
        maxBytes: MAX_BODY_BYTES,
        timeoutMs: this.requestTimeoutMs,
        htmlOnly: true,
      }, this.dependencies);
      return {
        status: 'ok',
        message: '已读取公开页面元数据。页面报价仅作为挂牌价候选，不代表成交价。',
        metadata: parseHtmlMetadata(result.text, result.finalUrl),
      };
    } catch (error) {
      const blocked = error instanceof PublicLinkError && error.blocked;
      return {
        status: 'unavailable',
        message: error instanceof Error ? error.message : '公开页面读取失败',
        blocked,
      };
    }
  }

  async searchProducts(): Promise<AdapterResult> {
    return {
      status: 'unavailable',
      message: '公开链接数据源不支持关键词搜索，只能由用户逐条提交链接。',
      items: [],
    };
  }

  async getProductDetail(rawUrl: string): Promise<AdapterResult> {
    let sourceUrl = rawUrl;
    try {
      const decoded = Buffer.from(rawUrl, 'base64url').toString('utf8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        sourceUrl = decoded;
      }
    } catch {
      // 非 base64url 的输入仍按用户直接提交的链接处理。
    }
    const result = await this.fetchMetadata(sourceUrl);
    if (!result.metadata) {
      return {
        status: result.status,
        message: result.message,
        items: [],
      };
    }
    const metadata = result.metadata;
    const prices =
      metadata.price && metadata.currency
        ? [
            {
              platform: '公开网页',
              priceType: 'listing' as const,
              price: metadata.price,
              currency: metadata.currency,
              collectedAt: new Date().toISOString(),
              sourceUrl: metadata.sourceUrl,
              confidence: 0.55,
              notes: '来自页面结构化元数据，仅代表用户提交时的页面标价，不代表成交价',
            },
          ]
        : [];
    return {
      status: result.status,
      message: result.message,
      items: [
        {
          sourceId: this.descriptor.id,
          externalId: linkExternalId(metadata.sourceUrl),
          sourceRef: metadata.sourceUrl,
          sourceUrl: metadata.sourceUrl,
          name: metadata.title ?? '未命名商品',
          brand: metadata.brand,
          model: metadata.model,
          condition: metadata.condition ?? 'unknown',
          description: metadata.description,
          images: metadata.image ? [metadata.image] : [],
          prices,
          dataSource: '用户提供的公开页面元数据（未登录、单次读取）',
          warnings: ['页面元数据可能过时、缺失或被卖家修改，使用前需回到原页面核对'],
        },
      ],
    };
  }

  async getPriceHistory(): Promise<HistoryResult> {
    return {
      status: 'unavailable',
      message: '公开页面不会提供可验证的成交历史；系统只能保留后续重复读取到的挂牌价变化。',
      records: [],
    };
  }
}

export function metadataToCollectedItem(
  metadata: LinkMetadata,
  externalId: string,
  dataSource: string
): CollectedItem {
  const prices =
    metadata.price && metadata.currency
      ? [
          {
            platform: '公开网页',
            priceType: 'listing' as const,
            price: metadata.price,
            currency: metadata.currency,
            collectedAt: new Date().toISOString(),
            sourceUrl: metadata.sourceUrl,
            confidence: 0.55,
            notes: '页面结构化元数据报价，仅作为挂牌价候选',
          },
        ]
      : [];
  return {
    sourceId: 'user-link',
    externalId,
    sourceRef: metadata.sourceUrl,
    sourceUrl: metadata.sourceUrl,
    name: metadata.title ?? '未命名商品',
    brand: metadata.brand,
    model: metadata.model,
    condition: metadata.condition ?? 'unknown',
    description: metadata.description,
    images: metadata.image ? [metadata.image] : [],
    prices,
    dataSource,
    warnings: ['页面元数据不保证完整或最新，必须回到原始链接核对'],
  };
}
