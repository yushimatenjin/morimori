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
});
