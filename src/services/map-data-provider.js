import * as THREE from "three";
import { GeoUtils } from "../lib/geo-utils.js";

export const MAX_TILE_COUNT = 1000;
const MAX_DEM_PIXELS = 1_500_000;
const DEM_SOURCES_HIGH_ZOOM = ["dem5a_png", "dem5b_png", "dem_png"];
const DEM_SOURCES_STANDARD = ["dem_png"];
const PHOTO_FALLBACK_COLOR = "#0f2236";
const DEM_NO_DATA_VALUE = 8388608;
const DEM_MIN_ELEVATION_M = -200;
const DEM_MAX_ELEVATION_M = 4500;

export class MapDataProvider {
  constructor() {
    this.demBaseUrl = "https://cyberjapandata.gsi.go.jp/xyz";
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
    const demDiagnostics = {
      missingCount: 0,
      missingSamples: []
    };
    const tilePromises = [];

    for (let y = 0; y < countY; y += 1) {
      for (let x = 0; x < countX; x += 1) {
        tilePromises.push(
          this.loadTile(startX + x, startY + y, zoom, x, y, demCtx, photoCtx, downsample).then((tileResult) => {
            if (tileResult?.demMissing) {
              demDiagnostics.missingCount += 1;
              if (demDiagnostics.missingSamples.length < 5 && tileResult.requestedDemUrl) {
                demDiagnostics.missingSamples.push(tileResult.requestedDemUrl);
              }
            }
            loadedTiles += 1;
            onProgress({ loaded: loadedTiles, total: totalTiles });
          })
        );
      }
    }

    await Promise.all(tilePromises);

    const demData = demCtx.getImageData(0, 0, demCanvas.width, demCanvas.height).data;
    const heights = new Float32Array(demData.length / 4);

    let invalidHeightCount = 0;
    for (let i = 0; i < heights.length; i += 1) {
      const r = demData[i * 4];
      const g = demData[i * 4 + 1];
      const b = demData[i * 4 + 2];
      const value = r * 65536 + g * 256 + b;
      if (value === DEM_NO_DATA_VALUE) {
        heights[i] = 0;
        invalidHeightCount += 1;
        continue;
      }

      const rawHeight = value < DEM_NO_DATA_VALUE ? value * 0.01 : (value - 16777216) * 0.01;
      const clamped = Math.min(DEM_MAX_ELEVATION_M, Math.max(DEM_MIN_ELEVATION_M, rawHeight));
      if (clamped !== rawHeight) {
        invalidHeightCount += 1;
      }
      heights[i] = clamped;
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
      },
      diagnostics: {
        demMissingCount: demDiagnostics.missingCount,
        demMissingSamples: demDiagnostics.missingSamples,
        invalidHeightCount
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

  async loadTile(tileX, tileY, zoom, offsetX, offsetY, demCtx, photoCtx, downsample = 1) {
    const tileSize = 256 / downsample;
    const drawX = offsetX * tileSize;
    const drawY = offsetY * tileSize;

    const photoBitmap = await this.fetchImageBitmap(`${this.photoUrl}/${zoom}/${tileX}/${tileY}.jpg`);

    if (photoCtx) {
      if (photoBitmap) {
        photoCtx.drawImage(photoBitmap, drawX, drawY, tileSize, tileSize);
      } else {
        photoCtx.fillStyle = PHOTO_FALLBACK_COLOR;
        photoCtx.fillRect(drawX, drawY, tileSize, tileSize);
      }
    }

    const demResult = await this.loadDemTileWithFallback(tileX, tileY, zoom, demCtx, drawX, drawY, tileSize, photoBitmap);
    photoBitmap?.close();

    return demResult;
  }

  async loadDemTileWithFallback(tileX, tileY, zoom, demCtx, drawX, drawY, tileSize, photoBitmap = null) {
    let firstRequestedUrl = null;
    const sources = zoom >= 15 ? DEM_SOURCES_HIGH_ZOOM : DEM_SOURCES_STANDARD;

    for (const source of sources) {
      const url = `${this.demBaseUrl}/${source}/${zoom}/${tileX}/${tileY}.png`;
      if (!firstRequestedUrl) firstRequestedUrl = url;

      try {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) {
          if (response.status === 404) {
            continue;
          }
          continue;
        }

        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        demCtx.drawImage(bitmap, drawX, drawY, tileSize, tileSize);
        bitmap.close();
        return {
          demMissing: false,
          requestedDemUrl: firstRequestedUrl
        };
      } catch (_error) {
        continue;
      }
    }

    if (photoBitmap) {
      this.drawPseudoDemFromPhoto(photoBitmap, demCtx, drawX, drawY, tileSize);
      return {
        demMissing: true,
        requestedDemUrl: firstRequestedUrl
      };
    }

    demCtx.fillStyle = "#000000";
    demCtx.fillRect(drawX, drawY, tileSize, tileSize);

    return {
      demMissing: true,
      requestedDemUrl: firstRequestedUrl
    };
  }

  async fetchImageBitmap(url) {
    try {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) {
        return null;
      }
      const blob = await response.blob();
      return await createImageBitmap(blob);
    } catch (_error) {
      return null;
    }
  }

  drawPseudoDemFromPhoto(photoBitmap, demCtx, drawX, drawY, tileSize) {
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = 256;
    sampleCanvas.height = 256;
    const sampleCtx = sampleCanvas.getContext("2d");
    if (!sampleCtx) {
      demCtx.fillStyle = "#000000";
      demCtx.fillRect(drawX, drawY, tileSize, tileSize);
      return;
    }

    sampleCtx.drawImage(photoBitmap, 0, 0, 256, 256);
    const imageData = sampleCtx.getImageData(0, 0, 256, 256);
    const pixels = imageData.data;

    // 写真の明度から疑似標高を生成して、DEM欠損地点でも最低限の起伏を確保する
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const pseudoMeters = 8 + (luma / 255) * 220;
      const demValue = Math.max(0, Math.round(pseudoMeters * 100));
      pixels[i] = (demValue >> 16) & 255;
      pixels[i + 1] = (demValue >> 8) & 255;
      pixels[i + 2] = demValue & 255;
      pixels[i + 3] = 255;
    }

    sampleCtx.putImageData(imageData, 0, 0);
    demCtx.drawImage(sampleCanvas, drawX, drawY, tileSize, tileSize);
  }
}
