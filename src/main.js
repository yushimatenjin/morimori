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
  lat: 35.3606,
  lng: 138.7273,
  activePreset: null
};

stateStore.subscribe((phase) => dom.setPhase(phase));

function updateConfigSummary(generatedData = null) {
  dom.updateRangeLabels();
  dom.updateSummaryResolution(generatedData);
}

function updateLocation(lat, lng, label, query = "") {
  runtime.lat = Number(lat);
  runtime.lng = Number(lng);
  dom.updateLocation(runtime.lat, runtime.lng, label, query);
}

function setPreset(type) {
  const presets = {
    point: { width: 1.0, height: 1.0, zoom: "15" },
    city: { width: 4.0, height: 4.0, zoom: "14" },
    region: { width: 10.0, height: 10.0, zoom: "13" }
  };

  const preset = presets[type];
  if (!preset) {
    return;
  }

  ui.width.value = preset.width.toFixed(1);
  ui.height.value = preset.height.toFixed(1);
  ui.zoom.value = preset.zoom;
  runtime.activePreset = type;
  dom.setPresetActive(type);
  updateConfigSummary();
}

function clearPresetSelection() {
  runtime.activePreset = null;
  dom.setPresetActive(null);
}

function markReadyIfAvailable() {
  if (stateStore.phase === AppPhase.SPLASH) {
    return;
  }
  stateStore.setPhase(AppPhase.READY_TO_GENERATE);
}

async function searchLocation() {
  const query = ui.searchInput.value.trim();

  if (!query) {
    dom.setSearchStatus("地名を入力してください。", "error");
    stateStore.setPhase(AppPhase.ERROR);
    ui.statusDetail.textContent = "検索欄に地名または施設名を入力してから再実行してください。";
    return;
  }

  dom.setBusy(true);
  dom.setSearchStatus("地名を検索しています...", "loading");
  stateStore.setPhase(AppPhase.SEARCHING);

  try {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      "accept-language": "ja"
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    if (!response.ok) {
      throw new Error("検索サービスに接続できませんでした。少し時間をおいて再試行してください。");
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("該当する地点が見つかりませんでした。別の地名で試してください。");
    }

    const result = data[0];
    const label = result.display_name || query;
    updateLocation(result.lat, result.lon, label, query);
    dom.setSearchStatus(`地点を設定しました: ${label}`);
    stateStore.setPhase(AppPhase.READY_TO_GENERATE);
  } catch (error) {
    dom.setSearchStatus(error.message, "error");
    stateStore.setPhase(AppPhase.ERROR);
    ui.statusDetail.textContent = error.message;
  } finally {
    dom.setBusy(false);
  }
}

async function generateTerrain() {
  if (!Number.isFinite(runtime.lat) || !Number.isFinite(runtime.lng)) {
    stateStore.setPhase(AppPhase.ERROR);
    ui.statusDetail.textContent = "中心点が不正です。地点を再設定してください。";
    return;
  }

  const config = dom.getConfig();
  config.lat = runtime.lat;
  config.lng = runtime.lng;

  ui.heightScale.value = config.heightScale.toFixed(1);
  dom.setBusy(true);
  dom.setLoading(true, "標高タイルを取得しています...");
  stateStore.setPhase(AppPhase.GENERATING);

  try {
    const bounds = GeoUtils.calculateBounds(config.lat, config.lng, config.widthKm, config.heightKm);

    const data = await mapProvider.fetchMapData(bounds, config.zoom, config.useTexture, ({ loaded, total }) => {
      dom.setLoading(true, `標高タイルを取得しています... ${loaded}/${total}`);
      ui.statusDetail.textContent = `${loaded}/${total} タイルを処理中です。`;
    });

    viewer.update(data, config);
    updateConfigSummary(data);
    dom.setSearchStatus("地形を生成しました。必要なら設定を調整して再生成してください。");
    dom.setGeneratedAvailability(true);
    stateStore.setPhase(AppPhase.GENERATED);
  } catch (error) {
    dom.setSearchStatus(error.message, "error");
    stateStore.setPhase(AppPhase.ERROR);
    ui.statusDetail.textContent = error.message;
  } finally {
    dom.setLoading(false, "標高タイルを取得しています...");
    dom.setBusy(false);
  }
}

