import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { Sky } from "three/addons/objects/Sky.js";

class GeoUtils {
    static lon2tile(lon, zoom) {
        return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
    }

    static lat2tile(lat, zoom) {
        return Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * Math.pow(2, zoom));
    }

    static tile2lon(x, zoom) {
        return (x / Math.pow(2, zoom)) * 360 - 180;
    }

    static tile2lat(y, zoom) {
        const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
        return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    }

    static getMetersPerDegree(lat) {
        const latRad = (lat * Math.PI) / 180;
        return {
            lat: 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad),
            lon: 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad)
        };
    }

    static calculateBounds(lat, lng, widthKm, heightKm) {
        const metersPerDegree = this.getMetersPerDegree(lat);
        const latDiff = (heightKm * 1000 / metersPerDegree.lat) / 2;
        const lngDiff = (widthKm * 1000 / metersPerDegree.lon) / 2;
        return {
            north: lat + latDiff,
            south: lat - latDiff,
            west: lng - lngDiff,
            east: lng + lngDiff
        };
    }
}

class MapDataProvider {
    constructor() {
        this.demUrl = "https://cyberjapandata.gsi.go.jp/xyz/dem_png";
        this.photoUrl = "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto";
    }

    async fetchMapData(bounds, zoom, fetchPhoto, onProgress = () => {}) {
        const startX = GeoUtils.lon2tile(bounds.west, zoom);
        const endX = GeoUtils.lon2tile(bounds.east, zoom);
        const startY = GeoUtils.lat2tile(bounds.north, zoom);
        const endY = GeoUtils.lat2tile(bounds.south, zoom);
        const countX = endX - startX + 1;
        const countY = endY - startY + 1;
        const totalTiles = countX * countY;

        if (totalTiles > 144) {
            throw new Error("取得範囲が広すぎます。範囲を狭めるか、ズームを下げてください。");
        }

        const demCanvas = document.createElement("canvas");
        demCanvas.width = countX * 256;
        demCanvas.height = countY * 256;
        const demCtx = demCanvas.getContext("2d");

        let photoCanvas = null;
        let photoCtx = null;

        if (fetchPhoto) {
            photoCanvas = document.createElement("canvas");
            photoCanvas.width = countX * 256;
            photoCanvas.height = countY * 256;
            photoCtx = photoCanvas.getContext("2d");
        }

        onProgress({ loaded: 0, total: totalTiles });

        let loadedTiles = 0;
        const tiles = [];

        for (let y = 0; y < countY; y += 1) {
            for (let x = 0; x < countX; x += 1) {
                const tilePromise = this.loadTile(startX + x, startY + y, zoom, x, y, demCtx, photoCtx).then(() => {
                    loadedTiles += 1;
                    onProgress({ loaded: loadedTiles, total: totalTiles });
                });
                tiles.push(tilePromise);
            }
        }

        await Promise.all(tiles);

        const demData = demCtx.getImageData(0, 0, demCanvas.width, demCanvas.height).data;
        const heights = new Float32Array(demData.length / 4);

        for (let i = 0; i < heights.length; i += 1) {
            const r = demData[i * 4];
            const g = demData[i * 4 + 1];
            const b = demData[i * 4 + 2];
            const value = r * 65536 + g * 256 + b;
            heights[i] = value < 8388608 ? value * 0.01 : (value - 16777216) * 0.01;
        }

        return {
            heights,
            width: demCanvas.width,
            height: demCanvas.height,
            texture: fetchPhoto ? new THREE.CanvasTexture(photoCanvas) : null,
            actualBounds: {
                north: GeoUtils.tile2lat(startY, zoom),
                south: GeoUtils.tile2lat(endY + 1, zoom),
                west: GeoUtils.tile2lon(startX, zoom),
                east: GeoUtils.tile2lon(endX + 1, zoom)
            }
        };
    }

    loadTile(tileX, tileY, zoom, offsetX, offsetY, demCtx, photoCtx) {
        const loadImage = (url, ctx, fallbackColor) => new Promise((resolve) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => {
                if (ctx) {
                    ctx.drawImage(image, offsetX * 256, offsetY * 256);
                }
                resolve();
            };
            image.onerror = () => {
                if (ctx) {
                    ctx.fillStyle = fallbackColor;
                    ctx.fillRect(offsetX * 256, offsetY * 256, 256, 256);
                }
                resolve();
            };
            image.src = url;
        });

