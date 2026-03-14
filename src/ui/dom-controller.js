import { AppPhase, phaseViewModel } from "../state/app-state.js";

export class DomController {
  constructor() {
    this.ui = {
      body: document.body,
      loading: document.querySelector('[data-component="LoadingOverlay"]'),
      loadingText: document.querySelector('[data-component="LoadingText"]'),
      splash: document.querySelector('[data-component="SplashOverlay"]'),
      viewerRoot: document.querySelector('[data-component="ViewerRoot"]'),

      statusPill: document.querySelector('[data-component="StatusPill"]'),
      statusPillText: document.querySelector('[data-component="StatusPillText"]'),
      statusTitle: document.querySelector('[data-component="StatusTitle"]'),
      statusDetail: document.querySelector('[data-component="StatusDetail"]'),
      searchStatus: document.querySelector('[data-component="SearchStatus"]'),

      searchQuery: document.querySelector('[data-component="SearchQuery"]'),
      centerMeta: document.querySelector('[data-component="CenterMeta"]'),

      width: document.querySelector('[data-component="WidthRange"]'),
      height: document.querySelector('[data-component="HeightRange"]'),
      widthValue: document.querySelector('[data-component="WidthValue"]'),
      heightValue: document.querySelector('[data-component="HeightValue"]'),
      totalArea: document.querySelector('[data-component="TotalArea"]'),
      loadEstimate: document.querySelector('[data-component="LoadEstimate"]'),

      zoom: document.querySelector('[data-component="ZoomSelect"]'),
      heightScale: document.querySelector('[data-component="HeightScaleInput"]'),

      cameraFov: document.querySelector('[data-component="CameraFov"]'),
      timePreset: document.querySelector('[data-component="TimePreset"]'),
      placementGuide: document.querySelector('[data-component="PlacementGuide"]'),
      postGeneratePanel: document.querySelector('[data-component="PostGeneratePanel"]'),

      lockState: document.querySelector('[data-component="LockState"]'),
      lockButton: document.querySelector('[data-action="toggle-ratio-lock"]'),

      summaryPlace: document.querySelector('[data-component="SummaryPlace"]'),
      summaryCenter: document.querySelector('[data-component="SummaryCenter"]'),
      summaryArea: document.querySelector('[data-component="SummaryArea"]'),
      summaryResolution: document.querySelector('[data-component="SummaryResolution"]'),

      enterButton: document.querySelector('[data-action="enter-workspace"]'),
      applySampleButton: document.querySelector('[data-action="apply-sample"]'),
      searchButton: document.querySelector('[data-action="search-location"]'),
      quickLocationButtons: [...document.querySelectorAll('[data-action="quick-location"]')],
      presetButtons: [...document.querySelectorAll('[data-action="apply-preset"]')],

      generateButton: document.querySelector('[data-action="generate-terrain"]'),
      exportButton: document.querySelector('[data-action="export-glb"]'),
      resetButton: document.querySelector('[data-action="reset-camera"]'),
      applyViewpointButton: document.querySelector('[data-action="apply-viewpoint"]'),
      showPlacementGuideButton: document.querySelector('[data-action="show-placement-guide"]')
    };

    this.runtime = {
      isLocked: true,
      hasGeneratedMesh: false
    };
  }

  getElements() {
    return this.ui;
  }

  getTerrainConfig(runtime) {
    const heightScaleRaw = Number.parseFloat(this.ui.heightScale.value);
    return {
      centerLat: runtime.center.lat,
      centerLng: runtime.center.lng,
      widthKm: Number.parseFloat(this.ui.width.value),
      heightKm: Number.parseFloat(this.ui.height.value),
      zoom: Number.parseInt(this.ui.zoom.value, 10),
      heightScale: Number.isFinite(heightScaleRaw) && heightScaleRaw > 0 ? heightScaleRaw : 1,
      useTexture: true
    };
  }

  getPostConfig() {
    const fov = Number.parseFloat(this.ui.cameraFov.value);
    return {
      fov: Number.isFinite(fov) ? fov : 55,
      timePreset: this.ui.timePreset.value
    };
  }

