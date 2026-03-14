import * as THREE from "three";
import { GeoUtils } from "../lib/geo-utils.js";

export const MAX_TILE_COUNT = 1000;
const MAX_DEM_PIXELS = 1_500_000;

export class MapDataProvider {
  constructor() {
    this.demUrl = "https://cyberjapandata.gsi.go.jp/xyz/dem_png";
    this.photoUrl = "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto";
  }

  async fetchMapData(bounds, zoom, fetchPhoto, onProgress = () => {}) {
    const { startX, endX, startY, endY, countX, countY, totalTiles } = this.estimateTileCoverage(bounds, zoom);

    if (totalTiles > MAX_TILE_COUNT) {
      throw new Error("取得範囲が広すぎます。範囲を狭めるか、地形の細かさを下げてください。");
    }

    const sourceWidth = countX * 256;
    const sourceHeight = countY * 256;
    const downsample = Math.max(1, Math.ceil(Math.sqrt((sourceWidth * sourceHeight) / MAX_DEM_PIXELS)));
    const targetWidth = Math.max(1, Math.floor(sourceWidth / downsample));
    const targetHeight = Math.max(1, Math.floor(sourceHeight / downsample));

    const demCanvas = document.createElement("canvas");
    demCanvas.width = targetWidth;
    demCanvas.height = targetHeight;
    const demCtx = demCanvas.getContext("2d");
    if (!demCtx) {
      throw new Error("地形データの描画コンテキストを初期化できませんでした。");
    }
    demCtx.imageSmoothingEnabled = false;

    let photoCanvas = null;
    let photoCtx = null;

    if (fetchPhoto) {
      photoCanvas = document.createElement("canvas");
      photoCanvas.width = targetWidth;
      photoCanvas.height = targetHeight;
      photoCtx = photoCanvas.getContext("2d");
      if (photoCtx) {
        photoCtx.imageSmoothingEnabled = true;
      }
    }

    onProgress({ loaded: 0, total: totalTiles });

    let loadedTiles = 0;
    const tilePromises = [];

    for (let y = 0; y < countY; y += 1) {
      for (let x = 0; x < countX; x += 1) {
        tilePromises.push(
          this.loadTile(startX + x, startY + y, zoom, x, y, demCtx, photoCtx, downsample).then(() => {
            loadedTiles += 1;
            onProgress({ loaded: loadedTiles, total: totalTiles });
          })
        );
      }
    }

    await Promise.all(tilePromises);

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

  estimateTileCoverage(bounds, zoom) {
    const startX = GeoUtils.lon2tile(bounds.west, zoom);
    const endX = GeoUtils.lon2tile(bounds.east, zoom);
    const startY = GeoUtils.lat2tile(bounds.north, zoom);
    const endY = GeoUtils.lat2tile(bounds.south, zoom);
    const countX = endX - startX + 1;
    const countY = endY - startY + 1;

    return {
      startX,
      endX,
      startY,
      endY,
      countX,
      countY,
      totalTiles: countX * countY
    };
  }

  loadTile(tileX, tileY, zoom, offsetX, offsetY, demCtx, photoCtx, downsample = 1) {
    const tileSize = 256 / downsample;
    const drawX = offsetX * tileSize;
    const drawY = offsetY * tileSize;

    const loadImage = (url, ctx, fallbackColor) =>
      new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          if (ctx) {
            ctx.drawImage(image, drawX, drawY, tileSize, tileSize);
          }
          resolve();
        };
        image.onerror = () => {
          if (ctx) {
            ctx.fillStyle = fallbackColor;
            ctx.fillRect(drawX, drawY, tileSize, tileSize);
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
