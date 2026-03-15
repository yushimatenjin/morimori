import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "@/App";

const featuredLocations = ["富士山", "大山", "白山", "阿蘇山", "東京駅", "大阪駅", "札幌駅", "仙台駅", "那覇空港"] as const;

vi.mock("@/viewer/terrain-viewer", () => {
  class TerrainViewerMock {
    currentMesh = { updateMatrixWorld: vi.fn() };
    camera = { fov: 55, updateProjectionMatrix: vi.fn() };

    update() {
      return { width: 256, height: 256 };
    }

    startViewpointPick() {}

    applyAtmosphere() {}

    enterStreetView() {}

    resetView() {}

    setSkyboxVisible() {}
  }

  return { TerrainViewer: TerrainViewerMock };
});

vi.mock("@/services/map-data-provider", () => {
  class MapDataProviderMock {
    async fetchMapData(_bounds: unknown, _zoom: number, _fetchPhoto: boolean, onProgress?: (progress: { loaded: number; total: number }) => void) {
      onProgress?.({ loaded: 1, total: 1 });
      return { diagnostics: { demMissingCount: 0, demMissingSamples: [] } };
    }
  }

  return { MapDataProvider: MapDataProviderMock };
});

vi.mock("three/examples/jsm/exporters/GLTFExporter.js", () => {
  class GLTFExporterMock {
    parse(_mesh: unknown, onDone: (glb: ArrayBuffer) => void) {
      onDone(new ArrayBuffer(8));
    }
  }

  return { GLTFExporter: GLTFExporterMock };
});

function getEnabledPrimaryAction(label: string) {
  return screen.getAllByRole("button", { name: label }).find((button) => !button.hasAttribute("disabled"));
}

async function openWorkspace() {
  const button = document.querySelector<HTMLButtonElement>('[data-action="enter-workspace"]');
  if (!button) {
    throw new Error("スプラッシュ開始ボタンが見つかりません。");
  }
  await userEvent.click(button);
}

describe("App integration", () => {
  it("splash -> idle に遷移し、地点選択導線が見える", async () => {
    render(<App />);

    await openWorkspace();

    expect(screen.getByText("ステップ1: 地点を決める")).toBeInTheDocument();
    expect(getEnabledPrimaryAction("地点を選ぶ/検索する")).toBeTruthy();
  });

  it.each(featuredLocations)("ギャラリー地点「%s」から generated まで到達できる", async (locationLabel) => {
    render(<App />);
    await openWorkspace();

    await userEvent.click(screen.getByRole("button", { name: new RegExp(locationLabel) }));

    expect(getEnabledPrimaryAction("この条件で地形を生成")).toBeTruthy();

    const generateButton = getEnabledPrimaryAction("この条件で地形を生成");
    if (!generateButton) {
      throw new Error("生成ボタンが活性化されていません。");
    }
    await userEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "3Dモデルを保存" }).length).toBeGreaterThan(0);
    });

    expect(screen.getByText("先に保存、その後に必要なら視点調整へ進んでください。")).toBeInTheDocument();
  });

  it("検索空入力で error 表示（原因/影響/次）になる", async () => {
    render(<App />);
    await openWorkspace();

    await userEvent.click(screen.getByRole("button", { name: "検索" }));

    await waitFor(() => {
      expect(screen.getByText("再開ガイド")).toBeInTheDocument();
    });
    const errorCard = screen.getByText("再開ガイド").closest("section");
    if (!errorCard) {
      throw new Error("エラーカードが見つかりません。");
    }
    expect(within(errorCard).getByText(/原因:/)).toBeInTheDocument();
    expect(within(errorCard).getByText(/影響:/)).toBeInTheDocument();
    expect(within(errorCard).getByText(/次:/)).toBeInTheDocument();
    expect(getEnabledPrimaryAction("条件を見直して再試行")).toBeTruthy();
  });
});