        return Promise.all([
            loadImage(`${this.demUrl}/${zoom}/${tileX}/${tileY}.png`, demCtx, "#000000"),
            photoCtx ? loadImage(`${this.photoUrl}/${zoom}/${tileX}/${tileY}.jpg`, photoCtx, "#0f2236") : Promise.resolve()
        ]);
    }
}

class TerrainViewer {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x06111c, 4000, 320000);

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1500000);
        this.camera.position.set(3200, 1800, 3200);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            logarithmicDepthBuffer: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.setClearColor(0x000000, 0);
        document.body.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
        this.controls.minDistance = 10;
        this.controls.maxDistance = 900000;
        this.controls.target.set(0, 200, 0);

        this.currentMesh = null;
        this.frameState = null;

        this.initEnvironment();
        window.addEventListener("resize", () => this.onResize());
        this.animate();
    }

    initEnvironment() {
        const sky = new Sky();
        sky.scale.setScalar(450000);
        sky.material.uniforms.turbidity.value = 10;
        sky.material.uniforms.rayleigh.value = 1.6;
        sky.material.uniforms.mieCoefficient.value = 0.005;
        sky.material.uniforms.mieDirectionalG.value = 0.78;

        const sun = new THREE.Vector3();
        sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(74), THREE.MathUtils.degToRad(210));
        sky.material.uniforms.sunPosition.value.copy(sun);
        this.scene.add(sky);

        const hemi = new THREE.HemisphereLight(0xcfeeff, 0x0a1422, 1.15);
        const dir = new THREE.DirectionalLight(0xfff4df, 1.35);
        dir.position.set(15000, 22000, 9000);
        this.scene.add(hemi, dir);
    }

    disposeCurrentMesh() {
        if (!this.currentMesh) {
            return;
        }

        this.scene.remove(this.currentMesh);
        this.currentMesh.geometry.dispose();

        if (this.currentMesh.material.map) {
            this.currentMesh.material.map.dispose();
        }

        this.currentMesh.material.dispose();
        this.currentMesh = null;
    }

    update(data, config) {
        this.disposeCurrentMesh();

        const centerLat = (data.actualBounds.north + data.actualBounds.south) / 2;
        const metersPerDegree = GeoUtils.getMetersPerDegree(centerLat);
        const widthMeters = Math.abs(data.actualBounds.east - data.actualBounds.west) * metersPerDegree.lon;
        const depthMeters = Math.abs(data.actualBounds.north - data.actualBounds.south) * metersPerDegree.lat;

        const geometry = new THREE.PlaneGeometry(widthMeters, depthMeters, data.width - 1, data.height - 1);
        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position.array;
        let minHeight = Number.POSITIVE_INFINITY;
        let maxHeight = Number.NEGATIVE_INFINITY;

        for (let i = 0; i < data.heights.length; i += 1) {
            const height = data.heights[i] * config.heightScale;
            positions[i * 3 + 1] = height;
            minHeight = Math.min(minHeight, height);
            maxHeight = Math.max(maxHeight, height);
        }

        geometry.computeVertexNormals();

        if (data.texture) {
            data.texture.colorSpace = THREE.SRGBColorSpace;
            data.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        }

        const material = new THREE.MeshStandardMaterial({
            map: data.texture,
            color: data.texture ? 0xffffff : 0xaed6e8,
            roughness: 0.93,
            metalness: 0.02
        });

        this.currentMesh = new THREE.Mesh(geometry, material);
        this.currentMesh.receiveShadow = false;
        this.scene.add(this.currentMesh);

        this.frameState = {
            size: Math.max(widthMeters, depthMeters),
            heightMid: (minHeight + maxHeight) / 2,
            heightSpan: Math.max(100, maxHeight - minHeight)
        };

        this.resetView();
    }

    resetView() {
        if (!this.frameState) {
            this.camera.position.set(3200, 1800, 3200);
            this.controls.target.set(0, 200, 0);
            this.controls.update();
            return;
        }

        const distance = Math.max(this.frameState.size * 1.08, this.frameState.heightSpan * 6);
        const eyeY = Math.max(this.frameState.heightMid + this.frameState.size * 0.48, this.frameState.heightMid + this.frameState.heightSpan * 1.8);

        this.camera.position.set(distance, eyeY, distance);
        this.controls.target.set(0, this.frameState.heightMid * 0.35, 0);
        this.controls.update();
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit"
});

