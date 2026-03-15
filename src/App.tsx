import { useEffect, useRef, useState } from "react";
import { GeoUtils } from "@/lib/geo-utils";
import { AppPhase, phaseViewModel } from "@/state/app-state";

type TerrainViewerLike = {
  currentMesh: unknown;
  camera: { fov: number; updateProjectionMatrix: () => void };
  update: (
    data: unknown,
    config: { centerLat: number; centerLng: number; widthKm: number; heightKm: number; zoom: number; useTexture: boolean }
  ) => { width: number; height: number };
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
  ) => Promise<{
    diagnostics?: {
      demMissingCount?: number;
      demMissingSamples?: string[];
      invalidHeightCount?: number;
    };
  }>;
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

type ErrorInfo = {
  cause: string;
  impact: string;
  next: string;
};

type PresetKey = "wide" | "mid" | "focus";
type GenerationMode = "single-point" | "two-points";
type TwoPointMarginPreset = "tight" | "standard" | "wide";

type TwoPointGenerationPlan = {
  center: Center;
  terrain: Terrain;
  distanceKm: number;
  notice: string | null;
  tileCount: number;
  valid: boolean;
};

type FeaturedLocation = {
  label: string;
  centerLabel: string;
  area: string;
  lat: number;
  lng: number;
};

const FEATURED_LOCATIONS: FeaturedLocation[] = [
  { label: "富士山", centerLabel: "富士山周辺", area: "山梨 / 静岡", lat: 35.3606, lng: 138.7273 },
  { label: "横浜駅", centerLabel: "横浜駅周辺", area: "神奈川", lat: 35.4662, lng: 139.6227 },
  { label: "大山", centerLabel: "大山周辺", area: "鳥取", lat: 35.3713, lng: 133.5389 },
  { label: "白山", centerLabel: "白山周辺", area: "石川 / 岐阜", lat: 36.1551, lng: 136.7713 },
  { label: "阿蘇山", centerLabel: "阿蘇山周辺", area: "熊本", lat: 32.8847, lng: 131.1044 },
  { label: "東京駅", centerLabel: "東京駅周辺", area: "東京", lat: 35.6812, lng: 139.7671 },
  { label: "大阪駅", centerLabel: "大阪駅周辺", area: "大阪", lat: 34.7025, lng: 135.4959 },
  { label: "札幌駅", centerLabel: "札幌駅周辺", area: "北海道", lat: 43.0687, lng: 141.3508 },
  { label: "仙台駅", centerLabel: "仙台駅周辺", area: "宮城", lat: 38.2606, lng: 140.8826 },
  { label: "那覇空港", centerLabel: "那覇空港周辺", area: "沖縄", lat: 26.1958, lng: 127.6469 }
] as const;

const PRESETS: Record<PresetKey, Terrain & { label: string }> = {
  wide: { label: "ワイド 40km（遠景）", width: 40, height: 40, zoom: 12 },
  mid: { label: "標準 18km（推奨）", width: 18, height: 18, zoom: 12 },
  focus: { label: "詳細 8km（近景）", width: 8, height: 8, zoom: 15 }
};

const MAX_TILE_COUNT = 1000;
const TWO_POINT_ZOOM_CANDIDATES = [12, 11, 10, 9, 8] as const;
const TWO_POINT_MARGIN_PRESETS: Record<TwoPointMarginPreset, { label: string; scale: number; helper: string }> = {
  tight: { label: "狭める", scale: 0.8, helper: "余白を抑えて2地点を近めに収めます。" },
  standard: { label: "標準", scale: 1, helper: "2地点を標準的な余白で収めます。" },
  wide: { label: "広め", scale: 1.35, helper: "2地点の周辺を広めに含めます。" }
};
const DEFAULT_CENTER: Center = {
  lat: 35.6812,
  lng: 139.7671,
  label: "東京駅周辺"
};
const DEFAULT_TERRAIN: Terrain = {
  width: 18,
  height: 18,
  zoom: 12
};
const INITIAL_PLACEMENT_GUIDE = "生成後に任意で視点ポイントを置き、人間視点の360°確認へ進めます。";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "不明なエラーが発生しました。";
}

