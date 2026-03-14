import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import "../styles/index.css";
import { GeoUtils } from "./lib/geo-utils.js";
import { MapDataProvider, MAX_TILE_COUNT } from "./services/map-data-provider.js";
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
  activePreset: "wide",
  selectedViewpoint: null
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
    wide: { width: 40, height: 40, zoom: "12" },
    mid: { width: 18, height: 18, zoom: "13" },
    focus: { width: 8, height: 8, zoom: "15" }
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

function estimateTilesForCurrentSelection(widthKm, heightKm, zoom) {
  const bounds = GeoUtils.calculateBounds(runtime.center.lat, runtime.center.lng, widthKm, heightKm);
  return mapProvider.estimateTileCoverage(bounds, zoom).totalTiles;
}

function enforceTileLimit() {
  const zoom = Number.parseInt(ui.zoom.value, 10);
  const currentWidth = Number.parseFloat(ui.width.value);
  const currentHeight = Number.parseFloat(ui.height.value);
  const currentTiles = estimateTilesForCurrentSelection(currentWidth, currentHeight, zoom);

  if (currentTiles <= MAX_TILE_COUNT) {
    return;
  }

  let low = 0.05;
  let high = 1;

  for (let i = 0; i < 20; i += 1) {
    const mid = (low + high) / 2;
    const tiles = estimateTilesForCurrentSelection(currentWidth * mid, currentHeight * mid, zoom);
    if (tiles <= MAX_TILE_COUNT) {
      low = mid;
    } else {
      high = mid;
    }
  }

  let nextWidth = Math.max(4, Math.floor(currentWidth * low));
  let nextHeight = Math.max(4, Math.floor(currentHeight * low));

  while (estimateTilesForCurrentSelection(nextWidth, nextHeight, zoom) > MAX_TILE_COUNT && (nextWidth > 4 || nextHeight > 4)) {
    if (nextWidth > 4) {
      nextWidth -= 1;
    }
    if (nextHeight > 4) {
      nextHeight -= 1;
    }
  }

  ui.width.value = String(nextWidth);
  ui.height.value = String(nextHeight);
  dom.setSearchStatus(
    `選択した細かさでは範囲が広すぎるため、範囲を ${nextWidth}km x ${nextHeight}km に自動調整しました。`,
    "muted"
  );
  ui.statusDetail.textContent = "選択した細かさの上限に合わせて範囲を自動調整しました。必要なら細かさを下げてください。";
}

function markReadyIfAvailable() {
  if (stateStore.phase === AppPhase.SPLASH || stateStore.phase === AppPhase.GENERATING) {
    return;
  }
  stateStore.setPhase(AppPhase.READY_TO_GENERATE);
}

function formatWorldPoint(point) {
  return `${point.x.toFixed(0)}m, ${point.y.toFixed(0)}m, ${point.z.toFixed(0)}m`;
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
    runtime.selectedViewpoint = null;
    dom.updateSummaryArea(meshInfo);
    dom.setGeneratedAvailability(true);
    stateStore.setPhase(AppPhase.GENERATED);
    dom.setPlacementGuide("1. 地形上の見たい地点を指定 2. 目線高さで360°を確認");
    dom.setSearchStatus("地形を生成しました。必要なら視点ポイントを指定して360°で確認してください。");
  } catch (error) {
    stateStore.setPhase(AppPhase.ERROR);
    ui.statusDetail.textContent = `原因: ${error.message} / 影響: 地形未生成 / 次: 範囲を縮小するかズームを下げて再試行してください。`;
    dom.setSearchStatus(error.message, "error");
  } finally {
    dom.setLoading(false, "標高タイルを取得しています...");
    dom.setBusy(false);
  }
}

function pickViewpointOnTerrain() {
  if (!viewer.currentMesh) {
    return;
  }

  viewer.startViewpointPick((point) => {
    runtime.selectedViewpoint = point;
    dom.setPlacementGuide(`視点ポイントを指定しました: ${formatWorldPoint(point)} / 次に「人間視点で360°表示」を押してください。`);
    dom.setSearchStatus("視点ポイントを指定しました。人間視点で360°表示へ進んでください。");
  });
  dom.setPlacementGuide("地形上をクリックして視点ポイントを指定してください。");
  dom.setSearchStatus("視点ポイント指定モードです。地形上をクリックしてください。");
}

function showStreetViewMode() {
  if (!viewer.currentMesh) {
    return;
  }
  if (!runtime.selectedViewpoint) {
    dom.setSearchStatus("先に「視点ポイントを地形上で指定」で地点を選んでください。", "error");
    dom.setPlacementGuide("視点ポイントが未指定です。地形上の地点を1つ選択してください。");
    return;
  }

  const post = dom.getPostConfig();
  viewer.camera.fov = Math.min(120, Math.max(20, post.fov));
  viewer.camera.updateProjectionMatrix();
  viewer.applyAtmosphere({ skyPreset: "clear", timePreset: post.timePreset });
  viewer.enterStreetView(runtime.selectedViewpoint, post.eyeHeight);
  dom.setSearchStatus("人間視点で360°確認中です。ドラッグで周囲を見渡せます。");
  dom.setPlacementGuide(`視点高さ ${post.eyeHeight.toFixed(1)}m / ドラッグで360°確認 / 視点を戻すで終了`);
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
      ui.statusDetail.textContent = `${filename} を保存しました。必要なら視点ポイントを指定して360°確認してください。`;
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
  enforceTileLimit();
  dom.updateSummaryArea();
  markReadyIfAvailable();
});

ui.height.addEventListener("input", () => {
  if (dom.isLocked) {
    ui.width.value = ui.height.value;
  }
  clearPresetSelection();
  enforceTileLimit();
  dom.updateSummaryArea();
  markReadyIfAvailable();
});

ui.zoom.addEventListener("change", () => {
  clearPresetSelection();
  enforceTileLimit();
  dom.updateSummaryArea();
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
    enforceTileLimit();
    markReadyIfAvailable();
  });
});

ui.generateButton.addEventListener("click", generateTerrain);
ui.exportButton.addEventListener("click", exportTerrain);
ui.applyViewpointButton.addEventListener("click", pickViewpointOnTerrain);
ui.showPlacementGuideButton.addEventListener("click", showStreetViewMode);
ui.resetButton.addEventListener("click", () => {
  viewer.resetView();
  if (stateStore.phase !== AppPhase.SPLASH) {
    ui.statusDetail.textContent = "視点を地形全体が見える位置に戻しました。";
    if (runtime.selectedViewpoint) {
      dom.setPlacementGuide("視点を戻しました。必要なら別地点を指定して再確認できます。");
    }
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
dom.setPlacementGuide("地形生成後に、見たい地点を指定して人間視点の360°確認を行えます。");
