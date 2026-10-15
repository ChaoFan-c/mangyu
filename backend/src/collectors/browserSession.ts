/**
 * 本机浏览器采集会话。
 *
 * 设计要点：
 * - 使用 Playwright 启动一个「专用」持久化配置目录，用户在该窗口里
 *   自行登录闲鱼网页版；程序不读取、不导出、不复制任何日常浏览器资料。
 * - 只从渲染后的搜索结果页 DOM 读取公开展示的卡片信息（标题 / 挂牌价 / 链接等）。
 * - 不调用站内接口、不伪造签名、不绕过验证码或风控；一旦检测到
 *   验证码、滑块、风控页或登录失效，立刻停止并如实报告。
 * - 绝不把 Cookie / 登录凭据写进日志或文件；登录态只留在专用配置目录里。
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { SellerProfile } from '@daoye/shared';
import { applyOfficialFilters } from './browserFilters.ts';


const here = dirname(fileURLToPath(import.meta.url));

/** 专用配置目录：不指向用户日常浏览器，登录态只落在这里。 */
export const BROWSER_PROFILE_DIR =
  process.env.MANGYU_BROWSER_PROFILE_DIR ??
  resolve(here, '../../..', 'work/browser-profile/xianyu-collector');

const SEARCH_URL_TEMPLATE = 'https://www.goofish.com/search?q={keyword}';
const HOME_URL = 'https://www.goofish.com/';

/**
 * 浏览器接入方式：
 * - `launch`：本程序启动一个专用浏览器窗口（默认）。
 * - `connect`：你自己先启动一个带调试端口的浏览器，程序通过 CDP 连接上去。
 *   这种方式下浏览器完全由你启动和控制，程序只附着读取页面。
 */
export type BrowserMode = 'launch' | 'connect';

export const DEFAULT_CDP_URL = 'http://127.0.0.1:9222';

/** 登录态只按 Cookie 名称判断，绝不读取或记录 Cookie 值。 */
const LOGIN_COOKIE_NAMES = ['unb', 'cookie2', '_m_h5_tk'];

/** 风控 / 验证码信号：命中即停止，不做任何绕过尝试。 */
const RISK_URL_MARKERS = ['_____tmd_____', '/punish', 'x5secdata=', 'captcha', 'login.taobao'];
const RISK_DOM_SELECTORS = [
  '#nc_1_wrapper',
  '.nc-container',
  '.baxia-dialog',
  '[id*="captcha"]',
  '[class*="slider-verify"]',
];

/** 「下一页」兜底控件：闲鱼搜索以无限滚动为主，这里只作为兜底。 */
const NEXT_PAGE_SELECTORS = [
  'button:has-text("下一页")',
  'a:has-text("下一页")',
  '[aria-label="下一页"]',
  '[class*="pagination"] [class*="next"]',
];

/**
 * 站点主动拒绝访问时的页面文案。
 * 实测（2026-10-15，自动化浏览器）闲鱼搜索页会返回：
 *   「非法访问 / 为了保障您的体验，请使用正常浏览器访问闲鱼~」
 * 命中这些文案说明是平台拒绝，而不是「页面结构变了读不到字段」，
 * 两者必须区分报告，否则会把平台拦截误报成采集失败。
 */
const ACCESS_DENIED_MARKERS = [
  '非法访问',
  '请使用正常浏览器访问',
  '为了保障您的体验',
  '访问被拒绝',
  '检测到异常流量',
];

/** 纯函数：从页面文本判断是否为站点拒绝页。便于单独测试。 */
export function detectAccessDeniedText(text: string): string | null {
  const normalized = (text ?? '').replace(/\s+/g, '');
  const hit = ACCESS_DENIED_MARKERS.find((marker) =>
    normalized.includes(marker.replace(/\s+/g, ''))
  );
  return hit ? `站点主动拒绝访问（页面文案命中「${hit}」）` : null;
}

export type WaitDecision = 'found' | 'stop' | 'wait';

/**
 * 纯函数：等待商品卡片渲染时，决定继续等待还是结束。
 * 结果页是前端渲染的，慢网络下固定 sleep 会误判成「没有商品」，
 * 因此改成轮询；这里把「继续等 / 已找到 / 应停止」的判定独立出来便于测试。
 */