const integerFormatter = new Intl.NumberFormat("ja-JP");

const ui = {
    loading: document.getElementById("loading"),
    loadingText: document.getElementById("loading-text"),
    splash: document.getElementById("splash"),
    btnEnter: document.getElementById("btn-enter"),
    btnEnterSample: document.getElementById("btn-enter-sample"),
    btnOpenSplash: document.getElementById("btn-open-splash"),
    searchInput: document.getElementById("search-input"),
    btnSearch: document.getElementById("btn-search"),
    searchStatus: document.getElementById("search-status"),
    width: document.getElementById("area-width"),
    height: document.getElementById("area-height"),
    labelWidth: document.getElementById("val-width"),
    labelHeight: document.getElementById("val-height"),
    labelTotal: document.getElementById("val-total"),
    lockBtn: document.getElementById("lock-btn"),
    lockState: document.getElementById("lock-state"),
    zoom: document.getElementById("zoom"),
    heightScale: document.getElementById("height-scale"),
    useTexture: document.getElementById("use-texture"),
    btnGenerate: document.getElementById("btn-generate"),
    btnExport: document.getElementById("btn-export"),
    btnResetView: document.getElementById("btn-reset-view"),
    centerLat: document.getElementById("center-lat"),
    centerLng: document.getElementById("center-lng"),
    status: document.getElementById("status"),
    statusDetail: document.getElementById("status-detail"),
    statusTime: document.getElementById("status-time"),
    statusPill: document.getElementById("status-pill"),
    statusPillText: document.getElementById("status-pill-text"),
    summaryCenter: document.getElementById("summary-center"),
    summaryPlace: document.getElementById("summary-place"),
    summaryArea: document.getElementById("summary-area"),
    summaryResolution: document.getElementById("summary-resolution"),
    summaryTexture: document.getElementById("summary-texture"),
    summaryScale: document.getElementById("summary-scale"),
    presetButtons: [...document.querySelectorAll("[data-preset]")],
    quickLocationButtons: [...document.querySelectorAll("[data-location]")]
};

const appState = {
    isLocked: true,
    activePreset: null,
    currentPlaceLabel: "富士山周辺"
};

const mapProvider = new MapDataProvider();
const viewer = new TerrainViewer();

function setLoading(visible, message = "標高タイルを取得しています...") {
    ui.loading.classList.toggle("is-visible", visible);
    ui.loading.setAttribute("aria-hidden", String(!visible));
    ui.loadingText.textContent = message;
}

function setSearchStatus(message, tone = "muted") {
    ui.searchStatus.textContent = message;
    ui.searchStatus.dataset.tone = tone;
}

function setStatus(state, title, detail = "") {
    const labels = {
        idle: "待機中",
        loading: "処理中",
        success: "完了",
        error: "要確認"
    };

    ui.statusPill.dataset.state = state;
    ui.statusPillText.textContent = labels[state] || labels.idle;
    ui.status.textContent = title;
    ui.statusDetail.textContent = detail;
    ui.statusTime.textContent = timeFormatter.format(new Date());
}

function formatDistance(value) {
    return `${value.toFixed(1)} km`;
}

function getConfigFromUI() {
    const scale = Number.parseFloat(ui.heightScale.value);
    return {
        lat: Number.parseFloat(ui.centerLat.value),
        lng: Number.parseFloat(ui.centerLng.value),
        w: Number.parseFloat(ui.width.value),
        h: Number.parseFloat(ui.height.value),
        zoom: Number.parseInt(ui.zoom.value, 10),
        heightScale: Number.isFinite(scale) && scale > 0 ? scale : 1,
        useTexture: ui.useTexture.checked
    };
}

