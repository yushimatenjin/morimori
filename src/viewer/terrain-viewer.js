import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { GeoUtils } from "../lib/geo-utils.js";

const SKY_PRESETS = {
  clear: { turbidity: 6, rayleigh: 2.1, mieCoefficient: 0.0035, mieDirectionalG: 0.78, elevation: 66, azimuth: 210 },
  hazy: { turbidity: 12, rayleigh: 1.2, mieCoefficient: 0.009, mieDirectionalG: 0.82, elevation: 58, azimuth: 212 },
  dramatic: { turbidity: 8, rayleigh: 0.9, mieCoefficient: 0.012, mieDirectionalG: 0.84, elevation: 40, azimuth: 238 }
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

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
    this.controls.minDistance = 10;
    this.controls.maxDistance = 900000;
    this.controls.target.set(0, 200, 0);

    this.currentMesh = null;
    this.frameState = null;
    this.geoReference = null;

    this.initEnvironment();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());
    this.animate();
  }

  initEnvironment() {
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    this.scene.add(this.sky);

    this.sun = new THREE.Vector3();

    const hemi = new THREE.HemisphereLight(0xcfeeff, 0x0a1422, 1.15);
    const dir = new THREE.DirectionalLight(0xfff4df, 1.35);
    dir.position.set(15000, 22000, 9000);
    this.scene.add(hemi, dir);

    this.applyAtmosphere({ skyPreset: "clear", timePreset: "day" });
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

  applyAtmosphere({ skyPreset = "clear", timePreset = "day" }) {
    const preset = SKY_PRESETS[skyPreset] || SKY_PRESETS.clear;
    const timeShift = { morning: -14, day: 0, evening: -24 }[timePreset] ?? 0;

    this.sky.material.uniforms.turbidity.value = preset.turbidity;
    this.sky.material.uniforms.rayleigh.value = preset.rayleigh;
    this.sky.material.uniforms.mieCoefficient.value = preset.mieCoefficient;
    this.sky.material.uniforms.mieDirectionalG.value = preset.mieDirectionalG;

    this.sun.setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(Math.max(12, preset.elevation + timeShift)),
      THREE.MathUtils.degToRad(preset.azimuth)
    );
    this.sky.material.uniforms.sunPosition.value.copy(this.sun);
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
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
