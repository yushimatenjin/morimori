import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import "../styles/index.css";
import { GeoUtils } from "./lib/geo-utils.js";
import { MapDataProvider } from "./services/map-data-provider.js";
import { AppPhase, AppStateStore } from "./state/app-state.js";
import { DomController } from "./ui/dom-controller.js";
import { TerrainViewer } from "./viewer/terrain-viewer.js";

const stateStore = new AppStateStore();
const dom = new DomController();
const ui = dom.getElements();
const mapProvider = new MapDataProvider();
const viewer = new TerrainViewer(ui.viewerRoot);

const runtime = {
  center: {
    lat: 35.3606,
    lng: 138.7273,
    label: "富士山周辺"
  },
  activePreset: "wide"
};

stateStore.subscribe((phase) => dom.setPhase(phase));

function setCenter(lat, lng, label, query = "") {
  runtime.center = {
    lat: Number(lat),
    lng: Number(lng),
    label
  };

  if (query) {
    ui.searchQuery.value = query;
  }

  dom.setCenterSummary(runtime);
}

function setPreset(type) {
  const presets = {
    wide: { width: 40, height: 40, zoom: "10" },
    mid: { width: 18, height: 18, zoom: "11" },
    focus: { width: 8, height: 8, zoom: "12" }
  };

  const preset = presets[type];
  if (!preset) {
    return;
  }

  ui.width.value = String(preset.width);
  ui.height.value = String(preset.height);
  ui.zoom.value = preset.zoom;
  runtime.activePreset = type;
  dom.setPresetActive(type);
  dom.updateSummaryArea();
}

function clearPresetSelection() {
  runtime.activePreset = null;
  dom.setPresetActive(null);
}

function markReadyIfAvailable() {
  if (stateStore.phase === AppPhase.SPLASH || stateStore.phase === AppPhase.GENERATING) {
    return;
  }
  stateStore.setPhase(AppPhase.READY_TO_GENERATE);
}

async function searchLocation() {
  const query = ui.searchQuery.value.trim();
  if (!query) {
    stateStore.setPhase(AppPhase.ERROR);
    ui.statusDetail.textContent = "原因: 地点未入力 / 影響: 中心点未設定 / 次: 地点名を入力して再検索してください。";
    dom.setSearchStatus("中心地点を入力してください。", "error");
    return;
  }

  dom.setBusy(true);
  stateStore.setPhase(AppPhase.SEARCHING);
  dom.setSearchStatus(`地点を検索中: ${query}`, "loading");

  try {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      "accept-language": "ja"
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    if (!response.ok) {
      throw new Error("検索サービスに接続できませんでした。通信状態を確認してください。");
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("地点が見つかりません。別のキーワードで再検索してください。");
    }

    const result = data[0];
    setCenter(result.lat, result.lon, result.display_name || query, query);

    dom.setSearchStatus(`中心地点を設定しました: ${runtime.center.label}`);
    stateStore.setPhase(AppPhase.READY_TO_GENERATE);
  } catch (error) {
    stateStore.setPhase(AppPhase.ERROR);
    ui.statusDetail.textContent = `原因: ${error.message} / 影響: 中心点未更新 / 次: 検索語を見直して再試行してください。`;
    dom.setSearchStatus(error.message, "error");
  } finally {
    dom.setBusy(false);
  }
}

async function generateTerrain() {
  const config = dom.getTerrainConfig(runtime);

  dom.setBusy(true);
  dom.setLoading(true, "標高タイルを取得しています...");
  stateStore.setPhase(AppPhase.GENERATING);

  try {
    const bounds = GeoUtils.calculateBounds(config.centerLat, config.centerLng, config.widthKm, config.heightKm);

    const data = await mapProvider.fetchMapData(bounds, config.zoom, config.useTexture, ({ loaded, total }) => {
      dom.setLoading(true, `標高タイルを取得しています... ${loaded}/${total}`);
      ui.statusDetail.textContent = `広域タイルを処理中です (${loaded}/${total})`;
    });

    const meshInfo = viewer.update(data, config);
    dom.updateSummaryArea(meshInfo);
    dom.setGeneratedAvailability(true);
    stateStore.setPhase(AppPhase.GENERATED);
    dom.setSearchStatus("地形を生成しました。まず 3Dモデルを保存してください。");
  } catch (error) {
    stateStore.setPhase(AppPhase.ERROR);
    ui.statusDetail.textContent = `原因: ${error.message} / 影響: 地形未生成 / 次: 範囲を縮小するかズームを下げて再試行してください。`;
    dom.setSearchStatus(error.message, "error");
  } finally {
    dom.setLoading(false, "標高タイルを取得しています...");
    dom.setBusy(false);
  }
}

