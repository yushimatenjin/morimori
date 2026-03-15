import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GeoUtils } from "../lib/geo-utils.js";

const LIGHT_PRESETS = {
  clear: { elevation: 66, azimuth: 210, hemisphere: 1.1, directional: 1.35, ambient: 0.28 },
  hazy: { elevation: 58, azimuth: 212, hemisphere: 1.0, directional: 1.2, ambient: 0.34 },
  dramatic: { elevation: 40, azimuth: 238, hemisphere: 0.95, directional: 1.1, ambient: 0.2 }
};

export class TerrainViewer {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x06111c, 4000, 320000);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1500000);
    this.camera.position.set(3200, 1800, 3200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cursor = "default";

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
    this.controls.minDistance = 10;
    this.controls.maxDistance = 900000;
    this.controls.target.set(0, 200, 0);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pickCallback = null;
    this.isStreetViewMode = false;
    this.viewpointMarker = null;
    this.skyDome = null;
    this.skyboxVisible = false;
    this.streetViewPoint = null;
    this.streetViewEyeHeight = 1.6;
    this.streetViewState = {
      yaw: 0,
      pitch: 0,
      dragging: false,
      lastX: 0,
      lastY: 0
    };

    this.currentMesh = null;
    this.frameState = null;
    this.geoReference = null;

    this.renderer.domElement.addEventListener("click", (event) => this.handlePickClick(event));
    this.renderer.domElement.addEventListener("mousedown", (event) => this.handleStreetViewDragStart(event));
    this.renderer.domElement.addEventListener("mousemove", (event) => this.handleStreetViewDragMove(event));
    window.addEventListener("mouseup", () => this.handleStreetViewDragEnd());

    this.initEnvironment();
    this.initSkybox();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());
    this.animate();
  }

  initEnvironment() {
    this.sun = new THREE.Vector3();
    this.hemiLight = new THREE.HemisphereLight(0xcfeeff, 0x0a1422, 1.1);
    this.dirLight = new THREE.DirectionalLight(0xfff4df, 1.35);
    this.dirLight.position.set(15000, 22000, 9000);
    this.ambientLight = new THREE.AmbientLight(0x1a2636, 0.28);
    this.scene.add(this.hemiLight, this.dirLight, this.ambientLight);

    this.applyAtmosphere({ skyPreset: "clear", timePreset: "day" });
  }

  initSkybox() {
    const loader = new THREE.TextureLoader();
    loader.load(
      "/skybox.jpg",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

        const geometry = new THREE.SphereGeometry(950000, 40, 28);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.BackSide,
          depthWrite: false,
          fog: false
        });

        this.skyDome = new THREE.Mesh(geometry, material);
        this.skyDome.visible = this.skyboxVisible;
        this.scene.add(this.skyDome);
      },
      undefined,
      () => {
        // 画像読み込みに失敗した場合は既存の背景表現を維持する
      }
    );
  }

  setSkyboxVisible(visible) {
    this.skyboxVisible = Boolean(visible);
    if (this.skyDome) {
      this.skyDome.visible = this.skyboxVisible;
    }
  }

  setStreetViewFov(fov) {
    this.camera.fov = THREE.MathUtils.clamp(fov, 20, 120);
    this.camera.updateProjectionMatrix();
  }

  setStreetViewEyeHeight(eyeHeight) {
    this.streetViewEyeHeight = THREE.MathUtils.clamp(eyeHeight, 1.2, 2.2);
    if (this.isStreetViewMode) {
      this.updateStreetViewPosition();
    }
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

    if (this.viewpointMarker) {
      this.scene.remove(this.viewpointMarker);
      this.viewpointMarker.traverse((node) => {
        if (node.geometry) {
          node.geometry.dispose();
        }
        if (node.material) {
          node.material.dispose();
        }
      });
      this.viewpointMarker = null;
    }
  }

  applyAtmosphere({ skyPreset = "clear", timePreset = "day" }) {
    const preset = LIGHT_PRESETS[skyPreset] || LIGHT_PRESETS.clear;
    const timeShift = { morning: -14, day: 0, evening: -24 }[timePreset] ?? 0;

    this.sun.setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(Math.max(12, preset.elevation + timeShift)),
      THREE.MathUtils.degToRad(preset.azimuth)
    );
    this.dirLight.position.copy(this.sun).multiplyScalar(80000);
    this.hemiLight.intensity = preset.hemisphere;
    this.dirLight.intensity = preset.directional;
    this.ambientLight.intensity = preset.ambient;
  }

  update(data, config) {
    this.exitStreetView();
    this.setSkyboxVisible(false);
    this.pickCallback = null;
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
      const height = data.heights[i];
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
    this.scene.add(this.currentMesh);

    this.frameState = {
      size: Math.max(widthMeters, depthMeters),
      heightMid: (minHeight + maxHeight) / 2,
      heightSpan: Math.max(100, maxHeight - minHeight)
    };

    this.geoReference = {
      centerLat: config.centerLat,
      centerLng: config.centerLng,
      metersPerDegree: GeoUtils.getMetersPerDegree(config.centerLat)
    };

    this.resetView();

    return {
      width: data.width,
      height: data.height
    };
  }

  startViewpointPick(onPicked) {
    this.pickCallback = typeof onPicked === "function" ? onPicked : null;
  }

  handlePickClick(event) {
    if (!this.pickCallback || !this.currentMesh) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.currentMesh, false);
    if (hits.length === 0) {
      return;
    }

    const point = hits[0].point.clone();
    this.setViewpointMarker(point);
    this.pickCallback(point);
    this.pickCallback = null;
  }

  setViewpointMarker(point) {
    if (this.viewpointMarker) {
      this.scene.remove(this.viewpointMarker);
      this.viewpointMarker.traverse((node) => {
        if (node.geometry) {
          node.geometry.dispose();
        }
        if (node.material) {
          node.material.dispose();
        }
      });
    }

    const markerHeight = Math.max(4, (this.frameState?.size || 1000) * 0.003);
    const markerGroup = new THREE.Group();

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, markerHeight, 14),
      new THREE.MeshStandardMaterial({ color: 0xff7a18, emissive: 0x442100, roughness: 0.5, metalness: 0.1 })
    );
    pole.position.set(0, markerHeight / 2, 0);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffcf6d, emissive: 0x5a3400, roughness: 0.3, metalness: 0.15 })
    );
    cap.position.set(0, markerHeight + 1.6, 0);

    markerGroup.position.copy(point);
    markerGroup.add(pole, cap);
    this.viewpointMarker = markerGroup;
    this.scene.add(markerGroup);
  }

  enterStreetView(point, eyeHeight = 1.6) {
    if (!point) {
      return;
    }

    const wasStreetViewMode = this.isStreetViewMode;
    this.streetViewPoint = point.clone();
    this.streetViewEyeHeight = THREE.MathUtils.clamp(eyeHeight, 1.2, 2.2);

    this.isStreetViewMode = true;
    this.controls.enabled = false;
    this.updateStreetViewPosition();

    if (!wasStreetViewMode) {
      this.streetViewState.yaw = 0;
      this.streetViewState.pitch = 0;
    }
    this.updateStreetViewCameraDirection();
    this.renderer.domElement.style.cursor = "grab";
  }

  updateStreetViewPosition() {
    if (!this.streetViewPoint) {
      return;
    }
    const eyePos = this.streetViewPoint.clone();
    eyePos.y += this.streetViewEyeHeight;
    this.camera.position.copy(eyePos);
  }

  updateStreetViewCameraDirection() {
    const euler = new THREE.Euler(this.streetViewState.pitch, this.streetViewState.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(euler);
  }

  handleStreetViewDragStart(event) {
    if (!this.isStreetViewMode || event.button !== 0) {
      return;
    }
    this.streetViewState.dragging = true;
    this.streetViewState.lastX = event.clientX;
    this.streetViewState.lastY = event.clientY;
    this.renderer.domElement.style.cursor = "grabbing";
  }

  handleStreetViewDragMove(event) {
    if (!this.isStreetViewMode || !this.streetViewState.dragging) {
      return;
    }

    const deltaX = event.clientX - this.streetViewState.lastX;
    const deltaY = event.clientY - this.streetViewState.lastY;
    this.streetViewState.lastX = event.clientX;
    this.streetViewState.lastY = event.clientY;

    const sensitivity = 0.003;
    this.streetViewState.yaw -= deltaX * sensitivity;
    this.streetViewState.pitch -= deltaY * sensitivity;
    this.streetViewState.pitch = THREE.MathUtils.clamp(this.streetViewState.pitch, -1.45, 1.45);
    this.updateStreetViewCameraDirection();
  }

  handleStreetViewDragEnd() {
    this.streetViewState.dragging = false;
    this.renderer.domElement.style.cursor = this.isStreetViewMode ? "grab" : "default";
  }

  exitStreetView() {
    this.isStreetViewMode = false;
    this.streetViewState.dragging = false;
    this.controls.enabled = true;
    this.renderer.domElement.style.cursor = "default";
  }

  toWorldPosition(lat, lng, altitude = 0) {
    if (!this.geoReference) {
      return new THREE.Vector3(0, altitude, 0);
    }

    const x = (lng - this.geoReference.centerLng) * this.geoReference.metersPerDegree.lon;
    const z = (this.geoReference.centerLat - lat) * this.geoReference.metersPerDegree.lat;

    return new THREE.Vector3(x, altitude, z);
  }

  applyViewpoint(viewpoint) {
    if (!this.currentMesh || !this.geoReference) {
      return;
    }

    const observerPos = this.toWorldPosition(viewpoint.observer.lat, viewpoint.observer.lng, viewpoint.observer.altitude);
    const targetPos = this.toWorldPosition(viewpoint.target.lat, viewpoint.target.lng, viewpoint.target.altitude);

    this.camera.fov = Math.min(120, Math.max(20, viewpoint.fov));
    this.camera.updateProjectionMatrix();

    this.camera.position.copy(observerPos);
    this.controls.target.copy(targetPos);

    // 方位が指定されている場合、現在位置を中心にわずかに回転して制作者の意図を反映する
    if (Number.isFinite(viewpoint.heading)) {
      const headingRad = THREE.MathUtils.degToRad(viewpoint.heading);
      const radius = 6;
      this.camera.position.x += Math.sin(headingRad) * radius;
      this.camera.position.z += Math.cos(headingRad) * radius;
    }

    this.controls.update();
  }

  resetView() {
    this.exitStreetView();
    this.setSkyboxVisible(false);

    if (!this.frameState) {
      this.camera.position.set(3200, 1800, 3200);
      this.controls.target.set(0, 200, 0);
      this.controls.update();
      return;
    }

    const distance = Math.max(this.frameState.size * 1.08, this.frameState.heightSpan * 6);
    const eyeY = Math.max(
      this.frameState.heightMid + this.frameState.size * 0.48,
      this.frameState.heightMid + this.frameState.heightSpan * 1.8
    );

    this.camera.position.set(distance, eyeY, distance);
    this.controls.target.set(0, this.frameState.heightMid * 0.35, 0);
    this.controls.update();
  }

  onResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (!this.isStreetViewMode) {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }
}
