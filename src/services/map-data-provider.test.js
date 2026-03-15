import { describe, expect, it } from "vitest";
import { MapDataProvider } from "@/services/map-data-provider";

describe("MapDataProvider height repair", () => {
  it("補完可能なNaN標高を近傍から補間する", () => {
    const provider = new MapDataProvider();
    const heights = new Float32Array([
      100, 100, 100,
      100, Number.NaN, 100,
      100, 100, 100
    ]);

    const result = provider.repairMissingHeights(heights, 3, 3);

    expect(result.interpolatedCount).toBeGreaterThan(0);
    expect(result.unresolvedCount).toBe(0);
    expect(Number.isFinite(heights[4])).toBe(true);
    expect(Math.abs(heights[4] - 100)).toBeLessThan(0.01);
  });

  it("局所的な極端スパイクを中央値で補正する", () => {
    const provider = new MapDataProvider();
    const heights = new Float32Array([
      1200, 1200, 1200,
      1200, -250, 1200,
      1200, 1200, 1200
    ]);

    const corrected = provider.suppressSpikeOutliers(heights, 3, 3);

    expect(corrected).toBe(1);
    expect(Math.abs(heights[4] - 1200)).toBeLessThan(0.01);
  });

  it("大きめの欠損ブロックも周辺から伝播補間できる", () => {
    const provider = new MapDataProvider();
    const width = 16;
    const height = 16;
    const heights = new Float32Array(width * height);
    heights.fill(880);

    for (let y = 3; y <= 12; y += 1) {
      for (let x = 3; x <= 12; x += 1) {
        heights[y * width + x] = Number.NaN;
      }
    }

    const result = provider.repairMissingHeights(heights, width, height);
    const center = heights[8 * width + 8];

    expect(result.unresolvedCount).toBe(0);
    expect(result.propagatedCount).toBeGreaterThan(0);
    expect(Number.isFinite(center)).toBe(true);
    expect(Math.abs(center - 880)).toBeLessThan(1);
  });

  it("NoData近傍の値をNoData扱いとして判定する", () => {
    const provider = new MapDataProvider();
    expect(provider.isNoDataLikeValue(8388608)).toBe(true);
    expect(provider.isNoDataLikeValue(8388608 + 512)).toBe(true);
    expect(provider.isNoDataLikeValue(8388608 - 512)).toBe(true);
    expect(provider.isNoDataLikeValue(8388608 + 10000)).toBe(false);
  });
});