function applyGeneratedView() {
  if (!viewer.currentMesh) {
    return;
  }

  const post = dom.getPostConfig();
  viewer.camera.fov = Math.min(120, Math.max(20, post.fov));
  viewer.camera.updateProjectionMatrix();
  viewer.applyAtmosphere({ skyPreset: "clear", timePreset: post.timePreset });
  dom.setSearchStatus("生成済みモデルを基準に視点を調整しました。");
}

function showPlacementGuide() {
  dom.setPlacementGuide(
    "配置ガイド: Unity は 1unit=1m、Unreal は 1uu=1cm。原点合わせ後、遠景用LODで描画負荷を確認してください。"
  );
  dom.setSearchStatus("配置ガイドを表示しました。エンジン側で座標系とスケールを確認してください。");
}

function exportTerrain() {
  if (!viewer.currentMesh) {
    return;
  }

  dom.setBusy(true);
  stateStore.setPhase(AppPhase.GENERATING);
  ui.statusDetail.textContent = "GLB 出力を準備しています。";

  const exporter = new GLTFExporter();
  viewer.currentMesh.updateMatrixWorld(true);

  exporter.parse(
    viewer.currentMesh,
    (glb) => {
      const filename = `morimorimori_terrain_${Date.now()}.glb`;
      const blob = new Blob([glb], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      stateStore.setPhase(AppPhase.GENERATED);
      ui.statusDetail.textContent = `${filename} を保存しました。次に配置検証へ進んでください。`;
      dom.setBusy(false);
    },
    (error) => {
      stateStore.setPhase(AppPhase.ERROR);
      ui.statusDetail.textContent = `原因: ${error?.message || "書き出し失敗"} / 影響: ファイル未保存 / 次: 再試行してください。`;
      dom.setBusy(false);
    },
    { binary: true }
  );
}

function openWorkspace(withSample = false) {
  dom.closeSplash();

  if (withSample) {
    setCenter(35.3606, 138.7273, "富士山周辺", "富士山");
    setPreset("wide");
    stateStore.setPhase(AppPhase.READY_TO_GENERATE);
    dom.setSearchStatus("サンプル条件を適用しました。地形生成から開始してください。");
    return;
  }

  stateStore.setPhase(AppPhase.IDLE);
  dom.setSearchStatus("まず地点を検索して中心点を設定してください。");
}

ui.enterButton.addEventListener("click", () => openWorkspace(false));
ui.applySampleButton.addEventListener("click", () => openWorkspace(true));
ui.searchButton.addEventListener("click", searchLocation);
ui.searchQuery.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchLocation();
  }
});

ui.quickLocationButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setCenter(button.dataset.lat, button.dataset.lng, button.dataset.label, button.textContent);
    dom.setSearchStatus(`${button.dataset.label} を中心地点に設定しました。`);
    stateStore.setPhase(AppPhase.READY_TO_GENERATE);
  });
});

ui.width.addEventListener("input", () => {
  if (dom.isLocked) {
    ui.height.value = ui.width.value;
  }
  clearPresetSelection();
  dom.updateSummaryArea();
  markReadyIfAvailable();
});

ui.height.addEventListener("input", () => {
  if (dom.isLocked) {
    ui.width.value = ui.height.value;
  }
  clearPresetSelection();
  dom.updateSummaryArea();
  markReadyIfAvailable();
});

ui.zoom.addEventListener("change", () => {
  dom.updateSummaryArea();
  markReadyIfAvailable();
});

ui.heightScale.addEventListener("change", () => {
  const value = Number.parseFloat(ui.heightScale.value);
  ui.heightScale.value = Number.isFinite(value) && value > 0 ? value.toFixed(1) : "1.0";
  markReadyIfAvailable();
});

ui.cameraFov.addEventListener("change", dom.updateSummaryArea.bind(dom));
ui.timePreset.addEventListener("change", markReadyIfAvailable);

ui.lockButton.addEventListener("click", () => {
  dom.setLockState(!dom.isLocked);
  if (dom.isLocked) {
    ui.height.value = ui.width.value;
    dom.updateSummaryArea();
  }
});

ui.presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setPreset(button.dataset.preset);
    markReadyIfAvailable();
  });
});

ui.generateButton.addEventListener("click", generateTerrain);
ui.exportButton.addEventListener("click", exportTerrain);
ui.applyViewpointButton.addEventListener("click", applyGeneratedView);
ui.showPlacementGuideButton.addEventListener("click", showPlacementGuide);
ui.resetButton.addEventListener("click", () => {
  viewer.resetView();
  if (stateStore.phase !== AppPhase.SPLASH) {
    ui.statusDetail.textContent = "視点を地形全体が見える位置に戻しました。";
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && stateStore.phase === AppPhase.SPLASH) {
    openWorkspace(false);
  }
});

dom.setLockState(true);
setCenter(runtime.center.lat, runtime.center.lng, runtime.center.label, "富士山");
setPreset("wide");
dom.setBusy(false);
dom.setGeneratedAvailability(false);
dom.setPlacementGuide("地形生成後に、Unity/Unreal向け配置ガイドを表示します。");
