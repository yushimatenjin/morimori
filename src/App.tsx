import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { OSMPreviewMap } from "@/components/map/osm-preview-map";
import { GeoUtils } from "@/lib/geo-utils";
import { AppPhase, phaseViewModel } from "@/state/app-state";

type TerrainViewerLike = {
  currentMesh: unknown;
  camera: { fov: number; updateProjectionMatrix: () => void };
  update: (data: unknown, config: unknown) => { width: number; height: number };
  startViewpointPick: (onPicked: (point: WorldPoint) => void) => void;
  applyAtmosphere: (params: { skyPreset: string; timePreset: string }) => void;
  enterStreetView: (point: WorldPoint, eyeHeight: number) => void;
  resetView: () => void;
};

type MapDataProviderLike = {
  fetchMapData: (
    bounds: unknown,
    zoom: number,
    fetchPhoto: boolean,
    onProgress?: (progress: { loaded: number; total: number }) => void
  ) => Promise<unknown>;
};

type PhaseType = (typeof AppPhase)[keyof typeof AppPhase];

type Center = {
  lat: number;
  lng: number;
  label: string;
};

type Terrain = {
  width: number;
  height: number;
  zoom: number;
};

type MeshInfo = {
  width: number;
  height: number;
};

type WorldPoint = {
  x: number;
  y: number;
  z: number;
};

type PresetKey = "wide" | "mid" | "focus";

const QUICK_LOCATIONS = [
  { label: "富士山", centerLabel: "富士山周辺", lat: 35.3606, lng: 138.7273 },
  { label: "横浜", centerLabel: "横浜エリア", lat: 35.4547, lng: 139.6316 },
  { label: "箱根", centerLabel: "箱根エリア", lat: 35.2323, lng: 139.1069 }
] as const;

const PRESETS: Record<PresetKey, Terrain & { label: string }> = {
  wide: { label: "広域 40km", width: 40, height: 40, zoom: 12 },
  mid: { label: "中域 18km", width: 18, height: 18, zoom: 13 },
  focus: { label: "焦点 8km", width: 8, height: 8, zoom: 15 }
};

const MAX_TILE_COUNT = 1000;

function getZoomLabel(zoom: number) {
  const labels: Record<number, string> = {
    12: "標準（推奨）",
    13: "精細",
    14: "高精細",
    15: "最高精細"
  };
  return labels[zoom] || "標準（推奨）";
}

function formatLoadEstimate(width: number, height: number, zoom: number) {
  const area = width * height;
  const zoomFactor = Math.max(1, zoom - 8);
  const score = (area * zoomFactor) / 220;
  if (score < 1.2) return "推定負荷: 低 / 目安時間: 15秒";
  if (score < 2.8) return "推定負荷: 中 / 目安時間: 40秒";
  return "推定負荷: 高 / 目安時間: 90秒以上";
}

function formatWorldPoint(point: WorldPoint) {
  return `${point.x.toFixed(0)}m, ${point.y.toFixed(0)}m, ${point.z.toFixed(0)}m`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "不明なエラーが発生しました。";
}

