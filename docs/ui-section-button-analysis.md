# UI意味・ステップ分析（セクション/ボタン全量）

## 目的

- 各セクションとボタンの「意味」「役割」「ステップ位置」を統一する
- 主導線と任意導線の混在を防ぎ、毎リリースで判断を再現可能にする

## 体験章立て

1. 選ぶ（ギャラリーで地点を決める）
2. 作る（範囲と条件で地形生成）
3. 持ち出す（GLB保存）
4. 仕上げる（任意）

## セクション分析

| セクション | data-component | 章 | 目的 | 主CTA | 主要状態 |
|---|---|---|---|---|---|
| Splash | `SplashOverlay` | 導入 | ユーザーに最短導線を伝える | `制作を始める` | `splash` |
| 地点設定 | `LocationStepSection` | 1.選ぶ | 主要地点の即時選択と自動生成 | `generate-from-gallery` | `idle/searching/generating/generated` |
| 生成条件 | `GenerationStepSection` | 2.作る | 範囲・精度を決める | `この条件で地形を生成`（固定主CTA） | `ready-to-generate/generating` |
| 固定主導線 | `PrimaryActionSticky` | 2/3.作る/持ち出す | 状態に応じた主操作を常時提示 | `この条件で地形を生成` / `3Dモデルを保存` | `idle/ready-to-generate/generated` |
| 保存導線 | `ExportStepSection` | 3.持ち出す | 生成後の再生成・補助操作 | `地形を再生成`（生成後のみ） | `generated` |
| 任意仕上げ | `OptionalFinishingSection` | 4.仕上げる | 視点・見え方の確認 | `開く`（任意） | `generated` |

## ボタン分析（全量）

| ボタン | data-action | data-step | 導線 | 意味 | 推奨扱い |
|---|---|---|---|---|---|
| 制作を始める | `enter-workspace` | - | 主導線開始 | 導線を開始する | 常時主CTA |
| ギャラリー生成 | `generate-from-gallery` | `1.1` | 主導線 | サムネイルから即生成 | 主CTA候補 |
| 手動地点導線の開閉 | `toggle-manual-location-tools` | `1.2` | 補助導線 | 必要時のみ検索UIを開く | 任意 |
| 検索 | `search-location` | `1.3` | 補助導線 | 任意で地点名検索して生成 | 任意 |
| プリセット適用 | `apply-preset` | `2.1` | 主導線補助 | 範囲を即決定 | 副CTA |
| 詳細設定開閉 | `toggle-advanced-inputs` | `2.2` | 補助 | 入力負荷を抑制 | 任意 |
| 固定主生成 | `generate-terrain-sticky` | `2.3` | 主導線 | 生成の主操作を常時提示 | 最重要CTA |
| 固定主保存 | `export-glb-sticky` | `3.1` | 主導線 | 保存の主操作を常時提示 | 最重要CTA |
| 再生成 | `regenerate-terrain` / `regenerate-terrain-sticky` | `3.2` | 主導線補助 | 条件変更後の再実行 | 副CTA |
| 仕上げ開閉 | `toggle-finishing-options` | `4.1` | 任意導線 | 任意機能の展開 | 任意 |
| 視点指定 | `apply-viewpoint` | - | 任意導線 | 地形上で視点指定 | 任意 |
| 360確認 | `show-placement-guide` | - | 任意導線 | 人間視点確認 | 任意 |
| 視点を戻す | `reset-camera` | `4.2` | 任意導線 | カメラリセット | 任意 |

## 現状評価（PM観点）

- 良い点:
- 主導線3章（探す→作る→持ち出す）が明示されている
- 主CTAは `generated` で保存に切り替わる
- 任意機能は折りたたみで隔離されている
- 懸念:
- ギャラリーカード数が増えるとモバイルでの探索コストが上がる
- 固定主CTAにより主導線は安定したが、スクロール中の補助文言の可読性は継続監視が必要

## 次回改善候補（1リリース1テーマ）

1. ギャラリーカードに「地形タイプ（山岳 / 都市 / 海岸）」タグを追加して選択時間を短縮
2. `再生成` を `条件を変更して再生成` に改名して誤認を減らす
3. 仕上げセクションを `generated` 以外では非表示維持し、不要時の再表示を禁止する
