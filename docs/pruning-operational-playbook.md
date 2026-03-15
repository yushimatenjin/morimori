# UI削減 完全運用プレイブック（全要素をさらに詰める版）

## 目的

- 「何となく残す」を禁止し、数値で `Keep / Improve / Remove` を決める
- 毎リリースで同じ手順を回し、UIを段階的に軽量化する
- 主導線完了率を最優先に、不要要素を継続的に削る

## 0. ゴール定義（固定）

- 成功条件はただ1つ:  
  地点決定 → 地形生成 → GLB保存 が迷わず完了すること

- これ以外の価値は「任意価値」とみなし、主導線に干渉したら削る

## 1. 要素スコアリング（必須）

各要素を 0〜5 点で採点する。

### 1-1. 評価軸

- `FlowImpact`（主導線寄与）
- `ErrorRisk`（誤操作/混乱リスク）
- `OpsCost`（実装・テスト・保守コスト）
- `UserValue`（ユーザー体感価値）
- `Clarity`（現在地/次行動の明瞭さ）

### 1-2. 計算式

`FinalScore = (FlowImpact * 3) + (UserValue * 2) + (Clarity * 2) - (ErrorRisk * 2) - OpsCost`

### 1-3. 判定

- `FinalScore >= 12` → Keep
- `6 <= FinalScore < 12` → Improve
- `FinalScore < 6` → Remove候補

## 2. 3視点レビューを数値化する

### Dev採点ガイド

- 5: 責務が単純でテスト容易
- 3: 保守可能だが条件分岐が増える
- 1: 意味衝突・重複責務・回帰リスクが高い

### Design採点ガイド

- 5: 階層が明確で認知負荷が低い
- 3: 理解可能だが情報が多い
- 1: 主CTAが埋もれる/判断が迷う

### PO採点ガイド

- 5: 完了率/保存率に直接効く
- 3: 補助価値はある
- 1: 指標への寄与が薄い

## 3. 対象要素の完全棚卸しテンプレ

| 要素ID | 要素名 | 種別 | 章 | 前提 | 次遷移 | Dev(0-5) | Design(0-5) | PO(0-5) | FinalScore | 判定 | コメント |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E-001 | `enter-workspace` | button | 入口 | splash | idle |  |  |  |  |  |  |
| E-002 | `search-location` | button | 探す | idle | searching/generated |  |  |  |  |  |  |
| E-003 | `quick-location` | button | 探す | idle | generated |  |  |  |  |  |  |
| E-004 | `MapPreviewSurface` | input | 探す | idle | apply-map-center |  |  |  |  |  |  |
| E-005 | `apply-map-center` | button | 探す | map-selected | ready-to-generate |  |  |  |  |  |  |
| E-006 | `apply-map-center-and-generate` | button | 探す | map-selected | generated |  |  |  |  |  |  |
| E-007 | `apply-preset` | button | 作る | ready-to-generate | ready-to-generate |  |  |  |  |  |  |
| E-008 | `toggle-advanced-inputs` | button | 作る | なし | detail-open |  |  |  |  |  |  |
| E-009 | `WidthRange` | input | 作る | detail-open | ready-to-generate |  |  |  |  |  |  |
| E-010 | `HeightRange` | input | 作る | detail-open | ready-to-generate |  |  |  |  |  |  |
| E-011 | `ZoomSelect` | input | 作る | detail-open | ready-to-generate |  |  |  |  |  |  |
| E-012 | 主CTA `generate-terrain` | button | 作る | center-set | generating |  |  |  |  |  |  |
| E-013 | 主CTA `export-glb` | button | 持ち出す | generated | completed |  |  |  |  |  |  |
| E-014 | `generate-terrain`(副) | button | 持ち出す | generated | generating |  |  |  |  |  |  |
| E-015 | `toggle-finishing-options` | button | 仕上げ | generated | optional-open |  |  |  |  |  |  |
| E-016 | `apply-viewpoint` | button | 仕上げ | generated | pick-mode |  |  |  |  |  |  |
| E-017 | `show-placement-guide` | button | 仕上げ | viewpoint-picked | street-view |  |  |  |  |  |  |
| E-018 | `reset-camera` | button | 仕上げ | generated | generated |  |  |  |  |  |  |
| E-019 | `Footnote` | text | 全体 | なし | なし |  |  |  |  |  |  |

## 4. 削減実行フロー（毎スプリント）

1. 棚卸し表を全要素で更新
2. `FinalScore < 6` を削除候補へ移動
3. 候補から「依存ゼロ」のものを先に削る
4. Playwright主要ケースを再実行
5. 指標を比較（生成完了率/保存率）
6. 改悪なら即ロールバック

## 5. 依存ゼロ優先で削る順番

### Wave-1（低リスク）

- Footnote
- 操作ヒントカード（初期表示）
- 仕上げ内の説明過多テキスト

### Wave-2（中リスク）

- `apply-map-center-and-generate`（短絡操作）
- `quick-location` を3→2に削減
- 再生成ボタンの位置・文言統一

### Wave-3（高リスク）

- 仕上げ機能群の段階的非表示
- 詳細設定項目の一部廃止

## 6. リリース判定（削減版）

- 必須Pass:
- IT-01 / IT-02 / IT-05 / IT-07 / IT-08
- 目標指標:
- 生成完了率: 前回比 `+5%` 以上
- 保存到達率: 前回比 `+3%` 以上
- 不合格条件:
- 主CTA誤押下が増加
- エラー復帰率が低下

## 7. 具体的な「さらに削る」提案（現時点）

1. `Footnote` を完全削除（ヘルプへ移設）
2. `SummaryCard: 操作ヒント` を初期非表示化
3. `apply-map-center-and-generate` を一旦無効化し、`apply-map-center` に統一
4. `generate-terrain` 副CTAを `regenerate-terrain` に分離
5. 仕上げセクションを `generated` 以外でDOM除外

## 8. 意思決定テンプレ（PO最終判断）

- 維持理由:
- 削除理由:
- 期待効果:
- リスク:
- ロールバック条件:
- 測定期間:

