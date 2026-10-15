/**
 * 在闲鱼搜索结果页上应用官方筛选条件。
 *
 * 边界（重要）：
 * - 只做正常页面操作：定位官方控件、点击、再确认状态确实变化。
 * - 无法定位或无法确认生效时，返回「未应用」，由调用方停止采集并如实提示。
 * - 选择器一律走 Playwright（locator），**不能**把 `:has-text()` 这类
 *   Playwright 伪类交给页面内的 `document.querySelector`，原生 CSS 不认。
 */

import type { Locator, Page } from 'playwright';

export interface OfficialFilterRequest {
  /** 个人闲置。 */
  personalOnly?: boolean;
  /** 发布时间筛选：3 天内。 */
  publishWithinDays?: 3;
}

export interface OfficialFilterResult {
  requested: string[];
  applied: string[];
  /** 未生效时回报页面上实际可见的筛选项文案，便于核对真实文案。 */
  diagnostics?: string[];
}

export const FILTER_PERSONAL = '个人闲置';
export const FILTER_PUBLISH_3D = '3天内发布';

/** 个人闲置的候选文案（页面文案可能有别名或带前缀）。 */
const PERSONAL_PATTERNS = [
  /个人闲置/,
  /仅看?个人/,
  /个人卖家/,
  /只看?个人/,
  /^个人$/,
];

/** 「发布时间」筛选触发器的候选文案。 */
const PUBLISH_TRIGGER_PATTERNS = [/发布时间/, /^时间/, /^发布$/, /发布时段/];

/** 「3 天内」选项的候选文案。 */
const PUBLISH_OPTION_PATTERNS = [/3\s*天内/, /三\s*天内/, /近\s*3\s*天/, /^3\s*天$/];

/** 候选标签：筛选控件通常是按钮、链接或可点标签。 */
const CONTROL_TAGS = ['button', 'a', 'label', 'li', 'span', 'div[role="button"]'];

/** 文案过长的元素多半是整块列表容器，不是筛选控件。 */
const MAX_CONTROL_TEXT = 16;

/**
 * 筛选条通常位于页面顶部。用它排除商品卡片里同名的文字
 * （例如卡片上的「3天前发布」），避免点错元素。
 */
const FILTER_BAR_MAX_Y = 460;

/**
 * 找一个可见、文案短且最贴近目标文案的控件。
 * 用 locator 而不是 ElementHandle：页面重渲染后 locator 会自动重新定位。
 */
async function findControl(
  page: Page,
  patterns: RegExp[],
  options: { tags?: string[]; requireVisible?: boolean; requireTopArea?: boolean } = {}
): Promise<Locator | null> {
  const tags = options.tags ?? CONTROL_TAGS;
  // 逐个标签扫描可见的短文案元素，再按正则匹配，兼容文案别名与夹杂空白。
  for (const tag of tags) {
    const locator = page.locator(tag);
    const count = await locator.count().catch(() => 0);
    let best: { locator: Locator; length: number } | null = null;
    for (let index = 0; index < Math.min(count, 400); index += 1) {
      const item = locator.nth(index);
      const visible = await item.isVisible().catch(() => false);
      if (!visible) continue;
      const content = ((await item.textContent().catch(() => '')) ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!content || content.length > MAX_CONTROL_TEXT) continue;
      // 页面文案经常夹着空格或换行（「个人 闲置」），匹配前先去掉所有空白。
      const compact = content.replace(/\s+/g, '');
      if (!patterns.some((pattern) => pattern.test(compact))) continue;
      if (options.requireTopArea !== false) {
        const box = await item.boundingBox().catch(() => null);
        if (!box || box.y > FILTER_BAR_MAX_Y) continue;
      }
      if (!best || content.length < best.length) {
        best = { locator: item, length: content.length };
      }
    }
    if (best) return best.locator;
  }
  return null;
}

/**
 * 收集筛选条附近的可见短文案，供「定位不到时如实回报页面实际有哪些选项」。
 * 只读取文本，不点击、不修改页面。
 */
export async function discoverFilterCandidates(page: Page): Promise<string[]> {
  const seen = new Set<string>();
  const texts: string[] = [];
  for (const tag of CONTROL_TAGS) {
    const locator = page.locator(tag);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < Math.min(count, 400); index += 1) {
      const item = locator.nth(index);
      const visible = await item.isVisible().catch(() => false);
      if (!visible) continue;
      const box = await item.boundingBox().catch(() => null);
      if (!box || box.y > FILTER_BAR_MAX_Y) continue;
      const content = ((await item.textContent().catch(() => '')) ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!content || content.length > MAX_CONTROL_TEXT || seen.has(content)) continue;
      seen.add(content);
      texts.push(content);
      if (texts.length >= 30) return texts;
    }
  }
  return texts;
}

/** 读取控件的「选中状态指纹」，只读属性，不做任何改写。 */
async function controlState(target: Locator): Promise<string | null> {
  if ((await target.count().catch(() => 0)) === 0) return null;
  const item = target.first();
  const attributes = await Promise.all([
    item.getAttribute('aria-pressed').catch(() => null),
    item.getAttribute('aria-selected').catch(() => null),
    item.getAttribute('aria-checked').catch(() => null),
    item.getAttribute('data-selected').catch(() => null),
    item.getAttribute('class').catch(() => null),
    item.textContent().catch(() => null),
  ]);
  return attributes.map((value) => (value ?? '').trim().slice(0, 60)).join('|');
}

async function clickAndConfirm(page: Page, target: Locator): Promise<boolean> {
  const before = await controlState(target);
  try {
    await target.first().click({ timeout: 5_000 });
  } catch {
    return false;
  }
  await page.waitForTimeout(1_500);
  const after = await controlState(target);
  return before !== null && after !== null && before !== after;
}

/** 个人闲置：点一下即切换，点击前后状态指纹必须变化。 */
async function applyPersonalOnly(page: Page): Promise<boolean> {
  const control = await findControl(page, PERSONAL_PATTERNS);
  if (!control) return false;
  return clickAndConfirm(page, control);
}

/**
 * 3 天内发布：先点开「发布时间」下拉，再点「3天内」选项，
 * 最后确认触发器文案或选项状态发生变化。
 */
async function applyPublishWithin3Days(page: Page): Promise<boolean> {
  const trigger = await findControl(page, PUBLISH_TRIGGER_PATTERNS);
  if (!trigger) return false;
  const beforeTrigger = await controlState(trigger);
  try {
    await trigger.first().click({ timeout: 5_000 });
  } catch {
    return false;
  }
  await page.waitForTimeout(900);

  // 下拉选项可能渲染在弹层里，位置不再受顶部区域限制，但仍要求可见。
  const option = await findControl(page, PUBLISH_OPTION_PATTERNS, {
    requireTopArea: false,
  });
  if (!option) return false;
  const beforeOption = await controlState(option);
  try {
    await option.first().click({ timeout: 5_000 });
  } catch {
    return false;
  }
  await page.waitForTimeout(1_500);

  const afterTrigger = await controlState(trigger);
  const afterOption = await controlState(option);
  const triggerChanged =
    beforeTrigger !== null && afterTrigger !== null && beforeTrigger !== afterTrigger;
  const optionChanged =
    beforeOption !== null && afterOption !== null && beforeOption !== afterOption;
  return triggerChanged || optionChanged;
}

/**
 * 应用筛选条件。返回请求了哪些、其中哪些确认生效。
 * 单个筛选失败不会抛错，由调用方根据 applied 决定是否继续采集。
 */
export async function applyOfficialFilters(
  page: Page,
  filters: OfficialFilterRequest
): Promise<OfficialFilterResult> {
  const requested: string[] = [];
  const applied: string[] = [];
  if (filters.personalOnly) requested.push(FILTER_PERSONAL);
  if (filters.publishWithinDays === 3) requested.push(FILTER_PUBLISH_3D);

  try {
    if (filters.personalOnly && (await applyPersonalOnly(page))) {
      applied.push(FILTER_PERSONAL);
    }
    if (filters.publishWithinDays === 3 && (await applyPublishWithin3Days(page))) {
      applied.push(FILTER_PUBLISH_3D);
    }
  } catch {
    // 控件定位或点击异常一律按「未生效」处理，交由调用方停止采集并提示。
  }

  const missing = requested.filter((name) => !applied.includes(name));
  if (missing.length > 0) {
    return { requested, applied, diagnostics: await discoverFilterCandidates(page) };
  }
  return { requested, applied };
}
