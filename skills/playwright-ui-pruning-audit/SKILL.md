---
name: playwright-ui-pruning-audit
description: morimorimori の UI要素を Playwright 実測で監査し、各要素の位置・可視性・主導線寄与から Keep/Improve/Remove を判断するときに使う。レイアウトの前後関係や初期表示の過密を定量評価し、削るべき要素を優先度付きで決めるタスクで必ず使う。
---

# Playwright UI 削減監査

この Skill は「要素がどこにあり、本当に必要か」を実測で判断するときに使います。

最初に `../../AGENTS.md` を読みます。次に次の資料を参照します。

- `../../docs/integration-test-matrix.md`
- `../../docs/playwright-layout-necessity-audit.md`
- `../../docs/flow-dependency-pruning-map.md`
- `../../docs/ui-element-3view-improvement-matrix.md`
- `../../docs/pruning-operational-playbook.md`

## 実行手順

1. ローカルサーバーを起動する（例: `pnpm dev --host 127.0.0.1 --port 4173`）。
2. Playwright で Desktop（1440x900）と Mobile（390x844）を開く。
3. Splash の `制作を始める` 押下後に、主要要素の `boundingBox` を採取する。
4. 各要素に対して以下を記録する。
- 座標（x,y,w,h）
- 初期表示内か（`inViewport`）
- 主導線寄与（地点決定/生成/保存のどこに効くか）
- 依存関係（前提要素・後続要素）
5. `Keep/Improve/Remove` と重要度（P0/P1/P2/P3）を更新する。
6. 削減案を作るときは「依存ゼロの要素」から着手する。
7. 改修後は必ず Playwright で再実測し、レイアウト監査結果を更新する。

## 評価基準（必須）

- P0: 主導線3ステップに必須（地点決定/地形生成/GLB保存）
- P1: 主導線を強く補助
- P2: 任意価値
- P3: 削除候補

`FinalScore` を使う場合は `../../docs/pruning-operational-playbook.md` の式に従います。

## レポート出力フォーマット

必ず以下を含めます。

1. 実測条件（ビューポート、状態、操作順）
2. 要素ごとの位置と可視性
3. 主導線寄与の有無
4. Keep/Improve/Remove 判定
5. 次に削る順序（低リスク→高リスク）

## 禁止事項

- スクリーンショットだけで必要性を判断しない（座標実測必須）
- 主導線P0要素を、代替導線なしで削除しない
- Playwright未確認のまま `typecheck/build` だけで完了扱いにしない

