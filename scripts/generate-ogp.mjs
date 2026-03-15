import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outFile = path.join(rootDir, "public", "ogp.png");
const fontCacheDir = path.join(rootDir, ".cache", "ogp-fonts");

const FONT_REGULAR_URL =
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf";
const FONT_BOLD_URL =
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Bold.otf";

async function ensureBinaryFile(filePath, url) {
  try {
    await fs.access(filePath);
    return;
  } catch {
    // download
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`フォント取得に失敗しました: ${url} (${response.status})`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, data);
}

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

async function main() {
  await fs.mkdir(path.join(rootDir, "public"), { recursive: true });
  await fs.mkdir(fontCacheDir, { recursive: true });

  const regularPath = path.join(fontCacheDir, "NotoSansCJKjp-Regular.otf");
  const boldPath = path.join(fontCacheDir, "NotoSansCJKjp-Bold.otf");
  await ensureBinaryFile(regularPath, FONT_REGULAR_URL);
  await ensureBinaryFile(boldPath, FONT_BOLD_URL);

  const [fontRegular, fontBold] = await Promise.all([fs.readFile(regularPath), fs.readFile(boldPath)]);

  const width = 1200;
  const height = 630;
  const panelColor = "rgba(8, 18, 42, 0.72)";

  const element = h(
    "div",
    {
      style: {
        width: `${width}px`,
        height: `${height}px`,
        position: "relative",
        display: "flex",
        fontFamily: "Noto Sans JP",
        background: "linear-gradient(135deg, #0b1120 0%, #0a1b3d 55%, #0a1430 100%)",
        color: "#e2e8f0",
        overflow: "hidden"
      }
    },
    h("div", {
      style: {
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(circle at 20% 18%, rgba(34,211,238,0.20), transparent 35%), radial-gradient(circle at 78% 80%, rgba(16,185,129,0.22), transparent 38%)"
      }
    }),
    h("div", {
      style: {
        position: "absolute",
        left: 52,
        top: 44,
        width: 1096,
        height: 256,
        border: "2px solid rgba(34,211,238,0.85)",
        background: panelColor,
        borderRadius: 10
      }
    }),
    h(
      "div",
      {
        style: {
          position: "absolute",
          left: 82,
          top: 72,
          display: "flex",
          flexDirection: "column",
          gap: 10
        }
      },
      h(
        "div",
        {
          style: {
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1
          }
        },
        "Morimorimori"
      ),
      h(
        "div",
        {
          style: {
            fontSize: 50,
            fontWeight: 700,
            lineHeight: 1.15
          }
        },
        "背景地形制作ワークスペース"
      ),
      h(
        "div",
        {
          style: {
            marginTop: 2,
            fontSize: 43,
            fontWeight: 700,
            color: "#22d3ee"
          }
        },
        "探す  →  作る  →  持ち出す"
      ),
      h(
        "div",
        {
          style: {
            fontSize: 39,
            fontWeight: 500,
            color: "#f59e0b"
          }
        },
        "地形を生成して GLB として保存"
      )
    ),
    h("div", {
      style: {
        position: "absolute",
        left: 78,
        top: 97,
        width: 18,
        height: 18,
        borderRadius: 9,
        background: "#f59e0b"
      }
    }),
    h("div", {
      style: {
        position: "absolute",
        right: 78,
        top: 97,
        width: 18,
        height: 18,
        borderRadius: 9,
        background: "#f59e0b"
      }
    }),
    h(
      "svg",
      {
        width: "1200",
        height: "312",
        viewBox: "0 0 1200 312",
        style: {
          position: "absolute",
          left: 0,
          bottom: 0
        }
      },
      h(
        "defs",
        null,
        h(
          "linearGradient",
          { id: "terrainBand", x1: "0", y1: "0", x2: "0", y2: "1" },
          h("stop", { offset: "0%", stopColor: "rgba(34,211,238,0.28)" }),
          h("stop", { offset: "100%", stopColor: "rgba(34,211,238,0)" })
        )
      ),
      h("rect", { x: "0", y: "0", width: "1200", height: "190", fill: "url(#terrainBand)" }),
      h("polyline", {
        points: "32,210 210,90 390,150 610,10 850,95 1170,38",
        fill: "none",
        stroke: "#22d3ee",
        strokeWidth: "8",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }),
      h("polyline", {
        points: "32,258 200,180 420,225 640,118 870,180 1170,134",
        fill: "none",
        stroke: "#10b981",
        strokeWidth: "6",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }),
      h("polyline", {
        points: "32,308 230,256 450,294 680,220 900,256 1170,236",
        fill: "none",
        stroke: "#f59e0b",
        strokeWidth: "4",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      })
    )
  );

  const svg = await satori(element, {
    width,
    height,
    fonts: [
      { name: "Noto Sans JP", data: fontRegular, weight: 400, style: "normal" },
      { name: "Noto Sans JP", data: fontBold, weight: 700, style: "normal" }
    ]
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width }
  });
  const png = resvg.render().asPng();
  await fs.writeFile(outFile, png);

  console.log(`generated: ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