function getMapThumbnailUrl(lat: number, lng: number, zoom = 9) {
  const x = GeoUtils.lon2tile(lng, zoom);
  const y = GeoUtils.lat2tile(lat, zoom);
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

function getZoomLabel(zoom: number) {
  const labels: Record<number, string> = {
    12: "標準（推奨）",
    13: "精細",
    14: "高精細",
    15: "最高精細"
  };
  return labels[zoom] || "標準（推奨）";
}

function formatWorldPoint(point: WorldPoint) {
  return `${point.x.toFixed(0)}m, ${point.y.toFixed(0)}m, ${point.z.toFixed(0)}m`;
}

function formatErrorDetail(errorInfo: ErrorInfo) {
  return `原因: ${errorInfo.cause} / 影響: ${errorInfo.impact} / 次: ${errorInfo.next}`;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateGreatCircleDistanceKm(start: Center, end: Center) {
  const earthRadiusKm = 6371;
  const latDiff = toRadians(end.lat - start.lat);
  const lonDiff = toRadians(end.lng - start.lng);
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const a = Math.sin(latDiff / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDiff / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function estimateTileCoverage(center: Center, width: number, height: number, zoom: number) {
  const bounds = GeoUtils.calculateBounds(center.lat, center.lng, width, height);
  const startX = GeoUtils.lon2tile(bounds.west, zoom);
  const endX = GeoUtils.lon2tile(bounds.east, zoom);
  const startY = GeoUtils.lat2tile(bounds.north, zoom);
  const endY = GeoUtils.lat2tile(bounds.south, zoom);
  return (endX - startX + 1) * (endY - startY + 1);
}

function applyTileLimit(center: Center, width: number, height: number, zoom: number) {
  if (estimateTileCoverage(center, width, height, zoom) <= MAX_TILE_COUNT) {
    return { width, height, notice: null as string | null };
  }

  let low = 0.05;
  let high = 1;

  for (let i = 0; i < 20; i += 1) {
    const mid = (low + high) / 2;
    const tiles = estimateTileCoverage(center, width * mid, height * mid, zoom);
    if (tiles <= MAX_TILE_COUNT) {
      low = mid;
    } else {
      high = mid;
    }
  }

  let nextWidth = Math.max(4, Math.floor(width * low));
  let nextHeight = Math.max(4, Math.floor(height * low));

  while (estimateTileCoverage(center, nextWidth, nextHeight, zoom) > MAX_TILE_COUNT && (nextWidth > 4 || nextHeight > 4)) {
    if (nextWidth > 4) nextWidth -= 1;
    if (nextHeight > 4) nextHeight -= 1;
  }

  return {
    width: nextWidth,
    height: nextHeight,
    notice: `タイル上限を超えたため、範囲を ${nextWidth}km x ${nextHeight}km に調整しました。`
  };
}

function buildTwoPointGenerationPlan(start: Center, end: Center, marginScale = 1): TwoPointGenerationPlan {
  const derivedCenter: Center = {
    lat: (start.lat + end.lat) / 2,
    lng: (start.lng + end.lng) / 2,
    label: `${start.label} - ${end.label} の中間`
  };

  const metersPerDegree = GeoUtils.getMetersPerDegree(derivedCenter.lat);
  const deltaWidthKm = (Math.abs(end.lng - start.lng) * metersPerDegree.lon) / 1000;
  const deltaHeightKm = (Math.abs(end.lat - start.lat) * metersPerDegree.lat) / 1000;
  const distanceKm = calculateGreatCircleDistanceKm(start, end);
  const marginKm = Math.max(2, distanceKm * 0.12 * marginScale);
  const plannedWidthKm = Math.max(8, deltaWidthKm + marginKm * 2);
  const plannedHeightKm = Math.max(8, deltaHeightKm + marginKm * 2);

  const selectedZoom =
    TWO_POINT_ZOOM_CANDIDATES.find((candidateZoom) => {
      return estimateTileCoverage(derivedCenter, plannedWidthKm, plannedHeightKm, candidateZoom) <= MAX_TILE_COUNT;
    }) ?? TWO_POINT_ZOOM_CANDIDATES[TWO_POINT_ZOOM_CANDIDATES.length - 1];

  const tileCount = estimateTileCoverage(derivedCenter, plannedWidthKm, plannedHeightKm, selectedZoom);
  const valid = tileCount <= MAX_TILE_COUNT;
  let notice: string | null = null;

  if (!valid) {
    notice = "2地点が離れすぎてタイル上限を超えます。より近い2地点を指定してください。";
  } else if (selectedZoom < TWO_POINT_ZOOM_CANDIDATES[0]) {
    notice = `2地点全体を含めるため、細かさを Zoom ${selectedZoom} に自動調整しました。`;
  }

  return {
    center: derivedCenter,
    terrain: {
      width: Number(plannedWidthKm.toFixed(1)),
      height: Number(plannedHeightKm.toFixed(1)),
      zoom: selectedZoom
    },
    distanceKm,
    notice,
    tileCount,
    valid
  };
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

  const [statusMessage, setStatusMessage] = useState("地点を選ぶと生成準備に進みます。");
  const [detailOverride, setDetailOverride] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  const [generationMode, setGenerationMode] = useState<GenerationMode>("single-point");
  const [twoPointMarginPreset, setTwoPointMarginPreset] = useState<TwoPointMarginPreset>("standard");
  const [searchQuery, setSearchQuery] = useState("");
  const [secondarySearchQuery, setSecondarySearchQuery] = useState("");
  const [center, setCenter] = useState<Center>(DEFAULT_CENTER);
  const [secondaryPoint, setSecondaryPoint] = useState<Center | null>(null);
  const [hasSelectedLocation, setHasSelectedLocation] = useState(false);

  const [terrain, setTerrain] = useState<Terrain>(DEFAULT_TERRAIN);
  const [activePreset, setActivePreset] = useState<PresetKey>("mid");

  const [hasGeneratedMesh, setHasGeneratedMesh] = useState(false);
  const [meshInfo, setMeshInfo] = useState<MeshInfo | null>(null);

  const [showOptionalFinishing, setShowOptionalFinishing] = useState(false);
  const [selectedViewpoint, setSelectedViewpoint] = useState<WorldPoint | null>(null);
  const [placementGuide, setPlacementGuide] = useState(INITIAL_PLACEMENT_GUIDE);
  const [cameraFov, setCameraFov] = useState(55);
  const [eyeHeight, setEyeHeight] = useState(1.6);
  const [timePreset, setTimePreset] = useState("day");

  const vm = phaseViewModel[phase] || phaseViewModel[AppPhase.IDLE];
  const statusDetail = detailOverride ?? vm.detail;
  const useTwoPointMode = generationMode === "two-points";
  const selectedTwoPointMargin = TWO_POINT_MARGIN_PRESETS[twoPointMarginPreset];
  const twoPointPlanPreview =
    useTwoPointMode && secondaryPoint ? buildTwoPointGenerationPlan(center, secondaryPoint, selectedTwoPointMargin.scale) : null;
  const hasRequiredLocation = hasSelectedLocation && (!useTwoPointMode || (secondaryPoint !== null && twoPointPlanPreview?.valid === true));
  const summaryCenter = useTwoPointMode && twoPointPlanPreview ? twoPointPlanPreview.center : center;
  const summaryTerrain = useTwoPointMode && twoPointPlanPreview ? twoPointPlanPreview.terrain : terrain;
  const centerMeta = useTwoPointMode
    ? `開始: ${center.label}${secondaryPoint ? ` / 終点: ${secondaryPoint.label}` : " / 終点: 未指定"}`
    : `中心地点: ${center.label}（${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}）`;
  const estimatedTiles = useTwoPointMode && twoPointPlanPreview
    ? twoPointPlanPreview.tileCount
    : estimateTileCoverage(summaryCenter, summaryTerrain.width, summaryTerrain.height, summaryTerrain.zoom);

  const matchedPreset = (Object.entries(PRESETS).find(([, preset]) => {
    return preset.width === summaryTerrain.width && preset.height === summaryTerrain.height && preset.zoom === summaryTerrain.zoom;
  })?.[0] ?? null) as PresetKey | null;
  const presetLabel = useTwoPointMode ? "2地点自動包含" : matchedPreset ? PRESETS[matchedPreset].label : "カスタム設定";

  const canGenerate = hasRequiredLocation && !busy && phase !== AppPhase.SEARCHING && phase !== AppPhase.GENERATING;
  const canSave = phase === AppPhase.GENERATED && hasGeneratedMesh && !busy;
  const showFinishingSection = phase === AppPhase.GENERATED && hasGeneratedMesh;

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

  function setErrorState(nextError: ErrorInfo) {
    setErrorInfo(nextError);
    setDetailOverride(formatErrorDetail(nextError));
    setStatusMessage(nextError.cause);
    setPhase(AppPhase.ERROR);
    setBusy(false);
    setLoadingVisible(false);
  }

  function clearErrorState() {
    setErrorInfo(null);
    setDetailOverride(null);
  }

  function selectRecommendedLocationFromPrimary() {
    const recommended = FEATURED_LOCATIONS[0];
    setCenterPoint({ lat: recommended.lat, lng: recommended.lng, label: recommended.centerLabel }, recommended.label);
    if (useTwoPointMode) {
      setStatusMessage(`開始地点として ${recommended.centerLabel} を選択しました。次に終点を検索して指定してください。`);
    } else {
      setStatusMessage(
        `おすすめ地点として ${recommended.centerLabel} を選択しました。必要なら地点を変更し、主CTAで地形を生成してください。`
      );
    }
    setDetailOverride("地点はあとから自由に変更できます。まずは生成して成果を確認してください。");
  }

  function openWorkspace() {
    setShowSplash(false);
    setPhase(AppPhase.IDLE);
    setBusy(false);
    setLoadingVisible(false);
    setStatusMessage("最初に地点を選択してください。");
    setDetailOverride(null);
    setErrorInfo(null);
    setGenerationMode("single-point");
    setTwoPointMarginPreset("standard");
    setHasSelectedLocation(false);
    setSecondaryPoint(null);
    setSecondarySearchQuery("");
    setCenter(DEFAULT_CENTER);
    setTerrain(DEFAULT_TERRAIN);
    setActivePreset("mid");
    setHasGeneratedMesh(false);
    setMeshInfo(null);
    setShowOptionalFinishing(false);
    setSelectedViewpoint(null);
    setPlacementGuide(INITIAL_PLACEMENT_GUIDE);
  }

  function setCenterPoint(nextCenter: Center, query?: string) {
    setCenter(nextCenter);
    if (query) {
      setSearchQuery(query);
    }
    setHasSelectedLocation(true);
    clearErrorState();
    if (useTwoPointMode) {
      if (!secondaryPoint) {
        setPhase(AppPhase.IDLE);
        setStatusMessage("開始地点を設定しました。2点目を指定すると生成できます。");
        return;
      }

      const plan = buildTwoPointGenerationPlan(nextCenter, secondaryPoint, selectedTwoPointMargin.scale);
      if (!plan.valid) {
        setPhase(AppPhase.IDLE);
        setStatusMessage(plan.notice || "2地点の距離が広すぎるため、この組み合わせでは生成できません。");
        return;
      }
      setPhase(AppPhase.READY_TO_GENERATE);
      return;
    }

    setPhase(AppPhase.READY_TO_GENERATE);
  }

  function setSecondaryCenterPoint(nextCenter: Center, query?: string) {
    setSecondaryPoint(nextCenter);
    if (query) {
      setSecondarySearchQuery(query);
    }
    clearErrorState();

    if (!hasSelectedLocation) {
      setPhase(AppPhase.IDLE);
      setStatusMessage("先に開始地点を選択してください。");
      return;
    }

    const nextPlan = buildTwoPointGenerationPlan(center, nextCenter, selectedTwoPointMargin.scale);
    if (!nextPlan.valid) {
      setPhase(AppPhase.IDLE);
      setStatusMessage(nextPlan.notice || "2地点の距離が広すぎるため、この組み合わせでは生成できません。");
      return;
    }

    setPhase(AppPhase.READY_TO_GENERATE);
    setStatusMessage(`2地点を設定しました: 開始 ${center.label} / 終点 ${nextCenter.label}。主CTAで地形を生成してください。`);
  }

  function selectFeaturedLocation(location: FeaturedLocation) {
    if (busy) return;

    setCenterPoint({ lat: location.lat, lng: location.lng, label: location.centerLabel }, location.label);
    if (!useTwoPointMode || secondaryPoint) {
      setStatusMessage(`${location.centerLabel} を選択しました。条件を確認して地形を生成してください。`);
    }
    setDetailOverride(null);
  }

  async function findLocationByQuery(query: string) {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      "accept-language": "ja"
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    if (!response.ok) {
      throw new Error("検索サービスへ接続できませんでした。通信状態を確認してください。");
    }

    const data = (await response.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("地点が見つかりません。別のキーワードで再検索してください。");
    }

    const result = data[0];
    return {
      lat: Number(result.lat),
      lng: Number(result.lon),
      label: result.display_name || query
    } as Center;
  }

  async function searchLocation() {
    const query = searchQuery.trim();
    if (!query) {
      setErrorState({
        cause: "地点名が入力されていません。",
        impact: "中心地点が未設定のため、地形生成へ進めません。",
        next: "地点名を入力して再検索してください。"
      });
      return;
    }

    if (busy) return;

    setBusy(true);
    setPhase(AppPhase.SEARCHING);
    clearErrorState();
    setStatusMessage(`「${query}」を検索しています。`);

    try {
      const nextCenter = await findLocationByQuery(query);
      setCenterPoint(nextCenter, query);
      if (!useTwoPointMode || secondaryPoint) {
        setStatusMessage(`中心地点を設定しました。次に「この条件で地形を生成」を実行してください。`);
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setErrorState({
        cause: message,
        impact: "地点が確定していないため、生成条件を固定できません。",
        next: "検索語を見直して再検索してください。"
      });
    } finally {
      setBusy(false);
    }
  }

  async function searchSecondaryLocation() {
    const query = secondarySearchQuery.trim();
    if (!query) {
      setErrorState({
        cause: "終点の地点名が入力されていません。",
        impact: "2地点モードの終点が未設定のため生成へ進めません。",
        next: "終点の地点名を入力して再検索してください。"
      });
      return;
    }

    if (busy) return;

    setBusy(true);
    setPhase(AppPhase.SEARCHING);
    clearErrorState();
    setStatusMessage(`終点候補「${query}」を検索しています。`);

    try {
      const nextCenter = await findLocationByQuery(query);
      setSecondaryCenterPoint(nextCenter, query);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setErrorState({
        cause: message,
        impact: "終点が確定していないため、2地点範囲を計算できません。",
        next: "終点の検索語を見直して再検索してください。"
      });
    } finally {
      setBusy(false);
    }
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void searchLocation();
    }
  }

  function onSecondarySearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void searchSecondaryLocation();
    }
  }

  function onGenerationModeChange(nextMode: GenerationMode) {
    setGenerationMode(nextMode);
    clearErrorState();

    if (nextMode === "single-point") {
      if (hasSelectedLocation) {
        setPhase(AppPhase.READY_TO_GENERATE);
        setStatusMessage("1地点モードに切り替えました。現在の中心地点で生成できます。");
      } else {
        setPhase(AppPhase.IDLE);
        setStatusMessage("1地点モードです。地点を選択してください。");
      }
      return;
    }

    if (!hasSelectedLocation) {
      setPhase(AppPhase.IDLE);
      setStatusMessage("2地点モードです。先に開始地点を選択してください。");
      return;
    }

    if (secondaryPoint) {
      const plan = buildTwoPointGenerationPlan(center, secondaryPoint, selectedTwoPointMargin.scale);
      if (!plan.valid) {
        setPhase(AppPhase.IDLE);
        setStatusMessage(plan.notice || "2地点の距離が広すぎるため、この組み合わせでは生成できません。");
      } else {
        setPhase(AppPhase.READY_TO_GENERATE);
        setStatusMessage(`2地点モードです。開始 ${center.label} / 終点 ${secondaryPoint.label} を生成できます。`);
      }
      return;
    }

    setPhase(AppPhase.IDLE);
    setStatusMessage("2地点モードです。終点を検索して指定してください。");
  }

  function onTwoPointMarginPresetChange(nextPreset: TwoPointMarginPreset) {
    if (twoPointMarginPreset === nextPreset) return;
    setTwoPointMarginPreset(nextPreset);
    clearErrorState();

    if (!useTwoPointMode) return;

    if (!hasSelectedLocation) {
      setPhase(AppPhase.IDLE);
      setStatusMessage("2地点モードです。先に開始地点を選択してください。");
      return;
    }

    if (!secondaryPoint) {
      setPhase(AppPhase.IDLE);
      setStatusMessage("2地点モードです。終点を検索して指定してください。");
      return;
    }

    const nextScale = TWO_POINT_MARGIN_PRESETS[nextPreset].scale;
    const plan = buildTwoPointGenerationPlan(center, secondaryPoint, nextScale);
    if (!plan.valid) {
      setPhase(AppPhase.IDLE);
      setStatusMessage(plan.notice || "2地点の距離が広すぎるため、この余白倍率では生成できません。");
      return;
    }

    setPhase(AppPhase.READY_TO_GENERATE);
    setStatusMessage(`余白倍率を「${TWO_POINT_MARGIN_PRESETS[nextPreset].label}」に変更しました。主CTAで生成できます。`);
  }

  function applyPreset(presetKey: PresetKey) {
    if (busy) return;
    if (useTwoPointMode) return;

    if (!hasSelectedLocation) {
      setPhase(AppPhase.IDLE);
      setStatusMessage("先に地点を選択してください。地点がないと生成条件を確定できません。");
      return;
    }

    const preset = PRESETS[presetKey];
    const limited = applyTileLimit(center, preset.width, preset.height, preset.zoom);
    const nextTerrain: Terrain = {
      width: limited.width,
      height: limited.height,
      zoom: preset.zoom
    };
    const statusNotice = limited.notice ? `${preset.label} を適用しました。${limited.notice}` : `${preset.label} を適用しました。生成準備ができています。`;

    setTerrain(nextTerrain);
    setActivePreset(presetKey);
    clearErrorState();
    setPhase(AppPhase.READY_TO_GENERATE);
    setStatusMessage(statusNotice);
  }

  async function generateTerrain() {
    if (busy) return;

    if (!hasRequiredLocation) {
      setPhase(AppPhase.IDLE);
      setStatusMessage(
        useTwoPointMode ? "2地点モードです。開始地点と終点を指定してください。" : "先に地点を選択してください。地点選択後に生成できます。"
      );
      return;
    }

    const viewer = viewerRef.current;
    if (!viewer) {
      setErrorState({
        cause: "3Dビューを初期化中です。",
        impact: "地形を表示できないため生成を完了できません。",
        next: "数秒待ってから再試行してください。"
      });
      return;
    }

    setBusy(true);
    setLoadingVisible(true);
    setLoadingText("標高タイルを取得しています...");
    setPhase(AppPhase.GENERATING);
    clearErrorState();

    try {
      if (!providerRef.current) {
        const { MapDataProvider } = await import("@/services/map-data-provider");
        providerRef.current = new MapDataProvider() as unknown as MapDataProviderLike;
      }

      let generationCenter = center;
      let generationTerrain = terrain;
      let twoPointDistanceKm: number | null = null;
      let twoPointNotice: string | null = null;
      let twoPointValid = true;

      if (useTwoPointMode && secondaryPoint) {
        const twoPointPlan = buildTwoPointGenerationPlan(center, secondaryPoint, selectedTwoPointMargin.scale);
        generationCenter = twoPointPlan.center;
        generationTerrain = twoPointPlan.terrain;
        twoPointDistanceKm = twoPointPlan.distanceKm;
        twoPointNotice = twoPointPlan.notice;
        twoPointValid = twoPointPlan.valid;
      }

      if (useTwoPointMode && !twoPointValid) {
        throw new Error("2地点が離れすぎています。より近い2地点を指定してください。");
      }

      const bounds = GeoUtils.calculateBounds(generationCenter.lat, generationCenter.lng, generationTerrain.width, generationTerrain.height);
      const data = await providerRef.current.fetchMapData(bounds, generationTerrain.zoom, true, ({ loaded, total }) => {
        setLoadingText(`標高タイルを取得しています... ${loaded}/${total}`);
        setStatusMessage(`地形を生成中です（${loaded}/${total} タイル）。`);
      });

      const nextMeshInfo = viewer.update(data, {
        centerLat: generationCenter.lat,
        centerLng: generationCenter.lng,
        widthKm: generationTerrain.width,
        heightKm: generationTerrain.height,
        zoom: generationTerrain.zoom,
        useTexture: true
      });

      setMeshInfo(nextMeshInfo);
      setTerrain(generationTerrain);
      setHasGeneratedMesh(true);
      setShowOptionalFinishing(false);
      setSelectedViewpoint(null);
      setPlacementGuide(INITIAL_PLACEMENT_GUIDE);
      setPhase(AppPhase.GENERATED);

      const missingCount = data?.diagnostics?.demMissingCount ?? 0;
      const invalidHeightCount = data?.diagnostics?.invalidHeightCount ?? 0;
      if (missingCount > 0 || invalidHeightCount > 0) {
        const sample = data?.diagnostics?.demMissingSamples?.[0];
        const fallbackHint =
          generationTerrain.zoom > 12 ? "Zoomを12に下げるか範囲を狭めると改善しやすくなります。" : "範囲を狭めるか別地点で再生成してください。";
        setStatusMessage("DEMの欠損または無効値を補完して表示しています。");
        setDetailOverride(
          `警告: DEM欠損 ${missingCount} 枚 / 無効標高 ${invalidHeightCount} 点 / 例: ${sample || "取得URLなし"} / 次: ${fallbackHint}`
        );
      } else {
        if (useTwoPointMode && secondaryPoint && twoPointDistanceKm !== null) {
          setStatusMessage(
            `2地点（${center.label} - ${secondaryPoint.label} / 約${twoPointDistanceKm.toFixed(1)}km）を含む地形を生成しました。先に3Dモデルを保存してください。`
          );
        } else {
          setStatusMessage("地形を生成しました。先に3Dモデルを保存してください。");
        }
        setDetailOverride("現在の価値: 地形を制作へ持ち出せます。次章の価値: 今後は比較・共有にも接続予定です。");
        if (twoPointNotice) {
          setDetailOverride(`補足: ${twoPointNotice} / 現在の価値: 地形を制作へ持ち出せます。次章の価値: 今後は比較・共有にも接続予定です。`);
        }
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setErrorState({
        cause: message,
        impact: "地形を表示できず、保存導線へ進めません。",
        next: "範囲を狭めるかZoomを下げて再試行してください。"
      });
    } finally {
      setLoadingVisible(false);
      setBusy(false);
    }
  }

  async function exportTerrain() {
    const viewer = viewerRef.current;
    if (!viewer?.currentMesh || busy) return;

    setBusy(true);
    setLoadingVisible(true);
    setLoadingText("3Dモデルを書き出しています...");
    setPhase(AppPhase.GENERATING);
    setDetailOverride("GLBを書き出しています。完了までそのままお待ちください。");

    try {
      const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
      const filename = `morimorimori_terrain_${Date.now()}.glb`;

      await new Promise<void>((resolve, reject) => {
        const exporter = new GLTFExporter();
        (viewer.currentMesh as { updateMatrixWorld: (force: boolean) => void }).updateMatrixWorld(true);

        exporter.parse(
          viewer.currentMesh as object,
          (glb: ArrayBuffer) => {
            const blob = new Blob([glb], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            resolve();
          },
          (error: unknown) => {
            reject(error);
          },
          { binary: true }
        );
      });

      setPhase(AppPhase.GENERATED);
      setStatusMessage("3Dモデルを保存しました。必要な場合のみ仕上げ設定を開いてください。");
      setDetailOverride("現在の価値: 生成結果を制作に接続できました。次章の価値: 今後は比較・共有を同画面で扱える予定です。");
      clearErrorState();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setErrorState({
        cause: message,
        impact: "3Dモデルを保存できませんでした。",
        next: "再度「3Dモデルを保存」を実行してください。"
      });
    } finally {
      setBusy(false);
      setLoadingVisible(false);
    }
  }

  async function regenerateTerrain() {
    if (!hasRequiredLocation || busy) return;
    setPhase(AppPhase.READY_TO_GENERATE);
    setStatusMessage("現在の条件で再生成します。");
    await generateTerrain();
  }

  function recoverFromError() {
    clearErrorState();

    if (!hasRequiredLocation) {
      setPhase(AppPhase.IDLE);
      setStatusMessage(useTwoPointMode ? "開始地点と終点を確認して再開してください。" : "地点を選択し直して再開してください。");
      setDetailOverride(null);
      return;
    }

    setPhase(AppPhase.READY_TO_GENERATE);
    setStatusMessage("条件を確認できました。再生成へ進めます。");
    setDetailOverride("復帰準備が完了しました。主CTAから再生成してください。");
  }

  function pickViewpointOnTerrain() {
    const viewer = viewerRef.current;
    if (!viewer?.currentMesh) {
      setStatusMessage("先に地形を生成してから視点指定へ進んでください。");
      return;
    }

    viewer.startViewpointPick((point) => {
      setSelectedViewpoint(point);
      setPlacementGuide(`視点ポイントを指定しました: ${formatWorldPoint(point)} / 次に「人間視点で360°表示」を実行してください。`);
      setStatusMessage("視点ポイントを指定しました。360°確認に進めます。");
    });

    setPlacementGuide("地形上をクリックして視点ポイントを指定してください。");
    setStatusMessage("視点ポイント指定モードです。地形上をクリックしてください。");
  }

  function showStreetViewMode() {
    const viewer = viewerRef.current;
    if (!viewer?.currentMesh) {
      setStatusMessage("地形が未生成です。先に地形生成を完了してください。");
      return;
    }

    if (!selectedViewpoint) {
      setStatusMessage("先に視点ポイントを指定してください。");
      setPlacementGuide("視点ポイントが未指定です。地形上の地点を選択してください。");
      return;
    }

    viewer.camera.fov = Math.min(120, Math.max(20, cameraFov));
    viewer.camera.updateProjectionMatrix();
    viewer.applyAtmosphere({ skyPreset: "clear", timePreset });
    viewer.enterStreetView(selectedViewpoint, eyeHeight);

    setStatusMessage("人間視点で360°確認中です。ドラッグで周囲を確認できます。");
    setPlacementGuide(`視点高さ ${eyeHeight.toFixed(1)}m / ドラッグで360°確認できます。`);
  }

  function onPrimaryAction() {
    if (phase === AppPhase.SPLASH) {
      openWorkspace();
      return;
    }

    if (phase === AppPhase.IDLE) {
      if (!hasSelectedLocation) {
        selectRecommendedLocationFromPrimary();
      } else if (useTwoPointMode && !secondaryPoint) {
        setStatusMessage("2地点モードです。終点を検索して指定してください。");
      } else {
        setPhase(AppPhase.READY_TO_GENERATE);
        setStatusMessage("地点が選択済みです。生成へ進めます。");
      }
      return;
    }

    if (phase === AppPhase.READY_TO_GENERATE) {
      void generateTerrain();
      return;
    }

    if (phase === AppPhase.GENERATED) {
      void exportTerrain();
      return;
    }

    if (phase === AppPhase.ERROR) {
      recoverFromError();
    }
  }

  const primaryActionLabel = vm.action;
  const primaryActionDisabled =
    phase === AppPhase.SEARCHING ||
    phase === AppPhase.GENERATING ||
    (phase === AppPhase.READY_TO_GENERATE && !canGenerate) ||
    (phase === AppPhase.GENERATED && !canSave);

  return (
    <div className="l-app-shell" data-state={phase}>
      {loadingVisible ? (
        <div className="c-overlay" data-component="ProcessingOverlay">
          <div className="c-overlay__card">
            <p className="c-overlay__title">処理を実行しています</p>
            <p className="c-overlay__text">{loadingText}</p>
          </div>
        </div>
      ) : null}

      {showSplash ? (
        <div className="c-overlay" data-component="SplashOverlay">
          <div className="c-overlay__card c-overlay__card--splash">
            <p className="c-brand-title">Morimorimori</p>
            <p className="c-overlay__text">探す → 作る → 持ち出すの順で、背景地形を制作へ接続します。</p>
            <div className="c-overlay__summary">
              <p>1. 地点を決める</p>
              <p>2. 条件を決めて地形を生成する</p>
              <p>3. 3Dモデルを保存して制作へ持ち出す</p>
            </div>
            <button className="c-button c-button--primary" data-action="enter-workspace" onClick={openWorkspace} type="button">
              制作を始める
            </button>
          </div>
        </div>
      ) : null}

      <main className="l-workspace">
        <aside className="c-sidebar" data-component="ControlPanel">
          <header className="c-panel c-panel--status" data-component="StateSummaryCard">
            <div className="c-status-row">
              <div>
                <p className="c-brand-subtitle">地形制作ワークスペース</p>
                <p className="c-brand-name">Morimorimori</p>
              </div>
              <span className="c-state-pill" data-component="StatusPill">
                {vm.pill}
              </span>
            </div>
            <h1 className="c-state-title">{vm.title}</h1>
            <p className="c-state-detail">{statusDetail}</p>
          </header>

          <section className="c-panel c-step" data-component="LocationStepSection" data-journey="primary" data-step="1">
            <h2 className="c-step__title">ステップ1: 地点を決める</h2>
            <p className="c-step__description">ギャラリー選択か地点検索で中心を確定します。</p>

            <div className="c-mode-switch" data-component="GenerationModeSwitch">
              <div className="c-mode-switch__tabs">
                <button
                  className={`c-mode-switch__tab ${generationMode === "single-point" ? "is-active" : ""}`}
                  data-action="set-single-point-mode"
                  onClick={() => onGenerationModeChange("single-point")}
                  type="button"
                >
                  1地点モード
                </button>
                <button
                  className={`c-mode-switch__tab ${generationMode === "two-points" ? "is-active" : ""}`}
                  data-action="set-two-point-mode"
                  onClick={() => onGenerationModeChange("two-points")}
                  type="button"
                >
                  2地点モード（任意）
                </button>
              </div>
              <p className="c-inline-note">
                2地点モードでは開始地点と終点を含む範囲を自動計算して生成します。例: 富士山周辺 と 横浜駅周辺
              </p>
            </div>

            <div className="c-gallery" data-component="GalleryStrip">
              {FEATURED_LOCATIONS.map((location) => (
                <button
                  className="c-gallery__item"
                  data-action="select-gallery-location"
                  disabled={busy}
                  key={location.label}
                  onClick={() => selectFeaturedLocation(location)}
                  type="button"
                >
                  <img alt={`${location.label} の地図サムネイル`} className="c-gallery__thumb" src={getMapThumbnailUrl(location.lat, location.lng)} />
                  <span className="c-gallery__label">{location.label}</span>
                  <span className="c-gallery__meta">{location.area}</span>
                </button>
              ))}
            </div>

            <p className="c-inline-note">{centerMeta}</p>

            <div className="c-search" data-component="ManualLocationSearch">
              <label className="c-search__label" htmlFor="location-search-input">
                地点を検索する
              </label>
              <div className="c-search__controls">
                <input
                  className="c-input"
                  data-component="SearchQuery"
                  id="location-search-input"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="例: 東京駅, 大阪駅, 札幌駅"
                  value={searchQuery}
                />
                <button
                  className="c-button c-button--secondary"
                  data-action="search-location"
                  disabled={busy || phase === AppPhase.SEARCHING || phase === AppPhase.GENERATING}
                  onClick={() => void searchLocation()}
                  type="button"
                >
                  検索
                </button>
              </div>
            </div>

            {useTwoPointMode ? (
              <div className="c-search" data-component="SecondaryLocationSearch">
                <label className="c-search__label" htmlFor="secondary-location-search-input">
                  終点を検索する（2点目）
                </label>
                <div className="c-search__controls">
                  <input
                    className="c-input"
                    data-component="SecondarySearchQuery"
                    id="secondary-location-search-input"
                    onChange={(event) => setSecondarySearchQuery(event.target.value)}
                    onKeyDown={onSecondarySearchKeyDown}
                    placeholder="例: 横浜駅, 渋谷駅, 箱根湯本駅"
                    value={secondarySearchQuery}
                  />
                  <button
                    className="c-button c-button--secondary"
                    data-action="search-secondary-location"
                    disabled={busy || phase === AppPhase.SEARCHING || phase === AppPhase.GENERATING || !hasSelectedLocation}
                    onClick={() => void searchSecondaryLocation()}
                    type="button"
                  >
                    終点検索
                  </button>
                </div>
                <p className="c-inline-note">
                  {secondaryPoint
                    ? `終点: ${secondaryPoint.label}（${secondaryPoint.lat.toFixed(4)}, ${secondaryPoint.lng.toFixed(4)}）`
                    : "終点が未指定です。先に開始地点を決めてから終点を設定してください。"}
                </p>
              </div>
            ) : null}
          </section>

          <section className="c-panel c-step" data-component="GenerationStepSection" data-journey="primary" data-step="2">
            <h2 className="c-step__title">ステップ2: 条件を決めて地形を生成する</h2>
            <p className="c-step__description">
              {useTwoPointMode ? "2地点を必ず含む範囲を自動計算します。ワイド/標準/詳細は使用しません。" : "範囲プリセットを選択し、生成条件を確認します。"}
            </p>

            {!useTwoPointMode ? (
              <div className="c-preset-grid" data-component="PresetButtons">
                {Object.entries(PRESETS).map(([key, preset]) => (
                  <button
                    className={`c-preset-button ${activePreset === key ? "is-active" : ""}`.trim()}
                    data-action="apply-preset"
                    disabled={busy || !hasSelectedLocation}
                    key={key}
                    onClick={() => applyPreset(key as PresetKey)}
                    type="button"
                  >
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="c-summary-card" data-component="TwoPointAutoRangeNote">
                <p>2地点モードでは、開始地点と終点が必ず範囲内に入るように自動で範囲を計算します。</p>
                <p>距離が長い場合は、全体を収めるために Zoom を自動調整します。</p>
                <div className="c-chip-group" data-component="TwoPointMarginPreset">
                  {Object.entries(TWO_POINT_MARGIN_PRESETS).map(([key, preset]) => (
                    <button
                      className={`c-chip ${twoPointMarginPreset === key ? "is-active" : ""}`.trim()}
                      data-action="set-two-point-margin-preset"
                      key={key}
                      onClick={() => onTwoPointMarginPresetChange(key as TwoPointMarginPreset)}
                      type="button"
                    >
                      {preset.label} {preset.scale.toFixed(2)}x
                    </button>
                  ))}
                </div>
                <p className="c-inline-note">余白倍率: {selectedTwoPointMargin.helper}</p>
              </div>
            )}

            {!hasSelectedLocation ? <p className="c-warning">先に地点を選択してください。地点確定後に生成できます。</p> : null}
            {useTwoPointMode && !secondaryPoint ? <p className="c-warning">2地点モードの終点が未設定です。終点検索で指定してください。</p> : null}
            {useTwoPointMode && twoPointPlanPreview && !twoPointPlanPreview.valid ? (
              <p className="c-warning">{twoPointPlanPreview.notice || "2地点の距離が広すぎるため生成できません。"}</p>
            ) : null}

            <div className="c-summary-card" data-component="GenerationSummary">
              {useTwoPointMode && secondaryPoint ? (
                <>
                  <p>開始: {center.label}</p>
                  <p>終点: {secondaryPoint.label}</p>
                  <p>距離: 約{twoPointPlanPreview?.distanceKm.toFixed(1)} km</p>
                  <p>中心（自動）: {summaryCenter.label}</p>
                </>
              ) : (
                <p>中心: {center.label}</p>
              )}
              <p>範囲: {summaryTerrain.width.toFixed(1)} x {summaryTerrain.height.toFixed(1)} km</p>
              <p>細かさ: Zoom {summaryTerrain.zoom}（{useTwoPointMode ? "自動調整" : getZoomLabel(summaryTerrain.zoom)}）</p>
              <p>{useTwoPointMode ? "範囲モード: 2地点自動包含" : `プリセット: ${presetLabel}`}</p>
              {useTwoPointMode ? <p>余白倍率: {selectedTwoPointMargin.label}（{selectedTwoPointMargin.scale.toFixed(2)}x）</p> : null}
              <p>推定タイル数: {estimatedTiles} / 上限: {MAX_TILE_COUNT}</p>
              {useTwoPointMode && twoPointPlanPreview?.notice ? <p>補足: {twoPointPlanPreview.notice}</p> : null}
            </div>
          </section>

          <section className="c-panel c-step" data-component="ExportStepSection" data-journey="primary" data-step="3">
            <h2 className="c-step__title">ステップ3: 3Dモデルを保存して持ち出す</h2>
            <p className="c-status-message">{statusMessage}</p>

            {phase === AppPhase.GENERATED ? (
              <>
                <p className="c-success-note">先に保存、その後に必要なら視点調整へ進んでください。</p>
                <p className="c-future-note" data-component="NextPhaseTeaser">
                  次フェーズでは、保存後の地形比較と共有を同画面で扱える予定です。いまは3Dモデル保存を優先してください。
                </p>
              </>
            ) : null}

            {meshInfo ? <p className="c-inline-note">生成メッシュ: {meshInfo.width} x {meshInfo.height}</p> : null}
          </section>

          {showFinishingSection ? (
            <section className="c-panel c-step" data-component="OptionalFinishingSection" data-journey="optional" data-step="4">
              <div className="c-optional-header">
                <h2 className="c-step__title">仕上げ（任意）: 視点調整</h2>
                <button
                  className="c-button c-button--ghost"
                  data-action="toggle-finishing-options"
                  onClick={() => setShowOptionalFinishing((prev) => !prev)}
                  type="button"
                >
                  {showOptionalFinishing ? "閉じる" : "開く"}
                </button>
              </div>

              {showOptionalFinishing ? (
                <>
                  <div className="c-form-grid">
                    <label className="c-field">
                      <span>FOV（度）</span>
                      <input
                        className="c-input"
                        data-component="CameraFov"
                        max={120}
                        min={20}
                        onChange={(event) => setCameraFov(Number(event.target.value || 55))}
                        step={1}
                        type="number"
                        value={cameraFov}
                      />
                    </label>

                    <label className="c-field">
                      <span>視点の高さ（m）</span>
                      <input
                        className="c-input"
                        data-component="EyeHeight"
                        max={3}
                        min={1}
                        onChange={(event) => setEyeHeight(Number(event.target.value || 1.6))}
                        step={0.1}
                        type="number"
                        value={eyeHeight}
                      />
                    </label>
                  </div>

                  <label className="c-field">
                    <span>時間帯</span>
                    <select className="c-select" data-component="TimePreset" onChange={(event) => setTimePreset(event.target.value)} value={timePreset}>
                      <option value="morning">朝</option>
                      <option value="day">昼</option>
                      <option value="evening">夕</option>
                    </select>
                  </label>

                  <div className="c-action-row">
                    <button className="c-button c-button--secondary" data-action="pick-viewpoint" onClick={pickViewpointOnTerrain} type="button">
                      視点ポイントを指定
                    </button>
                    <button className="c-button c-button--outline" data-action="open-street-view" onClick={showStreetViewMode} type="button">
                      人間視点で360°表示
                    </button>
                  </div>

                  <p className="c-inline-note">{placementGuide}</p>
                </>
              ) : (
                <p className="c-inline-note">保存後に必要な場合のみ開いて調整してください。</p>
              )}
            </section>
          ) : null}

          {phase === AppPhase.ERROR && errorInfo ? (
            <section className="c-panel c-error-card" data-component="ErrorCard">
              <h2 className="c-step__title">再開ガイド</h2>
              <p>原因: {errorInfo.cause}</p>
              <p>影響: {errorInfo.impact}</p>
              <p>次: {errorInfo.next}</p>
            </section>
          ) : null}

          <div className="c-desktop-dock" data-component="DesktopPrimaryDock">
            <button
              className="c-button c-button--primary"
              data-action="primary-action"
              disabled={primaryActionDisabled}
              onClick={onPrimaryAction}
              type="button"
            >
              {primaryActionLabel}
            </button>
            {phase === AppPhase.IDLE ? (
              <p className="c-dock-hint">
                {useTwoPointMode
                  ? hasSelectedLocation
                    ? "2地点モードです。終点を指定すると主CTAで生成へ進めます。"
                    : "主CTAで開始地点を自動選択し、次に終点を指定できます。"
                  : "主CTAでおすすめ地点を自動選択します。地点はあとで変更できます。"}
              </p>
            ) : null}
            {hasGeneratedMesh ? (
              <button className="c-button c-button--secondary" data-action="regenerate-terrain" disabled={busy} onClick={() => void regenerateTerrain()} type="button">
                地形を再生成
              </button>
            ) : null}
          </div>
        </aside>

        <section className="c-viewer-panel" data-component="ViewerPanel">
          <div className="c-viewer-head">
            <p className="c-viewer-head__title">3Dプレビュー</p>
            <p className="c-viewer-head__meta">{vm.pill}</p>
          </div>
          <div className="c-viewer-stage">
            <div className="c-viewer-canvas" data-component="ViewerRoot" ref={viewerRootRef} />
            {!hasGeneratedMesh ? <div className="c-viewer-placeholder">地形生成後にここへプレビューを表示します。</div> : null}
          </div>
        </section>
      </main>

      {!showSplash ? (
        <div className="c-mobile-dock" data-component="MobilePrimaryDock">
          <button
            className="c-button c-button--primary"
            data-action="mobile-primary-action"
            disabled={primaryActionDisabled}
            onClick={onPrimaryAction}
            type="button"
          >
            {primaryActionLabel}
          </button>
          {phase === AppPhase.IDLE ? (
            <p className="c-dock-hint">
              {useTwoPointMode
                ? hasSelectedLocation
                  ? "終点を指定すると生成できます。"
                  : "主CTAで開始地点を自動選択できます。"
                : "主CTAでおすすめ地点を自動選択します。"}
            </p>
          ) : null}
          {hasGeneratedMesh ? (
            <button
              className="c-button c-button--secondary"
              data-action="mobile-regenerate-terrain"
              disabled={busy}
              onClick={() => void regenerateTerrain()}
              type="button"
            >
              地形を再生成
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
