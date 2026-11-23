/**
 * 将网页时间区间转换为有限的毫秒范围，拒绝非有限值和倒置区间
 * @param value - 不可信的页面数据
 * @param duration - 当前媒体总时长
 */
export const sanitizeTimeRanges = (value: unknown, duration: number): [number, number][] => {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 16)
    .filter(
      (r): r is [number, number] =>
        Array.isArray(r) &&
        r.length === 2 &&
        r.every((v) => typeof v === "number" && Number.isFinite(v)) &&
        r[0] >= 0 &&
        r[1] >= r[0],
    )
    .map(([a, b]) => [Math.min(a, duration), Math.min(b, duration)]);
};
/**
 * 将目标夹在媒体可定位范围中，范围尚未就绪时使用总时长
 * @param position - 用户目标
 * @param duration - 总时长
 * @param ranges - 页面当前可定位区间
 */
export const clampSeekPosition = (
  position: number,
  duration: number,
  ranges: [number, number][],
): number => {
  const target = Math.max(0, Math.min(duration, position));
  if (!ranges.length || ranges.some(([start, end]) => target >= start && target <= end))
    return target;
  return ranges
    .flat()
    .reduce(
      (best, value) => (Math.abs(value - target) < Math.abs(best - target) ? value : best),
      ranges[0][0],
    );
};
