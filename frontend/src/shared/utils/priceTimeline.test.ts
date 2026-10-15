import { describe, expect, it } from 'vitest';
import {
  MIN_TIMELINE_DATES,
  MIN_TIMELINE_POINTS,
  priceTimelineRatio,
  summarizePriceTimeline,
} from '@daoye/shared';

function record(collectedAt: string) {
  return { collected_at: collectedAt };
}

describe('历史价格分布的展示门槛', () => {
  it('空数据时判定为样本不足，且不会算出 NaN 时间', () => {
    const summary = summarizePriceTimeline([]);
    expect(summary.count).toBe(0);
    expect(summary.distinctDates).toBe(0);
    expect(summary.enough).toBe(false);
    expect(summary.minMs).toBe(0);
    expect(summary.maxMs).toBe(0);
  });

  it('记录数不足门槛时拒绝展示趋势', () => {
    const summary = summarizePriceTimeline([
      record('2026-09-01T00:00:00.000Z'),
      record('2026-09-05T00:00:00.000Z'),
    ]);
    expect(summary.count).toBeLessThan(MIN_TIMELINE_POINTS);
    expect(summary.enough).toBe(false);
  });

  it('记录数达标但全在同一天时仍然拒绝展示', () => {
    const summary = summarizePriceTimeline([
      record('2026-09-01T01:00:00.000Z'),
      record('2026-09-01T05:00:00.000Z'),
      record('2026-09-01T09:00:00.000Z'),
    ]);
    expect(summary.count).toBeGreaterThanOrEqual(MIN_TIMELINE_POINTS);
    expect(summary.distinctDates).toBe(1);
    expect(summary.enough).toBe(false);
  });

  it('跨多个日期且记录足够时才允许展示', () => {
    const summary = summarizePriceTimeline([
      record('2026-09-01T00:00:00.000Z'),
      record('2026-09-10T00:00:00.000Z'),
      record('2026-09-20T00:00:00.000Z'),
    ]);
    expect(summary.count).toBe(3);
    expect(summary.distinctDates).toBeGreaterThanOrEqual(MIN_TIMELINE_DATES);
    expect(summary.spanDays).toBe(19);
    expect(summary.enough).toBe(true);
  });

  it('无法解析的时间戳会被剔除，而不是产生 NaN 坐标', () => {
    const summary = summarizePriceTimeline([
      record('2026-09-01T00:00:00.000Z'),
      record('不是时间'),
      record(''),
      record('2026-09-10T00:00:00.000Z'),
      record('2026-09-20T00:00:00.000Z'),
    ]);
    expect(summary.count).toBe(3);
    expect(summary.enough).toBe(true);
  });

  it('横向位置落在 0-1 之间，跨度为零或时间非法时退回居中', () => {
    const summary = summarizePriceTimeline([
      record('2026-09-01T00:00:00.000Z'),
      record('2026-09-20T00:00:00.000Z'),
      record('2026-09-10T00:00:00.000Z'),
    ]);
    expect(priceTimelineRatio('2026-09-01T00:00:00.000Z', summary)).toBe(0);
    expect(priceTimelineRatio('2026-09-20T00:00:00.000Z', summary)).toBe(1);
    expect(priceTimelineRatio('2026-09-10T00:00:00.000Z', summary)).toBeCloseTo(0.4737, 3);
    expect(priceTimelineRatio('不是时间', summary)).toBe(0.5);
    expect(priceTimelineRatio('2026-09-01T00:00:00.000Z', { minMs: 5, maxMs: 5 })).toBe(0.5);
  });
});