export function decideWaitOutcome(state: {
  cardCount: number;
  accessDenied: boolean;
  risk: boolean;
}): WaitDecision {
  if (state.accessDenied || state.risk) return 'stop';
  return state.cardCount > 0 ? 'found' : 'wait';
}

/** 页面内一次性取回卡片数与正文片段，减少轮询往返。 */
const PROBE_SCRIPT = `(() => {
  var cardCount = document.querySelectorAll('a[href*="/item"]').length;
  var text = (document.body && document.body.innerText) || '';
  return { cardCount: cardCount, text: text.slice(0, 2000) };
})()`;

export interface BrowserLoginStatus {
  /** 当前接入方式：程序启动专用浏览器，或连接到你自己启动的浏览器。 */
  mode: BrowserMode;
  launched: boolean;
  loggedIn: boolean;
  message: string;
  url?: string;
}

/** 从页面里读出的原始卡片，字段可能缺失。 */
export interface RawCard {
  sourceUrl: string;
  title?: string;
  priceYuan?: number;
  imageUrl?: string;
  publishTimeText?: string;
  location?: string;
  /** 页面上实际展示的卖家信誉信息；没有展示就留空。 */
  seller?: SellerProfile;
  missingFields: string[];
}

export interface CollectOptions {
  keyword: string;
  /**
   * 需要应用的闲鱼官网筛选条件。
   * 只做「正常页面操作」：定位官方控件并点击，点完必须能确认状态变化，
   * 确认不了就停止采集并如实报告，不假装筛选成功。
   */
  filters?: {
    /** 个人闲置。 */
    personalOnly?: boolean;
    /** 发布时间筛选：3 天内。 */
    publishWithinDays?: 3;
  };
  /** 最多加载多少屏（滚动次数）。 */
  maxScrolls?: number;
  /** 最多翻多少页（含第 1 页），默认 3，上限 10。 */
  maxPages?: number;
  /** 最多返回多少条卡片。 */
  maxItems?: number;
  /** 每次滚动后的等待时间，默认 1500ms。 */
  scrollDelayMs?: number;
}

export interface CollectOutcome {
  items: RawCard[];
  skipped: Array<{ sourceUrl: string; reason: string }>;
  stoppedReason?: string;
  loginRequired: boolean;
  riskBlocked: boolean;
  /** 站点明确拒绝访问（例如「请使用正常浏览器访问」）。 */
  accessDenied: boolean;
  /** 本次请求应用/实际确认生效的官方筛选条件，用于如实展示与记录。 */
  filtersRequested?: string[];
  filtersApplied?: string[];
  /** 筛选未生效时，页面上实际可见的筛选项文案。 */
  filterCandidates?: string[];
  /** 卖家信誉诊断：页面正文里出现的信誉关键词与上下文片段。 */
  sellerDiagnostics?: { keywords: string[]; snippets: string[] };
}

function isRiskUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return RISK_URL_MARKERS.some((marker) => lower.includes(marker));
}

class BrowserSession {
  private context: BrowserContext | null = null;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private launchPromise: Promise<void> | null = null;
  private readOnlyNotes: string[] = [];
  private mode: BrowserMode = 'launch';
  private cdpUrl: string = DEFAULT_CDP_URL;

  get lastNotes(): string[] {
    return [...this.readOnlyNotes];
  }

  private note(message: string): void {
    this.readOnlyNotes.push(message);
    if (this.readOnlyNotes.length > 20) this.readOnlyNotes.shift();
  }

  private get headless(): boolean {
    return process.env.DAOYE_BROWSER_HEADLESS === '1';
  }

  /**
   * 使用的浏览器通道。
   * 默认优先调用本机已安装的 Google Chrome（更接近「正常浏览器」），
   * 不可用时回退到 Playwright 自带的 Chromium。
   * 这里只选择浏览器可执行文件，不做任何指纹伪装。
   */
  private get channel(): 'chrome' | undefined {
    const fromEnv = process.env.DAOYE_BROWSER_CHANNEL;
    if (fromEnv === 'chromium') return undefined;
    if (fromEnv === 'chrome') return 'chrome';
    return 'chrome';
  }

  get launched(): boolean {
    return this.context !== null && this.page !== null;
  }

  get currentMode(): BrowserMode {
    return this.mode;
  }

  get currentCdpUrl(): string {
    return this.cdpUrl;
  }

  /**
   * 选择接入方式。已连接时不允许切换，必须先停止，避免出现两个会话。
   */
  configure(options: { mode?: BrowserMode; cdpUrl?: string }): void {
    if (this.launched && options.mode && options.mode !== this.mode) {
      throw new Error('浏览器已连接，请先点击「停止」再切换接入方式');
    }
    if (options.mode) this.mode = options.mode;
    if (options.cdpUrl) {
      let parsed: URL;
      try {
        parsed = new URL(options.cdpUrl);
      } catch {
        throw new Error('调试地址格式不合法，例如 http://127.0.0.1:9222');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('调试地址只支持 http 或 https');
      }
      if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
        throw new Error('调试地址必须是本机地址（127.0.0.1 或 localhost）');
      }
      this.cdpUrl = parsed.toString().replace(/\/$/, '');
    }
  }

  /** 启动专用浏览器；重复调用是幂等的。 */
  async ensureLaunched(): Promise<void> {
    if (this.launched) return;
    if (this.launchPromise) return this.launchPromise;

    this.launchPromise = (async () => {
      if (this.mode === 'connect') {
        // 附着到你已经启动好的浏览器：程序不创建任何浏览器进程。
        const browser = await chromium.connectOverCDP(this.cdpUrl, { timeout: 15_000 });
        this.browser = browser;
        const context = browser.contexts()[0] ?? (await browser.newContext());
        this.context = context;
        this.note(`已连接到 ${this.cdpUrl} 上的浏览器`);
      } else {
        mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });
        const shared = {
          headless: this.headless,
          viewport: { width: 1440, height: 900 },
          locale: 'zh-CN' as const,
          timezoneId: 'Asia/Shanghai',
          args: [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-features=Translate,BackForwardCache',
          ],
        };
        const channel = this.channel;
        let context: BrowserContext;
        try {
          context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
            ...shared,
            ...(channel ? { channel } : {}),
          });
        } catch (error) {
          if (!channel) throw error;
          // 本机没有 Google Chrome 时回退到 Playwright 自带 Chromium。
          context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, shared);
        }
        this.context = context;
      }

      const context = this.context!;
      this.page = context.pages()[0] ?? (await context.newPage());
      this.page.setDefaultTimeout(30_000);
      this.page.setDefaultNavigationTimeout(45_000);
      this.page.on('dialog', (dialog) => {
        void dialog.dismiss().catch(() => undefined);
      });
    })();

    try {
      await this.launchPromise;
    } finally {
      this.launchPromise = null;
    }
  }

  /** 检测风控 / 验证码信号。 */
  private async detectRisk(page: Page): Promise<string | null> {
    if (isRiskUrl(page.url())) {
      return `页面地址命中风控标记：${page.url().split('?')[0]}`;
    }
    for (const selector of RISK_DOM_SELECTORS) {
      const handle = await page.$(selector);
      if (handle && (await handle.isVisible().catch(() => false))) {
        return `页面出现验证码 / 滑块组件（${selector}）`;
      }
    }
    return null;
  }

  /** 检测站点拒绝页（「非法访问 / 请使用正常浏览器访问」）。 */
  private async detectAccessDenied(page: Page): Promise<string | null> {
    const text = await page
      .evaluate<string>('(document.body && document.body.innerText) || ""')
      .catch(() => '');
    return detectAccessDeniedText(text);
  }

  /**
   * 卖家信誉诊断：在页面正文里找信誉相关关键词，并截取上下文片段。
   * 只读文本，用于在「列表页确实不展示信誉」时给出可核对的证据，
   * 而不是只回一句「页面未展示」。
   */
  private async probeSellerText(
    page: Page
  ): Promise<{ keywords: string[]; snippets: string[] }> {
    const bodyText = await page
      .evaluate<string>('(document.body && document.body.innerText) || ""')
      .catch(() => '');
    const keywords = ['芝麻信用', '好评率', '已售', '信用', '卖家', '好评'];
    const hit = keywords.filter((keyword) => bodyText.includes(keyword));
    const snippets: string[] = [];
    for (const keyword of hit) {
      let from = 0;
      while (snippets.length < 5) {
        const index = bodyText.indexOf(keyword, from);
        if (index === -1) break;
        snippets.push(
          bodyText.slice(Math.max(0, index - 20), index + 60).replace(/\s+/g, ' ')
        );
        from = index + keyword.length;
      }
      if (snippets.length >= 5) break;
    }
    return { keywords: hit, snippets };
  }

  /**
   * 轮询等待商品卡片渲染完成。
   * 找到卡片、命中风控/拒绝页、或超时都会返回，由调用方统一报告结果。
   */
  private async waitForCards(page: Page, timeoutMs = 20_000, pollMs = 1_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let polls = 0;
    while (Date.now() < deadline) {
      const probe = await page
        .evaluate<{ cardCount: number; text: string }>(PROBE_SCRIPT)
        .catch(() => ({ cardCount: 0, text: '' }));
      polls += 1;
      const decision = decideWaitOutcome({
        cardCount: probe.cardCount,
        accessDenied: detectAccessDeniedText(probe.text) !== null,
        risk: isRiskUrl(page.url()),
      });
      if (decision !== 'wait') {
        this.note(
          `渲染等待结束：${decision === 'found' ? `已出现商品卡片（第 ${polls} 次轮询）` : '命中拦截页'}`
        );
        return;
      }
      await page.waitForTimeout(pollMs);
    }
    this.note(`等待商品卡片超时（${Math.round(timeoutMs / 1000)} 秒，共 ${polls} 次轮询）`);
  }

  /** 打开首页（供用户在该窗口登录）。 */
  async openHome(): Promise<BrowserLoginStatus> {
    await this.ensureLaunched();
    const page = this.page!;
    if (!page.url().startsWith('http')) {
      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
    }
    return this.loginStatus();
  }

  async loginStatus(): Promise<BrowserLoginStatus> {
    if (!this.launched) {
      return {
        mode: this.mode,
        launched: false,
        loggedIn: false,
        message:
          this.mode === 'connect'
            ? `尚未连接到你启动的浏览器（调试地址 ${this.cdpUrl}）`
            : '专用浏览器尚未启动',
      };
    }
    const page = this.page!;
    try {
      const cookies = await this.context!.cookies();
      const names = new Set(cookies.map((cookie) => cookie.name));
      const hasLoginCookie = LOGIN_COOKIE_NAMES.some((name) => names.has(name));

      const risk = await this.detectRisk(page);
      if (risk) {
        return {
          mode: this.mode,
          launched: true,
          loggedIn: false,
          message: risk,
          url: page.url(),
        };
      }

      if (hasLoginCookie) {
        return {
          mode: this.mode,
          launched: true,
          loggedIn: true,
          message: '已检测到闲鱼登录态（Cookie 名称匹配，未读取 Cookie 值）',
          url: page.url(),
        };
      }
      return {
        mode: this.mode,
        launched: true,
        loggedIn: false,
        message:
          this.mode === 'connect'
            ? '未检测到登录态，请在你自己的浏览器窗口中登录闲鱼网页版'
            : '未检测到登录态，请在弹出的专用浏览器窗口中登录闲鱼网页版',
        url: page.url(),
      };
    } catch (error) {
      return {
        mode: this.mode,
        launched: true,
        loggedIn: false,
        message: `检查登录状态失败：${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }

  /** 滚动加载更多卡片，返回是否已到底。 */
  private async loadMore(page: Page, scrolls: number, delayMs: number): Promise<void> {
    for (let index = 0; index < scrolls; index += 1) {
      const before = await page.evaluate<number>('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForTimeout(delayMs);
      const after = await page.evaluate<number>('document.body.scrollHeight');
      if (after <= before) break;
    }
    await page.evaluate('window.scrollTo(0, 0)');
    await page.waitForTimeout(300);
  }

  /**
   * 点击「下一页」。找不到或不可用时返回 false（视为没有更多）。
   * 只做正常点击，不模拟鼠标轨迹、不修改页面。
   */
  private async goToNextPage(page: Page): Promise<boolean> {
    for (const selector of NEXT_PAGE_SELECTORS) {
      const handle = await page.$(selector);
      if (!handle) continue;
      if (!(await handle.isVisible().catch(() => false))) continue;
      const disabled = await handle.getAttribute('disabled');
      const ariaDisabled = await handle.getAttribute('aria-disabled');
      if (disabled !== null || ariaDisabled === 'true') continue;
      try {
        await handle.click({ timeout: 5_000 });
        await page.waitForTimeout(2_000);
        this.note('已点击「下一页」');
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  /** 从当前渲染页面提取商品卡片（通用 DOM 提取，不依赖混淆类名）。 */
  async extractCardsFromPage(): Promise<RawCard[]> {
    if (!this.page) throw new Error('专用浏览器尚未启动');
    // 提取脚本在页面上下文执行；用字符串形式传入，避免给后端 tsconfig 引入 DOM 类型。
    const script = `(() => {
      var pricePatterns = [/[\\u00a5\\uffe5]\\s*(\\d[\\d,]*(?:\\.\\d+)?)/, /(\\d[\\d,]*(?:\\.\\d+)?)\\s*\\u5143/];
      var timePattern = /(\\u521a\\u521a|\\d+\\s*\\u5206\\u949f\\u524d|\\d+\\s*\\u5c0f\\u65f6\\u524d|\\d+\\s*\\u5929\\u524d|\\d+\\s*\\u4e2a\\u6708\\u524d|\\d+\\s*\\u6708\\u524d)/;
      var zhimaPattern = /\\u829d\\u9ebb\\u4fe1\\u7528[:\\uff1a\\s]*(\\u6781\\u597d|\\u4f18\\u79c0|\\u826f\\u597d|\\u4e2d\\u7b49|\\u8f83\\u5dee)/;
      var zhimaAltPattern = /\\u4fe1\\u7528\\s*(\\u6781\\u597d|\\u4f18\\u79c0|\\u826f\\u597d)/;
      var goodRatePattern = /\\u597d\\u8bc4\\u7387[:\\uff1a\\s]*([\\d.]+)\\s*%/;
      var goodRateAltPattern = /\\u597d\\u8bc4[:\\uff1a\\s]*([\\d.]+)\\s*%/;
      var soldPattern = /\\u5df2\\u552e\\s*(\\d[\\d,]*)|(\\d[\\d,]*)\\s*\\u4eba\\u4ed8\\u6b3e/;
      function readPrice(text) {
        for (var i = 0; i < pricePatterns.length; i += 1) {
          var match = text.match(pricePatterns[i]);
          if (match) {
            var value = Number.parseFloat(match[1].replace(/,/g, ''));
            if (Number.isFinite(value) && value > 0) return value;
          }
        }
        return undefined;
      }
      function normalize(text) { return String(text || '').replace(/\\s+/g, ' ').trim(); }
      var anchors = Array.prototype.slice.call(document.querySelectorAll('a[href]'));
      var seen = {};
      var results = [];
      for (var index = 0; index < anchors.length; index += 1) {
        var anchor = anchors[index];
        var href = anchor.href;
        if (!href || href.indexOf('goofish.com') === -1) continue;
        if (href.indexOf('/item') === -1) continue;
        if (href.indexOf('id=') === -1 && href.indexOf('/item/') === -1) continue;
        if (seen[href]) continue;
        seen[href] = true;
        var container = anchor;
        var node = anchor;
        for (var depth = 0; depth < 4 && node; depth += 1) {
          node = node.parentElement;
          if (!node) break;
          var nodeText = normalize(node.innerText);
          if (nodeText && nodeText.length < 600 && readPrice(nodeText) !== undefined) {
            container = node;
            break;
          }
        }
        var containerText = normalize(container.innerText);
        var image = container.querySelector('img');
        var altText = image && image.getAttribute('alt');
        var titleAttr = anchor.getAttribute('title');
        var anchorText = normalize(anchor.innerText || anchor.textContent);
        var title = (altText && altText.trim()) || (titleAttr && titleAttr.trim()) || anchorText || undefined;
        var priceYuan = readPrice(containerText);
        if (priceYuan === undefined) priceYuan = readPrice(anchorText);
        var timeMatch = containerText.match(timePattern);
        var zhimaMatch = containerText.match(zhimaPattern);
        var goodRateMatch = containerText.match(goodRatePattern);
        var soldMatch = containerText.match(soldPattern);
        if (!zhimaMatch) zhimaMatch = containerText.match(zhimaAltPattern);
        if (!goodRateMatch) goodRateMatch = containerText.match(goodRateAltPattern);
        var seller = {};
        if (zhimaMatch) seller.zhimaLevel = zhimaMatch[1];
        if (goodRateMatch) seller.goodRatePercent = parseFloat(goodRateMatch[1]);
        if (soldMatch) {
          var soldRaw = soldMatch[1] || soldMatch[2];
          if (soldRaw) seller.soldCount = parseInt(soldRaw.replace(/,/g, ''), 10);
        }
        results.push({
          sourceUrl: href,
          title: title ? title.slice(0, 200) : undefined,
          priceYuan: priceYuan,
          imageUrl: image && image.src ? image.src : undefined,
          publishTimeText: timeMatch ? timeMatch[1].trim() : undefined,
          seller: Object.keys(seller).length > 0 ? seller : undefined
        });
      }
      return results;
    })()`;
    const raw = await this.page.evaluate<Array<Record<string, unknown>>>(script);

    return raw.map((entry) => {
      const sourceUrl = String(entry.sourceUrl);
      const title = typeof entry.title === 'string' ? entry.title : undefined;
      const priceYuan = typeof entry.priceYuan === 'number' ? entry.priceYuan : undefined;
      const missingFields: string[] = [];
      if (!title) missingFields.push('标题');
      if (priceYuan === undefined) missingFields.push('价格');
      const rawSeller =
        entry.seller && typeof entry.seller === 'object'
          ? (entry.seller as Record<string, unknown>)
          : undefined;
      const seller: SellerProfile | undefined = rawSeller
        ? {
            ...(typeof rawSeller.zhimaLevel === 'string'
              ? { zhimaLevel: rawSeller.zhimaLevel }
              : {}),
            ...(typeof rawSeller.goodRatePercent === 'number'
              ? { goodRatePercent: rawSeller.goodRatePercent }
              : {}),
            ...(typeof rawSeller.soldCount === 'number'
              ? { soldCount: rawSeller.soldCount }
              : {}),
            source: '闲鱼搜索结果页展示的卖家信誉信息（页面未展示的字段留空）',
          }
        : undefined;
      return {
        sourceUrl,
        title,
        priceYuan,
        imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl : undefined,
        publishTimeText:
          typeof entry.publishTimeText === 'string' ? entry.publishTimeText : undefined,
        seller,
        missingFields,
      };
    });
  }

  /** 主流程：打开关键词搜索页并采集多屏结果。 */
  async collect(options: CollectOptions): Promise<CollectOutcome> {
    const keyword = options.keyword.trim();
    if (!keyword) throw new Error('关键词不能为空');

    const maxScrolls = Math.min(Math.max(options.maxScrolls ?? 3, 0), 12);
    const maxItems = Math.min(Math.max(options.maxItems ?? 20, 1), 200);
    const scrollDelayMs = Math.min(Math.max(options.scrollDelayMs ?? 1500, 500), 5000);

    await this.ensureLaunched();
    const page = this.page!;

    const url = SEARCH_URL_TEMPLATE.replace('{keyword}', encodeURIComponent(keyword));
    this.note(`打开搜索结果页：${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // 结果页是前端渲染的：轮询等待卡片出现，而不是固定 sleep 后直接判定为空。
    await this.waitForCards(page);

    const risk = await this.detectRisk(page);
    if (risk) {
      this.note(`风控拦截：${risk}`);
      return {
        items: [],
        skipped: [],
        stoppedReason: risk,
        loginRequired: false,
        riskBlocked: true,
        accessDenied: false,
      };
    }

    // 站点主动拒绝（「请使用正常浏览器访问闲鱼」）与风控页必须分开报告：
    // 前者说明平台不接受这类自动化访问，继续尝试就是绕过，应当停止并如实说明。
    const denied = await this.detectAccessDenied(page);
    if (denied) {
      this.note(`站点拒绝访问：${denied}`);
      return {
        items: [],
        skipped: [],
        stoppedReason: `${denied}。请改用你自己的正常浏览器会话人工核对；程序不会尝试绕过。`,
        loginRequired: false,
        riskBlocked: false,
        accessDenied: true,
      };
    }

    const status = await this.loginStatus();
    if (!status.loggedIn) {
      return {
        items: [],
        skipped: [],
        stoppedReason: status.message,
        loginRequired: true,
        riskBlocked: false,
        accessDenied: false,
      };
    }

    // 官方筛选：必须在采集前确认生效，否则宁可停止也不把未筛选结果当筛选结果入库。
    let filtersRequested: string[] = [];
    let filtersApplied: string[] = [];

    if (options.filters?.personalOnly || options.filters?.publishWithinDays === 3) {
      const outcome = await applyOfficialFilters(page, {
        personalOnly: options.filters?.personalOnly,
        publishWithinDays: options.filters?.publishWithinDays,
      });
      filtersRequested = outcome.requested;
      filtersApplied = outcome.applied;
      const missing = filtersRequested.filter((name) => !filtersApplied.includes(name));
      if (missing.length > 0) {
        this.note(`官方筛选未生效：${missing.join('、')}`);
        return {
          items: [],
          skipped: [],
          stoppedReason: `官网筛选未生效（${missing.join(
            '、'
          )}），已停止采集：不把未筛选的结果当作筛选结果。下方「页面诊断」列出了页面上实际可见的筛选项文案，可据此核对名称，或取消该筛选后重试。`,
          loginRequired: false,
          riskBlocked: false,
          accessDenied: false,
          filtersRequested,
          filtersApplied,
          filterCandidates: outcome.diagnostics ?? [],
        };
      }
      this.note(`官方筛选已生效：${filtersApplied.join('、')}`);
      // 筛选后列表会重新渲染，重新等待卡片。
      await this.waitForCards(page);
    }

    await this.loadMore(page, maxScrolls, scrollDelayMs);

    // 闲鱼搜索以无限滚动为主，同时保留「下一页」兜底：两者都受 maxPages 限制。
    const maxPages = Math.min(Math.max(options.maxPages ?? 3, 1), 10);
    const collected = new Map<string, RawCard>();
    let stoppedReason: string | undefined;

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      if (pageIndex > 0) {
        await this.loadMore(page, maxScrolls, scrollDelayMs);
      }

      const riskAfter = await this.detectRisk(page);
      if (riskAfter) {
        this.note(`滚动后触发风控：${riskAfter}`);
        return {
          items: [...collected.values()].slice(0, maxItems),
          skipped: [],
          stoppedReason: riskAfter,
          loginRequired: false,
          riskBlocked: true,
          accessDenied: false,
        };
      }

      const deniedAfter = await this.detectAccessDenied(page);
      if (deniedAfter) {
        this.note(`滚动后站点拒绝访问：${deniedAfter}`);
        return {
          items: [...collected.values()].slice(0, maxItems),
          skipped: [],
          stoppedReason: `${deniedAfter}。请改用你自己的正常浏览器会话人工核对；程序不会尝试绕过。`,
          loginRequired: false,
          riskBlocked: false,
          accessDenied: true,
        };
      }

      // 跨页按链接去重，避免滚动与翻页重复计入同一商品。
      for (const card of await this.extractCardsFromPage()) {
        if (!collected.has(card.sourceUrl)) collected.set(card.sourceUrl, card);
      }
      this.note(`第 ${pageIndex + 1} 轮：累计 ${collected.size} 条`);

      if (collected.size >= maxItems || pageIndex === maxPages - 1) break;

      const advanced = await this.goToNextPage(page);
      if (!advanced) {
        stoppedReason = undefined;
        break;
      }
    }

    const items = [...collected.values()].slice(0, maxItems);
    const skipped = items
      .filter((card) => card.missingFields.length > 0)
      .map((card) => ({
        sourceUrl: card.sourceUrl,
        reason: `缺少字段：${card.missingFields.join('、')}`,
      }));
    this.note(`采集完成：去重后 ${items.length} 条`);
    // 列表页可能根本不展示卖家信誉：这时给出页面正文里的关键词与上下文，
    // 方便判断「确实没有」还是「有但格式不同」，而不是只回一句「未展示」。
    const sellerDiagnostics = items.some((card) => card.seller)
      ? undefined
      : await this.probeSellerText(page);
    return {
      items,
      skipped,
      ...(stoppedReason ? { stoppedReason } : {}),
      loginRequired: false,
      riskBlocked: false,
      accessDenied: false,
      filtersRequested,
      filtersApplied,
      ...(sellerDiagnostics ? { sellerDiagnostics } : {}),
    };
  }

  async stop(): Promise<void> {
    const attached = this.browser;
    const context = this.context;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.launchPromise = null;
    if (attached) {
      // 连接模式下只断开本程序与浏览器的连接，不负责关闭你自己打开的浏览器。
      await attached.close().catch(() => undefined);
      return;
    }
    if (context) {
      await context.close().catch(() => undefined);
    }
  }
}

export const browserSession = new BrowserSession();
