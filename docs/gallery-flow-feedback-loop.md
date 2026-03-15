# ギャラリー導線 フィードバックループ運用

## 目的

- 主導線を `ギャラリー選択 → 自動生成 → 保存` に固定し、毎リリース同じ基準で改善する
- レイアウト評価だけでなく、機能品質（成功率・復帰率・失敗率）を同じループで監視する
- 「表示は正しいが機能的に弱い」状態を残さない

## スコープ

- 対象画面: `src/App.tsx`
- 対象セクション:
  - `LocationStepSection`
  - `GenerationStepSection`
  - `ExportStepSection`
  - `PrimaryActionSticky`
  - `FunctionalReviewSection`（`?review=1` 時）

## 1サイクルの手順

1. 仮説を1つだけ定義する  
   例: 「地点未選択時に生成を禁止するとエラー率が下がる」
2. Baselineを記録する（Playwright + 機能メトリクス）
3. 実装する（1テーマ1変更）
4. Playwrightで実動作を確認する
5. `?review=1` で機能評価メトリクスを確認する
6. 指標を再計測して `継続 / 縮小 / ロールバック` を決める

## 機能面メトリクス（必須）

- 生成成功率 = `generationSuccesses / generationAttempts`
- 保存成功率 = `exportSuccesses / exportAttempts`
- 検索失敗率 = `searchFailures / searchAttempts`
- エラー復帰回数 = `errorRecoveries`
- 初回生成到達時間 = `firstGeneratedMs`
- DEM欠損警告回数 = `demMissingWarnings`

## 必要度スコア（0〜100%）

- 定義: 0% は良好、100% は改善優先度が最大
- `検索導線必要度` = `searchFailureRate` を基準に算出
- `生成導線必要度` = 生成失敗率 + DEM欠損率 + 初回生成遅延ペナルティ
- `保存導線必要度` = 保存失敗率 + 生成後未保存ペナルティ
- `復帰導線必要度` = `100 - エラー復帰率`
- `総合改善必要度` = 上記4軸の重み付き平均
- 差分スコア = `現在必要度 - 基準必要度`（レビューUIの`現在値を基準保存`で基準を固定）

## 必要度の判定帯

- 0〜39%: 低（現状維持）
- 40〜69%: 中（次リリース候補）
- 70〜100%: 高（当該リリースで優先修正）

## 計測方法

- UI確認: Playwright 実操作で状態遷移とCTAの可視性を確認
- 機能確認: URL末尾に `?review=1` を付けて `機能評価レビュー（開発用）` を表示
- 記録単位: 1セッション（Splashから開始）

## Playwright確認項目（必須）

- `PrimaryActionSticky` がデスクトップ/モバイルで常時可視
- `generate-from-gallery` 押下で `generated` へ到達
- 地点未選択時は `generate-terrain-sticky` が無効
- `GenerationSummary` で地点・範囲・Zoom が表示される
- `generate-terrain-sticky` と `export-glb-sticky` が状態で正しく切り替わる
- 任意導線（`OptionalFinishingSection`）が `generated` 前に出ない

## 判定ルール

- `ship`
  - 主導線に関わるPlaywright項目が全Pass
  - 生成成功率 90%以上
  - 保存成功率 95%以上（試行がある場合）
  - 総合改善必要度 69%以下
- `no-ship`
  - 主導線に関わるPlaywright項目に1つでもFail
  - 地点未選択で生成が通る
  - 総合改善必要度 70%以上が継続
  - 表示不整合（地点/範囲/Zoom の不一致）が再現する

## 再流入禁止ルール

- 主導線と同等の強さを持つ副CTAを増やさない
- 地点未選択でも進める抜け道を再導入しない
- `Zoom 12` 等の初期値を文言と実値で不一致にしない
- 機能失敗を可視化しない実装（失敗回数未計測など）を残さない