function updateSummary(generatedData = null) {
    const config = getConfigFromUI();
    ui.summaryCenter.textContent = `${config.lat.toFixed(4)}, ${config.lng.toFixed(4)}`;
    ui.summaryPlace.textContent = appState.currentPlaceLabel;
    ui.summaryArea.textContent = `${config.w.toFixed(1)} x ${config.h.toFixed(1)} km`;
    ui.summaryResolution.textContent = generatedData ? `ズーム ${config.zoom} / ${generatedData.width} x ${generatedData.height}` : `ズーム ${config.zoom}`;
    ui.summaryTexture.textContent = config.useTexture ? "衛星写真あり" : "標高のみ";
    ui.summaryScale.textContent = `高さ倍率 ${config.heightScale.toFixed(1)}`;
}

function updatePresetButtons(activePreset) {
    ui.presetButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.preset === activePreset);
    });
}

function updateUIValues() {
    const width = Number.parseFloat(ui.width.value);
    const height = Number.parseFloat(ui.height.value);
    ui.labelWidth.textContent = formatDistance(width);
    ui.labelHeight.textContent = formatDistance(height);
    ui.labelTotal.textContent = `${(width * height).toFixed(2)} km²`;
    updateSummary();
}

function setLocation(lat, lng, label, query = "") {
    ui.centerLat.value = String(lat);
    ui.centerLng.value = String(lng);
    appState.currentPlaceLabel = label;
    if (query) {
        ui.searchInput.value = query;
    }
    updateSummary();
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
    appState.activePreset = type;
    updatePresetButtons(type);
    updateUIValues();
}

function refreshActionAvailability(isBusy = false) {
    const hasMesh = Boolean(viewer.currentMesh);
    ui.btnGenerate.disabled = isBusy;
    ui.btnSearch.disabled = isBusy;
    ui.btnExport.disabled = isBusy || !hasMesh;
    ui.btnResetView.disabled = isBusy || !hasMesh;
}

function toggleLock() {
    appState.isLocked = !appState.isLocked;
    ui.lockBtn.classList.toggle("active", appState.isLocked);
    ui.lockState.textContent = appState.isLocked ? "縦横比を固定中" : "縦横比を個別調整";
    ui.lockBtn.setAttribute("aria-label", appState.isLocked ? "縦横比を固定中" : "縦横比を個別調整");
}

function syncLockedDimension(source) {
    if (!appState.isLocked) {
        appState.activePreset = null;
        updatePresetButtons(null);
        return;
    }

    if (source === "width") {
        ui.height.value = ui.width.value;
    } else {
        ui.width.value = ui.height.value;
    }

    appState.activePreset = null;
    updatePresetButtons(null);
}

async function performSearch() {
    const query = ui.searchInput.value.trim();

    if (!query) {
        setSearchStatus("地名を入力してください。", "error");
        setStatus("error", "検索ワードが未入力です", "検索欄に地名または施設名を入力してから実行してください。");
        return;
    }

    refreshActionAvailability(true);
    setSearchStatus("地名を検索しています...", "loading");
    setStatus("loading", "地名を検索中", `「${query}」に一致する地点を探しています。`);

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
        setLocation(result.lat, result.lon, label, query);
        setSearchStatus(`地点を設定しました: ${label}`);
        setStatus("success", "地点を設定しました", "次に取得範囲とズームを確認してから 3D 地形を生成してください。");
    } catch (error) {
        setSearchStatus(error.message, "error");
        setStatus("error", "検索に失敗しました", error.message);
    } finally {
        refreshActionAvailability(false);
    }
}

async function generateTerrain() {
    const config = getConfigFromUI();

    if (!Number.isFinite(config.lat) || !Number.isFinite(config.lng)) {
        setStatus("error", "中心点が不正です", "検索またはクイック選択で正しい地点を設定してください。");
        return;
    }

    ui.heightScale.value = config.heightScale.toFixed(1);
    refreshActionAvailability(true);
    setLoading(true, "標高タイルを取得しています...");
    setStatus("loading", "地形データを取得中", "国土地理院の標高タイルを読み込み始めています。");

    try {
        const bounds = GeoUtils.calculateBounds(config.lat, config.lng, config.w, config.h);
        const data = await mapProvider.fetchMapData(bounds, config.zoom, config.useTexture, ({ loaded, total }) => {
            const progress = `${loaded}/${total}`;
            setLoading(true, `標高タイルを取得しています... ${progress}`);
            setStatus("loading", "地形タイルを取得中", `${progress} タイルを読み込みました。`);
        });

        viewer.update(data, config);
        updateSummary(data);

        setSearchStatus("GLBを書き出せる状態です。必要なら視点を整えてからエクスポートしてください。");
        setStatus(
            "success",
            "3D地形の生成が完了しました",
            `解像度 ${data.width} x ${data.height} / 頂点数 ${integerFormatter.format(data.heights.length)}`
        );
    } catch (error) {
        setStatus("error", "地形生成に失敗しました", error.message);
    } finally {
        setLoading(false);
        refreshActionAvailability(false);
    }
}

