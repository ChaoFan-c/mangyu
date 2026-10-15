/**
 * 历史价格分布的展示门槛。
 *
 * 需求允许「查看历史价格变化」，但只有在积累到足够数据后才展示真实趋势。
 * 因此这里显式定义「够不够画一张图」的判定，避免用两三个点连出看似精确的曲线。
 * 判定是纯函数，单独测试，页面只负责渲染。
 */

/** 至少要有这么多条价格记录，才认为样本能体现分布。 */
export const MIN_TIMELINE_POINTS = 3;

/** 至少要跨这么多天，否则只能算同一时间点的重复记录。 */
export const MIN_TIMELINE_DATES = 2;

export interface PriceTimelineSummary {
  /** 参与统计的有效记录数（时间无法解析的记录会被剔除）。 */
  count: number;
  /** 记录覆盖的去重日期数。 */
  distinctDates: number;
  /** 最早与最晚采集时间相差的天数。 */
  spanDays: number;
  /** 最早/最晚采集时间（毫秒时间戳），用于把记录映射到横向位置。 */
  minMs: number;
  maxMs: number;
  /** 是否满足展示门槛。false 时界面应说明「样本不足」而不是画图。 */
  enough: boolean;
}

export function summarizePriceTimeline(
  records: Array<{ collected_at?: string | null }>
): PriceTimelineSummary {
  const times: number[] = [];
  const dates = new Set<string>();

  for (const record of records) {
    const iso = record?.collected_at;
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) continue;
    times.push(ms);
    dates.add(iso.slice(0, 10));
  }

  if (times.length === 0) {
    return { count: 0, distinctDates: 0, spanDays: 0, minMs: 0, maxMs: 0, enough: false };
  }

  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);
  const spanDays = Math.round((maxMs - minMs) / 86_400_000);
  const enough =
    times.length >= MIN_TIMELINE_POINTS &&
    dates.size >= MIN_TIMELINE_DATES &&
    maxMs > minMs;

  return { count: times.length, distinctDates: dates.size, spanDays, minMs, maxMs, enough };
}

/**
 * 把一条记录映射到 0-1 的横向位置。
 * 时间无法解析或时间跨度为零时退回居中，不制造「有先后」的错觉。
 */
export function priceTimelineRatio(
  collectedAt: string | null | undefined,
  summary: Pick<PriceTimelineSummary, 'minMs' | 'maxMs'>
): number {
  if (!collectedAt || summary.maxMs <= summary.minMs) return 0.5;
  const ms = new Date(collectedAt).getTime();
  if (Number.isNaN(ms)) return 0.5;
  const ratio = (ms - summary.minMs) / (summary.maxMs - summary.minMs);
  return Math.min(1, Math.max(0, ratio));
}
