# React + shadcn/ui 移行ガイド

現在のアプリは `Three.js` の直接制御を優先した Vanilla JS 構成です。
`shadcn/ui` は React 前提のため、次の順で段階移行します。

1. `npm create vite@latest . -- --template react` を別ブランチで実行
2. Three.js ロジック (`src/lib`, `src/services`, `src/viewer`) を維持し、UI層だけ React コンポーネント化
3. Tailwind CSS を導入 (`tailwind.config.js`, `postcss.config.js`) 
4. `npx shadcn@latest init` を実行し、`components.json` を使って初期化
5. 既存の `data-state` 7状態語彙を React state machine として引き継ぐ
6. `Button`, `Card`, `Input`, `Slider`, `Select`, `Switch`, `Badge` から置換

## 先に維持すべきもの

- 状態語彙: `splash`, `idle`, `searching`, `ready-to-generate`, `generating`, `generated`, `error`
- 文言の日本語統一
- `state / ui / viewer / services` の責務分離
