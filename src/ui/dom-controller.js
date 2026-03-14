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
      searchInput: document.querySelector('[data-component="SearchInput"]'),
      searchStatus: document.querySelector('[data-component="SearchStatus"]'),
      width: document.querySelector('[data-component="WidthRange"]'),
      height: document.querySelector('[data-component="HeightRange"]'),
      widthValue: document.querySelector('[data-component="WidthValue"]'),
      heightValue: document.querySelector('[data-component="HeightValue"]'),
      totalArea: document.querySelector('[data-component="TotalArea"]'),
      zoom: document.querySelector('[data-component="ZoomSelect"]'),
      heightScale: document.querySelector('[data-component="HeightScaleInput"]'),
      texture: document.querySelector('[data-component="TextureToggle"]'),
      lockState: document.querySelector('[data-component="LockState"]'),
      lockButton: document.querySelector('[data-action="toggle-ratio-lock"]'),
      summaryCenter: document.querySelector('[data-component="SummaryCenter"]'),
      summaryPlace: document.querySelector('[data-component="SummaryPlace"]'),
      summaryArea: document.querySelector('[data-component="SummaryArea"]'),
      summaryResolution: document.querySelector('[data-component="SummaryResolution"]'),
      enterButton: document.querySelector('[data-action="enter-workspace"]'),
      enterSampleButton: document.querySelector('[data-action="enter-with-sample"]'),
      searchButton: document.querySelector('[data-action="search-location"]'),
      generateButton: document.querySelector('[data-action="generate-terrain"]'),
      exportButton: document.querySelector('[data-action="export-glb"]'),
      resetButton: document.querySelector('[data-action="reset-camera"]'),
      presetButtons: [...document.querySelectorAll('[data-action="apply-preset"]')],
      quickLocationButtons: [...document.querySelectorAll('[data-action="quick-location"]')]
    };

    this.runtime = {
      isLocked: true,
      currentPlaceLabel: "富士山周辺",
      hasGeneratedMesh: false,
      lat: 35.3606,
      lng: 138.7273
    };
  }

  getElements() {
    return this.ui;
  }

  getConfig() {
    const heightScaleRaw = Number.parseFloat(this.ui.heightScale.value);
    return {
      lat: this.runtime.lat,
      lng: this.runtime.lng,
      widthKm: Number.parseFloat(this.ui.width.value),
      heightKm: Number.parseFloat(this.ui.height.value),
      zoom: Number.parseInt(this.ui.zoom.value, 10),
      heightScale: Number.isFinite(heightScaleRaw) && heightScaleRaw > 0 ? heightScaleRaw : 1,
      useTexture: this.ui.texture.checked
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

  updateLocation(lat, lng, label, query = "") {
    this.runtime.lat = Number(lat);
    this.runtime.lng = Number(lng);
    this.runtime.currentPlaceLabel = label;

    this.ui.summaryCenter.textContent = `${this.runtime.lat.toFixed(4)}, ${this.runtime.lng.toFixed(4)}`;
    this.ui.summaryPlace.textContent = label;

    if (query) {
      this.ui.searchInput.value = query;
    }

    this.updateSummaryResolution();
  }

  updateRangeLabels() {
    const width = Number.parseFloat(this.ui.width.value);
    const height = Number.parseFloat(this.ui.height.value);
    this.ui.widthValue.textContent = `${width.toFixed(1)} km`;
    this.ui.heightValue.textContent = `${height.toFixed(1)} km`;
    this.ui.totalArea.textContent = `${(width * height).toFixed(2)} km²`;
    this.ui.summaryArea.textContent = `${width.toFixed(1)} x ${height.toFixed(1)} km`;
  }

  updateSummaryResolution(meshData = null) {
    const zoom = this.ui.zoom.value;
    this.ui.summaryResolution.textContent = meshData
      ? `ズーム ${zoom} / ${meshData.width} x ${meshData.height}`
      : `ズーム ${zoom}`;
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
  }

  setGeneratedAvailability(hasMesh) {
    this.runtime.hasGeneratedMesh = hasMesh;
    this.ui.exportButton.disabled = !hasMesh;
    this.ui.resetButton.disabled = !hasMesh;
  }

  get isLocked() {
    return this.runtime.isLocked;
  }
}