function exportTerrain() {
  if (!viewer.currentMesh) {
    return;
  }

  dom.setBusy(true);
  stateStore.setPhase(AppPhase.GENERATING);
  ui.statusDetail.textContent = "GLB の書き出し処理を実行しています。";

  const exporter = new GLTFExporter();
  viewer.currentMesh.updateMatrixWorld(true);

  exporter.parse(
    viewer.currentMesh,
    (glb) => {
      const filename = `gsi_terrain_${Date.now()}.glb`;
      const blob = new Blob([glb], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      stateStore.setPhase(AppPhase.GENERATED);
      ui.statusDetail.textContent = `${filename} のダウンロードを開始しました。`;
      dom.setBusy(false);
    },
    (error) => {
      stateStore.setPhase(AppPhase.ERROR);
      ui.statusDetail.textContent = error?.message || "GLB の書き出しに失敗しました。";
      dom.setBusy(false);
    },
    { binary: true }
  );
}

function openWorkspace(useSample = false) {
  dom.closeSplash();

  if (useSample) {
    updateLocation(35.3606, 138.7273, "富士山周辺", "富士山");
    dom.setSearchStatus("富士山のサンプル設定を読み込みました。");
    stateStore.setPhase(AppPhase.READY_TO_GENERATE);
    return;
  }

  stateStore.setPhase(AppPhase.IDLE);
}

ui.enterButton.addEventListener("click", () => openWorkspace(false));
ui.enterSampleButton.addEventListener("click", () => openWorkspace(true));
ui.searchButton.addEventListener("click", searchLocation);
ui.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchLocation();
  }
});

ui.width.addEventListener("input", () => {
  if (dom.isLocked) {
    ui.height.value = ui.width.value;
  }
  clearPresetSelection();
  updateConfigSummary();
  markReadyIfAvailable();
});

ui.height.addEventListener("input", () => {
  if (dom.isLocked) {
    ui.width.value = ui.height.value;
  }
  clearPresetSelection();
  updateConfigSummary();
  markReadyIfAvailable();
});

ui.zoom.addEventListener("change", () => {
  updateConfigSummary();
  markReadyIfAvailable();
});

ui.heightScale.addEventListener("change", () => {
  const value = Number.parseFloat(ui.heightScale.value);
  ui.heightScale.value = Number.isFinite(value) && value > 0 ? value.toFixed(1) : "1.0";
  markReadyIfAvailable();
});

ui.texture.addEventListener("change", markReadyIfAvailable);

ui.lockButton.addEventListener("click", () => {
  dom.setLockState(!dom.isLocked);
  if (dom.isLocked) {
    ui.height.value = ui.width.value;
    updateConfigSummary();
  }
});

ui.presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setPreset(button.dataset.preset);
    markReadyIfAvailable();
  });
});

ui.quickLocationButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const lat = Number.parseFloat(button.dataset.lat);
    const lng = Number.parseFloat(button.dataset.lng);
    const label = button.dataset.label || button.dataset.location;
    const query = button.dataset.location || "";
    updateLocation(lat, lng, label, query);
    dom.setSearchStatus(`${label} を中心点に設定しました。`);
    stateStore.setPhase(AppPhase.READY_TO_GENERATE);
  });
});

ui.generateButton.addEventListener("click", generateTerrain);
ui.exportButton.addEventListener("click", exportTerrain);
ui.resetButton.addEventListener("click", () => {
  viewer.resetView();
  if (stateStore.phase !== AppPhase.SPLASH) {
    ui.statusDetail.textContent = "生成済み地形の表示範囲に視点を戻しました。";
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && stateStore.phase === AppPhase.SPLASH) {
    openWorkspace(false);
  }
});

dom.setLockState(true);
updateLocation(runtime.lat, runtime.lng, "富士山周辺", "富士山");
updateConfigSummary();
dom.setSearchStatus("地名を入力するか、クイック地点から中心点を選択してください。");
dom.setBusy(false);
dom.setGeneratedAvailability(false);