function exportTerrain() {
    if (!viewer.currentMesh) {
        return;
    }

    refreshActionAvailability(true);
    setStatus("loading", "GLBを書き出しています", "ブラウザのダウンロード処理を開始しています。");

    const exporter = new GLTFExporter();
    viewer.currentMesh.updateMatrixWorld(true);

    exporter.parse(
        viewer.currentMesh,
        (glb) => {
            const timestamp = Date.now();
            const filename = `gsi_terrain_${timestamp}.glb`;
            const blob = new Blob([glb], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);

            setStatus("success", "GLBを書き出しました", `${filename} のダウンロードを開始しました。`);
            refreshActionAvailability(false);
        },
        (error) => {
            setStatus("error", "GLB書き出しに失敗しました", error?.message || "エクスポート中にエラーが発生しました。");
            refreshActionAvailability(false);
        },
        { binary: true }
    );
}

function closeSplash() {
    ui.splash.classList.add("is-hidden");
    ui.splash.setAttribute("aria-hidden", "true");
}

function openSplash() {
    ui.splash.classList.remove("is-hidden");
    ui.splash.setAttribute("aria-hidden", "false");
}

ui.width.addEventListener("input", () => {
    syncLockedDimension("width");
    updateUIValues();
});

ui.height.addEventListener("input", () => {
    syncLockedDimension("height");
    updateUIValues();
});

ui.zoom.addEventListener("change", updateSummary);
ui.useTexture.addEventListener("change", updateSummary);
ui.heightScale.addEventListener("change", () => {
    const value = Number.parseFloat(ui.heightScale.value);
    ui.heightScale.value = Number.isFinite(value) && value > 0 ? value.toFixed(1) : "1.0";
    updateSummary();
});

ui.lockBtn.addEventListener("click", toggleLock);
ui.btnSearch.addEventListener("click", performSearch);
ui.btnGenerate.addEventListener("click", generateTerrain);
ui.btnExport.addEventListener("click", exportTerrain);
ui.btnResetView.addEventListener("click", () => {
    viewer.resetView();
    setStatus("success", "視点を整えました", "生成済みの地形を全体表示に戻しました。");
});

ui.btnEnter.addEventListener("click", closeSplash);
ui.btnOpenSplash.addEventListener("click", openSplash);
ui.btnEnterSample.addEventListener("click", () => {
    setPreset("point");
    setLocation(35.3606, 138.7273, "富士山周辺", "富士山");
    setSearchStatus("富士山の設定を読み込みました。必要ならそのまま生成できます。");
    setStatus("idle", "サンプル設定を準備しました", "富士山周辺を 1km 四方で確認できる状態です。");
    closeSplash();
});

ui.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        performSearch();
    }
});

ui.presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setPreset(button.dataset.preset);
        setStatus("idle", "取得範囲を更新しました", "中心点が決まっていればそのまま 3D 地形を生成できます。");
    });
});

ui.quickLocationButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const lat = Number.parseFloat(button.dataset.lat);
        const lng = Number.parseFloat(button.dataset.lng);
        const label = button.dataset.label || button.dataset.location;
        const query = button.dataset.location || "";
        setLocation(lat, lng, label, query);
        setSearchStatus(`${label} を中心点に設定しました。`);
        setStatus("success", "中心点を更新しました", "範囲とズームを確認してから地形生成を実行してください。");
    });
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !ui.splash.classList.contains("is-hidden")) {
        closeSplash();
    }
});

updatePresetButtons(null);
updateUIValues();
updateSummary();
refreshActionAvailability(false);
setStatus("idle", "待機中", "検索して地点を決め、必要な範囲とズームを選んだら 3D 地形を生成できます。");