  setPhase(phase) {
    const vm = phaseViewModel[phase] || phaseViewModel[AppPhase.IDLE];

    this.ui.body.dataset.state = phase;
    this.ui.statusPill.dataset.state = phase;
    this.ui.statusPillText.textContent = vm.pill;
    this.ui.statusTitle.textContent = vm.title;
    this.ui.statusDetail.textContent = vm.detail;
    this.ui.generateButton.textContent = vm.action;
  }

  setLoading(visible, message) {
    this.ui.loading.classList.toggle("is-visible", visible);
    this.ui.loading.setAttribute("aria-hidden", String(!visible));
    this.ui.loadingText.textContent = message;
  }

  setSearchStatus(message, tone = "muted") {
    this.ui.searchStatus.dataset.tone = tone;
    this.ui.searchStatus.textContent = message;
  }

  closeSplash() {
    this.ui.splash.classList.add("is-hidden");
    this.ui.splash.setAttribute("aria-hidden", "true");
  }

  setCenterSummary(runtime) {
    this.ui.centerMeta.textContent = `中心: ${runtime.center.lat.toFixed(4)}, ${runtime.center.lng.toFixed(4)} (${runtime.center.label})`;
    this.ui.summaryPlace.textContent = runtime.center.label;
    this.ui.summaryCenter.textContent = `${runtime.center.lat.toFixed(4)}, ${runtime.center.lng.toFixed(4)}`;
  }

  updateSummaryArea(meshData = null) {
    const width = Number.parseFloat(this.ui.width.value);
    const height = Number.parseFloat(this.ui.height.value);
    const zoom = this.ui.zoom.value;
    const fov = this.ui.cameraFov.value;

    this.ui.widthValue.textContent = `${width.toFixed(1)} km`;
    this.ui.heightValue.textContent = `${height.toFixed(1)} km`;
    this.ui.totalArea.textContent = `${(width * height).toFixed(2)} km²`;
    this.ui.summaryArea.textContent = `${width.toFixed(1)} x ${height.toFixed(1)} km`;
    this.ui.summaryResolution.textContent = meshData
      ? `ズーム ${zoom} / ${meshData.width} x ${meshData.height} / FOV ${fov}`
      : `ズーム ${zoom} / FOV ${fov}`;

    this.ui.loadEstimate.textContent = this.formatLoadEstimate(width, height, Number.parseInt(zoom, 10));
  }

  formatLoadEstimate(width, height, zoom) {
    const area = width * height;
    const zoomFactor = Math.max(1, zoom - 8);
    const score = (area * zoomFactor) / 220;

    if (score < 1.2) {
      return "推定負荷: 低 / 目安時間: 15秒";
    }
    if (score < 2.8) {
      return "推定負荷: 中 / 目安時間: 40秒";
    }
    return "推定負荷: 高 / 目安時間: 90秒以上";
  }

  setPresetActive(type) {
    this.ui.presetButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.preset === type);
    });
  }

  setLockState(isLocked) {
    this.runtime.isLocked = isLocked;
    this.ui.lockButton.classList.toggle("is-active", isLocked);
    const text = isLocked ? "縦横比を固定中" : "縦横比を個別調整";
    this.ui.lockState.textContent = text;
    this.ui.lockButton.setAttribute("aria-label", text);
  }

  setBusy(isBusy) {
    this.ui.searchButton.disabled = isBusy;
    this.ui.generateButton.disabled = isBusy;
    this.ui.exportButton.disabled = isBusy || !this.runtime.hasGeneratedMesh;
    this.ui.resetButton.disabled = isBusy || !this.runtime.hasGeneratedMesh;
    this.ui.applyViewpointButton.disabled = isBusy || !this.runtime.hasGeneratedMesh;
    this.ui.showPlacementGuideButton.disabled = isBusy || !this.runtime.hasGeneratedMesh;
  }

  setGeneratedAvailability(hasMesh) {
    this.runtime.hasGeneratedMesh = hasMesh;
    this.ui.exportButton.disabled = !hasMesh;
    this.ui.resetButton.disabled = !hasMesh;
    this.ui.applyViewpointButton.disabled = !hasMesh;
    this.ui.showPlacementGuideButton.disabled = !hasMesh;
    this.ui.postGeneratePanel.classList.toggle("is-ready", hasMesh);
  }

  setPlacementGuide(text) {
    this.ui.placementGuide.textContent = text;
  }

  get isLocked() {
    return this.runtime.isLocked;
  }
}