export function App() {
  const viewerRootRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<TerrainViewerLike | null>(null);
  const providerRef = useRef<MapDataProviderLike | null>(null);

  const [phase, setPhase] = useState<PhaseType>(AppPhase.SPLASH);
  const [showSplash, setShowSplash] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadingVisible, setLoadingVisible] = useState(false);
  const [loadingText, setLoadingText] = useState("標高タイルを取得しています...");
  const [searchStatus, setSearchStatus] = useState("まず地点を検索して中心点を設定してください。");
  const [detailOverride, setDetailOverride] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [center, setCenter] = useState<Center>({
    lat: 35.3606,
    lng: 138.7273,
    label: "富士山周辺"
  });
  const [pendingCenter, setPendingCenter] = useState<Center>({
    lat: 35.3606,
    lng: 138.7273,
    label: "富士山周辺"
  });
  const [terrain, setTerrain] = useState<Terrain>({ width: 40, height: 40, zoom: 12 });
  const [cameraFov, setCameraFov] = useState(55);
  const [eyeHeight, setEyeHeight] = useState(1.6);
  const [timePreset, setTimePreset] = useState("day");
  const [isLocked, setIsLocked] = useState(true);
  const [activePreset, setActivePreset] = useState<PresetKey | null>("wide");
  const [hasGeneratedMesh, setHasGeneratedMesh] = useState(false);
  const [selectedViewpoint, setSelectedViewpoint] = useState<WorldPoint | null>(null);
  const [placementGuide, setPlacementGuide] = useState(
    "地形生成後に、見たい地点を指定して人間視点の360°確認を行えます。"
  );
  const [meshInfo, setMeshInfo] = useState<MeshInfo | null>(null);

  const vm = phaseViewModel[phase] || phaseViewModel[AppPhase.IDLE];
  const statusDetail = detailOverride || vm.detail;

  useEffect(() => {
    let disposed = false;
    async function initializeViewer() {
      if (!viewerRootRef.current) return;
      const { TerrainViewer } = await import("@/viewer/terrain-viewer");
      if (disposed || !viewerRootRef.current) return;
      viewerRef.current = new TerrainViewer(viewerRootRef.current) as TerrainViewerLike;
    }
    void initializeViewer();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    document.body.dataset.state = phase;
  }, [phase]);

  function estimateTileCoverage(width: number, height: number, zoom: number) {
    const bounds = GeoUtils.calculateBounds(center.lat, center.lng, width, height);
    const startX = GeoUtils.lon2tile(bounds.west, zoom);
    const endX = GeoUtils.lon2tile(bounds.east, zoom);
    const startY = GeoUtils.lat2tile(bounds.north, zoom);
    const endY = GeoUtils.lat2tile(bounds.south, zoom);
    const countX = endX - startX + 1;
    const countY = endY - startY + 1;
    return countX * countY;
  }

  function applyTileLimit(width: number, height: number, zoom: number) {
    const currentTiles = estimateTileCoverage(width, height, zoom);
    if (currentTiles <= MAX_TILE_COUNT) {
      return { width, height, notice: null as string | null };
    }

    let low = 0.05;
    let high = 1;
    for (let i = 0; i < 20; i += 1) {
      const mid = (low + high) / 2;
      const tiles = estimateTileCoverage(width * mid, height * mid, zoom);
      if (tiles <= MAX_TILE_COUNT) {
        low = mid;
      } else {
        high = mid;
      }
    }

    let nextWidth = Math.max(4, Math.floor(width * low));
    let nextHeight = Math.max(4, Math.floor(height * low));
    while (estimateTileCoverage(nextWidth, nextHeight, zoom) > MAX_TILE_COUNT && (nextWidth > 4 || nextHeight > 4)) {
      if (nextWidth > 4) nextWidth -= 1;
      if (nextHeight > 4) nextHeight -= 1;
    }

    return {
      width: nextWidth,
      height: nextHeight,
      notice: `選択した細かさでは範囲が広すぎるため、範囲を ${nextWidth}km x ${nextHeight}km に自動調整しました。`
    };
  }

  function markReadyIfAvailable() {
    if (phase === AppPhase.SPLASH || phase === AppPhase.GENERATING) return;
    setPhase(AppPhase.READY_TO_GENERATE);
    setDetailOverride(null);
  }

  function updateTerrain(nextTerrain: Terrain, nextPreset: PresetKey | null = null) {
    const limited = applyTileLimit(nextTerrain.width, nextTerrain.height, nextTerrain.zoom);
    setTerrain({
      width: limited.width,
      height: limited.height,
      zoom: nextTerrain.zoom
    });
    setActivePreset(nextPreset);
    if (limited.notice) {
      setSearchStatus(limited.notice);
      setDetailOverride("選択した細かさの上限に合わせて範囲を自動調整しました。必要なら細かさを下げてください。");
    }
    markReadyIfAvailable();
  }

  function setCenterPoint(lat: number | string, lng: number | string, label: string, query = "") {
    const nextCenter = { lat: Number(lat), lng: Number(lng), label };
    setCenter(nextCenter);
    setPendingCenter(nextCenter);
    if (query) setSearchQuery(query);
  }

  async function searchLocation() {
    const query = searchQuery.trim();
    if (!query) {
      setPhase(AppPhase.ERROR);
      setDetailOverride("原因: 地点未入力 / 影響: 中心点未設定 / 次: 地点名を入力して再検索してください。");
      setSearchStatus("中心地点を入力してください。");
      return;
    }

    let autoPreviewStarted = false;
    setBusy(true);
    setPhase(AppPhase.SEARCHING);
    setDetailOverride(null);
    setSearchStatus(`地点を検索中: ${query}`);

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
      const data = (await response.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("地点が見つかりません。別のキーワードで再検索してください。");
      }
      const result = data[0];
      const nextCenter: Center = {
        lat: Number(result.lat),
        lng: Number(result.lon),
        label: result.display_name || query
      };
      const previewTerrain: Terrain = { width: 18, height: 18, zoom: 12 };

      setCenterPoint(nextCenter.lat, nextCenter.lng, nextCenter.label, query);
      setTerrain(previewTerrain);
      setActivePreset(null);
      setSearchStatus(`中心地点を設定しました: ${nextCenter.label} / 標準ズーム(12)で地形を表示します。`);
      autoPreviewStarted = true;
      await generateTerrain({
        trigger: "search-auto",
        terrainOverride: previewTerrain,
        centerOverride: nextCenter
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setPhase(AppPhase.ERROR);
      setDetailOverride(`原因: ${message} / 影響: 中心点未更新 / 次: 検索語を見直して再試行してください。`);
      setSearchStatus(message);
    } finally {
      if (!autoPreviewStarted) {
        setBusy(false);
      }
    }
  }

  async function generateTerrain(options?: { trigger?: "manual" | "search-auto"; terrainOverride?: Terrain; centerOverride?: Center }) {
    const viewer = viewerRef.current;
    if (!viewer) {
      setSearchStatus("3Dビューを初期化中です。数秒待って再試行してください。");
      return;
    }

    const terrainForGeneration = options?.terrainOverride ?? terrain;
    const centerForGeneration = options?.centerOverride ?? center;

    setBusy(true);
    setLoadingVisible(true);
    setLoadingText("標高タイルを取得しています...");
    setPhase(AppPhase.GENERATING);
    setDetailOverride(null);

    try {
      if (!providerRef.current) {
        const { MapDataProvider } = await import("@/services/map-data-provider");
        providerRef.current = new MapDataProvider() as unknown as MapDataProviderLike;
      }
      const bounds = GeoUtils.calculateBounds(
        centerForGeneration.lat,
        centerForGeneration.lng,
        terrainForGeneration.width,
        terrainForGeneration.height
      );
      const data = await providerRef.current.fetchMapData(bounds, terrainForGeneration.zoom, true, ({ loaded, total }) => {
        setLoadingText(`標高タイルを取得しています... ${loaded}/${total}`);
        setDetailOverride(`広域タイルを処理中です (${loaded}/${total})`);
      });

      const nextMeshInfo = viewer.update(data, {
        centerLat: centerForGeneration.lat,
        centerLng: centerForGeneration.lng,
        widthKm: terrainForGeneration.width,
        heightKm: terrainForGeneration.height,
        zoom: terrainForGeneration.zoom,
        useTexture: true
      });

      setMeshInfo(nextMeshInfo);
      setHasGeneratedMesh(true);
      setSelectedViewpoint(null);
      setPhase(AppPhase.GENERATED);
      setDetailOverride(null);
      setPlacementGuide("1. 地形上の見たい地点を指定 2. 目線高さで360°を確認");
      setSearchStatus(
        options?.trigger === "search-auto"
          ? "検索地点の地形を標準ズーム(12)で表示しました。必要なら範囲や細かさを調整して再生成してください。"
          : "地形を生成しました。必要なら視点ポイントを指定して360°で確認してください。"
      );
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setPhase(AppPhase.ERROR);
      setDetailOverride(`原因: ${message} / 影響: 地形未生成 / 次: 範囲を縮小するかズームを下げて再試行してください。`);
      setSearchStatus(message);
    } finally {
      setLoadingVisible(false);
      setBusy(false);
    }
  }

  async function applyPendingCenter(autoPreview: boolean) {
    const nextCenter = pendingCenter;
    setCenter(nextCenter);
    setPhase(AppPhase.READY_TO_GENERATE);
    setDetailOverride(null);
    setSearchStatus("2D地図で確認した中心点を反映しました。");

    if (autoPreview) {
      await generateTerrain({
        trigger: "manual",
        terrainOverride: terrain,
        centerOverride: nextCenter
      });
    }
  }

  function pickViewpointOnTerrain() {
    const viewer = viewerRef.current;
    if (!viewer?.currentMesh) return;

    viewer.startViewpointPick((point) => {
      setSelectedViewpoint(point);
      setPlacementGuide(`視点ポイントを指定しました: ${formatWorldPoint(point)} / 次に「人間視点で360°表示」を押してください。`);
      setSearchStatus("視点ポイントを指定しました。人間視点で360°表示へ進んでください。");
    });
    setPlacementGuide("地形上をクリックして視点ポイントを指定してください。");
    setSearchStatus("視点ポイント指定モードです。地形上をクリックしてください。");
  }

  function showStreetViewMode() {
    const viewer = viewerRef.current;
    if (!viewer?.currentMesh) return;
    if (!selectedViewpoint) {
      setSearchStatus("先に「視点ポイントを地形上で指定」で地点を選んでください。");
      setPlacementGuide("視点ポイントが未指定です。地形上の地点を1つ選択してください。");
      return;
    }

    viewer.camera.fov = Math.min(120, Math.max(20, cameraFov));
    viewer.camera.updateProjectionMatrix();
    viewer.applyAtmosphere({ skyPreset: "clear", timePreset });
    viewer.enterStreetView(selectedViewpoint, eyeHeight);
    setSearchStatus("人間視点で360°確認中です。ドラッグで周囲を見渡せます。");
    setPlacementGuide(`視点高さ ${eyeHeight.toFixed(1)}m / ドラッグで360°確認 / 視点を戻すで終了`);
  }

  function exportTerrain() {
    const viewer = viewerRef.current;
    if (!viewer?.currentMesh) return;

    setBusy(true);
    setPhase(AppPhase.GENERATING);
    setDetailOverride("GLB 出力を準備しています。");

    import("three/examples/jsm/exporters/GLTFExporter.js")
      .then(({ GLTFExporter }) => {
        const exporter = new GLTFExporter();
        (viewer.currentMesh as { updateMatrixWorld: (force: boolean) => void }).updateMatrixWorld(true);
        exporter.parse(
          viewer.currentMesh as object,
          (glb: ArrayBuffer) => {
            const filename = `morimorimori_terrain_${Date.now()}.glb`;
            const blob = new Blob([glb], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            setPhase(AppPhase.GENERATED);
            setDetailOverride(`${filename} を保存しました。必要なら視点ポイントを指定して360°確認してください。`);
            setBusy(false);
          },
          (error: unknown) => {
            const message = getErrorMessage(error);
            setPhase(AppPhase.ERROR);
            setDetailOverride(`原因: ${message || "書き出し失敗"} / 影響: ファイル未保存 / 次: 再試行してください。`);
            setBusy(false);
          },
          { binary: true }
        );
      })
      .catch((error: unknown) => {
        const message = getErrorMessage(error);
        setPhase(AppPhase.ERROR);
        setDetailOverride(`原因: ${message || "書き出し機能の初期化失敗"} / 影響: ファイル未保存 / 次: 再試行してください。`);
        setBusy(false);
      });
  }

  function openWorkspace(withSample: boolean) {
    setShowSplash(false);
    if (withSample) {
      setCenterPoint(35.3606, 138.7273, "富士山周辺", "富士山");
      updateTerrain(PRESETS.wide, "wide");
      setPhase(AppPhase.READY_TO_GENERATE);
      setSearchStatus("サンプル条件を適用しました。地形生成から開始してください。");
      return;
    }
    setPhase(AppPhase.IDLE);
    setDetailOverride(null);
    setSearchStatus("まず地点を検索してください。検索後に標準ズーム(12)で地形を自動表示します。");
  }

  function onWidthChange(value: number[]) {
    const width = value[0];
    const nextHeight = isLocked ? width : terrain.height;
    updateTerrain({ ...terrain, width, height: nextHeight });
  }

  function onHeightChange(value: number[]) {
    const height = value[0];
    const nextWidth = isLocked ? height : terrain.width;
    updateTerrain({ ...terrain, width: nextWidth, height });
  }

  function onZoomChange(value: string) {
    updateTerrain({ ...terrain, zoom: Number(value) });
  }

  function onMainAction() {
    if (phase === AppPhase.IDLE || phase === AppPhase.SEARCHING) {
      void searchLocation();
      return;
    }
    void generateTerrain();
  }

  function onPreset(presetKey: PresetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    updateTerrain({ width: preset.width, height: preset.height, zoom: preset.zoom }, presetKey);
    setSearchStatus(`${preset.label} を適用しました。`);
  }

  const mainActionDisabled = busy || phase === AppPhase.SEARCHING || phase === AppPhase.GENERATING;
  const totalArea = `${(terrain.width * terrain.height).toFixed(2)} km²`;
  const centerMeta = `中心: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)} (${center.label})`;
  const summaryResolution = meshInfo
    ? `細かさ ${getZoomLabel(terrain.zoom)} / ${meshInfo.width} x ${meshInfo.height} / FOV ${cameraFov}`
    : `細かさ ${getZoomLabel(terrain.zoom)} / FOV ${cameraFov}`;

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#0b1120_45%,#020617_100%)] text-slate-50"
      data-state={phase}
    >
      {loadingVisible ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md">
          <Card className="w-[92vw] max-w-sm border-slate-600 bg-slate-900/90">
            <CardHeader>
              <CardTitle>広域地形を生成しています</CardTitle>
              <CardDescription className="text-slate-300">{loadingText}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      {showSplash ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm" data-component="SplashOverlay">
          <Card className="w-[92vw] max-w-xl border-slate-600 bg-slate-900/95">
            <CardHeader>
              <CardTitle className="text-3xl font-black tracking-tight">Morimorimori</CardTitle>
              <CardDescription className="text-base text-slate-300">
                まず地形を生成し、GLB を保存してから配置・視点検証へ進みます。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Button className="sm:flex-1" data-action="enter-workspace" onClick={() => openWorkspace(false)}>
                制作を始める
              </Button>
              <Button className="sm:flex-1" data-action="apply-sample" onClick={() => openWorkspace(true)} variant="secondary">
                富士山のサンプルで始める
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <main className="mx-auto grid min-h-screen max-w-[1800px] grid-cols-1 gap-4 p-3 lg:grid-cols-[minmax(320px,420px)_1fr_minmax(220px,280px)] lg:p-4">
        <Card className="order-2 border-slate-700 bg-slate-900/75 lg:order-1" data-component="ControlPanel">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl">Morimorimori</CardTitle>
                <CardDescription className="text-slate-300">VR遠景地形スタジオ</CardDescription>
              </div>
              <Badge data-component="StatusPill">{vm.pill}</Badge>
            </div>
            <p className="text-lg font-semibold">{vm.title}</p>
            <p className="text-sm text-slate-300">{statusDetail}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-cyan-200">ステップ1: 地点を設定</h2>
              <div className="flex gap-2">
                <Input
                  data-component="SearchQuery"
                  aria-label="中心地点を検索"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void searchLocation();
                  }}
                  placeholder="例: 富士山、箱根、横浜"
                  value={searchQuery}
                />
                <Button data-action="search-location" disabled={busy} onClick={() => void searchLocation()} variant="secondary">
                  検索
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_LOCATIONS.map((location) => (
                  <Button
                    key={location.label}
                    data-action="quick-location"
                    onClick={() => {
                      setCenterPoint(location.lat, location.lng, location.centerLabel, location.label);
                      setPhase(AppPhase.READY_TO_GENERATE);
                      setDetailOverride(null);
                      setSearchStatus(`${location.centerLabel} を中心地点に設定しました。`);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    {location.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-slate-300">{centerMeta}</p>
              <div className="space-y-2 rounded-md border border-slate-700 bg-slate-800/50 p-2">
                <p className="text-xs font-medium text-cyan-200">2D地図で位置確認（OSM）</p>
                <OSMPreviewMap
                  center={pendingCenter}
                  heightKm={terrain.height}
                  onPickCenter={(picked) => {
                    setPendingCenter({
                      lat: picked.lat,
                      lng: picked.lng,
                      label: `地図指定 ${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}`
                    });
                    setSearchStatus("2D地図で候補地点を指定しました。「地図中心を反映」で確定できます。");
                  }}
                  widthKm={terrain.width}
                />
                <p className="text-[11px] text-slate-300">
                  候補中心: {pendingCenter.lat.toFixed(4)}, {pendingCenter.lng.toFixed(4)} / 青枠は現在の生成範囲
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => void applyPendingCenter(false)} size="sm" variant="secondary">
                    地図中心を反映
                  </Button>
                  <Button onClick={() => void applyPendingCenter(true)} size="sm" variant="outline">
                    反映して地形を生成
                  </Button>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-cyan-200">ステップ2: 地形を生成</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PRESETS).map(([key, preset]) => (
                  <Button
                    className={activePreset === key ? "ring-2 ring-cyan-300 ring-offset-0" : ""}
                    data-action="apply-preset"
                    key={key}
                    onClick={() => onPreset(key as PresetKey)}
                    size="sm"
                    variant="outline"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>幅</span>
                  <span>{terrain.width.toFixed(1)} km</span>
                </div>
                <Slider data-component="WidthRange" max={80} min={4} onValueChange={onWidthChange} step={1} value={[terrain.width]} />
              </div>

              <div className="flex items-center justify-between rounded-md border border-slate-700 px-3 py-2">
                <span className="text-sm">{isLocked ? "縦横比を固定中" : "縦横比を個別調整"}</span>
                <Switch
                  data-action="toggle-ratio-lock"
                  checked={isLocked}
                  onCheckedChange={(checked) => {
                    setIsLocked(checked);
                    if (checked) {
                      updateTerrain({ ...terrain, height: terrain.width }, activePreset);
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>奥行</span>
                  <span>{terrain.height.toFixed(1)} km</span>
                </div>
                <Slider data-component="HeightRange" max={80} min={4} onValueChange={onHeightChange} step={1} value={[terrain.height]} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">地形の細かさ</label>
                <Select onValueChange={onZoomChange} value={String(terrain.zoom)}>
                  <SelectTrigger data-component="ZoomSelect">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">標準（推奨）</SelectItem>
                    <SelectItem value="13">精細</SelectItem>
                    <SelectItem value="14">高精細</SelectItem>
                    <SelectItem value="15">最高精細</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-300">目安: 細かくするほど地形の凹凸は正確になりますが、生成時間は長くなります。</p>
              </div>

              <div className="rounded-md border border-slate-700 bg-slate-800/60 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>総面積</span>
                  <strong>{totalArea}</strong>
                </div>
                <p className="mt-1 text-xs text-slate-300">{formatLoadEstimate(terrain.width, terrain.height, terrain.zoom)}</p>
              </div>
            </section>

            <section className="space-y-3 rounded-md border border-slate-700 bg-slate-800/50 p-3">
              <h2 className="text-sm font-semibold text-cyan-200">ステップ3: 視点ポイントと360°確認（生成後）</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium">FOV(度)</label>
                  <Input
                    data-component="CameraFov"
                    max={120}
                    min={20}
                    onChange={(event) => {
                      setCameraFov(Number(event.target.value || 55));
                      markReadyIfAvailable();
                    }}
                    step={1}
                    type="number"
                    value={cameraFov}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">視点の高さ(m)</label>
                  <Input
                    data-component="EyeHeight"
                    max={3}
                    min={1}
                    onChange={(event) => setEyeHeight(Number(event.target.value || 1.6))}
                    step={0.1}
                    type="number"
                    value={eyeHeight}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">時間帯</label>
                <Select
                  onValueChange={(value) => {
                    setTimePreset(value);
                    markReadyIfAvailable();
                  }}
                  value={timePreset}
                >
                  <SelectTrigger data-component="TimePreset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">朝</SelectItem>
                    <SelectItem value="day">昼</SelectItem>
                    <SelectItem value="evening">夕</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button data-action="apply-viewpoint" disabled={busy || !hasGeneratedMesh} onClick={pickViewpointOnTerrain} variant="secondary">
                  視点ポイントを地形上で指定
                </Button>
                <Button data-action="show-placement-guide" disabled={busy || !hasGeneratedMesh} onClick={showStreetViewMode} variant="outline">
                  人間視点で360°表示
                </Button>
              </div>
              <p className="text-xs text-slate-300">{placementGuide}</p>
            </section>

            <section className="space-y-3 border-t border-slate-700 pt-4">
              <Button className="w-full" data-action="generate-terrain" disabled={mainActionDisabled} onClick={onMainAction}>
                {vm.action}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button data-action="export-glb" disabled={busy || !hasGeneratedMesh} onClick={exportTerrain} variant="secondary">
                  3Dモデルを保存
                </Button>
                <Button
                  data-action="reset-camera"
                  disabled={busy || !hasGeneratedMesh}
                  onClick={() => {
                    viewerRef.current?.resetView();
                    if (selectedViewpoint) {
                      setPlacementGuide("視点を戻しました。必要なら別地点を指定して再確認できます。");
                    }
                    setDetailOverride("視点を地形全体が見える位置に戻しました。");
                  }}
                  variant="outline"
                >
                  視点を戻す
                </Button>
              </div>
              <p className="text-sm text-amber-100">{searchStatus}</p>
            </section>

            <p className="text-xs text-slate-400">出力メモ: Unity は 1unit=1m、Unreal は 1uu=1cm。Y-up / Z-up 差分に注意してください。</p>
          </CardContent>
        </Card>

        <section className="order-1 min-h-[44vh] overflow-hidden rounded-xl border border-slate-700 bg-slate-950/50 lg:order-2 lg:min-h-[calc(100vh-2rem)]">
          <div className="h-full w-full" data-component="ViewerRoot" ref={viewerRootRef} />
        </section>

        <aside className="order-3 flex flex-col gap-3">
          <Card className="border-slate-700 bg-slate-900/70">
            <CardHeader>
              <CardTitle className="text-sm">中心地点</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{center.label}</p>
              <p className="text-xs text-slate-300">
                {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-700 bg-slate-900/70">
            <CardHeader>
              <CardTitle className="text-sm">範囲と解像度</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">
                {terrain.width.toFixed(1)} x {terrain.height.toFixed(1)} km
              </p>
              <p className="text-xs text-slate-300">{summaryResolution}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-700 bg-slate-900/70">
            <CardHeader>
              <CardTitle className="text-sm">操作ヒント</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-300">ドラッグ: 回転 / スクロール: 拡大縮小 / 右ドラッグ: 平行移動</p>
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
