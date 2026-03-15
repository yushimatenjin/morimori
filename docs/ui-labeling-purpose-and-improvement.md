# UIラベル定義・目的・改善ポイント統合ドキュメント

## 目的

- 画面上の全要素に「何のために存在するか」を明示する
- ボタンごとの意味を統一し、場当たり実装を防ぐ
- 開発者 / デザイナー / PO の3視点で改善ポイントを共有する

## 1. 画面要素ラベル定義（全体）

| 領域 | ラベル | data-component / 種別 | 目的 |
|---|---|---|---|
| 導入 | SplashOverlay | `SplashOverlay` | 初回に主導線（探す→作る→持ち出す）を伝える |
| 状態表示 | StatusPill | `StatusPill` | 現在フェーズを短く示す |
| 状態表示 | StatusTitle | テキスト | 現在地を文で示す |
| 状態表示 | StatusDetail | テキスト | 次行動を示す補足 |
| ステップ1 | LocationStepSection | `LocationStepSection` | 地点を決める（入力 or 地図） |
| ステップ2 | GenerationStepSection | `GenerationStepSection` | 範囲・条件で地形を作る |
| ステップ3 | ExportStepSection | `ExportStepSection` | 生成結果を保存して持ち出す |
| 任意 | OptionalFinishingSection | `OptionalFinishingSection` | 保存後の仕上げ確認 |
| ビュー | ViewerRoot | `ViewerRoot` | 3D地形の確認 |
| 要約 | SummaryCard(中心) | カード | 中心地点を固定表示 |
| 要約 | SummaryCard(範囲) | カード | 範囲と解像度を固定表示 |
| 要約 | SummaryCard(操作) | カード | 基本操作を常時表示 |
| フィードバック | SearchStatus | 下部メッセージ | 処理結果と次の行動を即時に伝える |

## 2. 入力要素ラベル定義

| 入力 | ラベル | 種別 | 目的 |
|---|---|---|---|
| SearchQuery | 中心地点検索 | テキスト入力 | 地名から中心を決める |
| MapPreviewSurface | 2D確認地図 | クリック面 | 位置を目視で確定する |
| WidthRange | 幅 | スライダー | 生成範囲の横幅調整 |
| HeightRange | 奥行 | スライダー | 生成範囲の奥行調整 |
| ZoomSelect | 地形細かさ | セレクト | 解像度と負荷のバランス調整 |
| CameraFov | FOV | 数値入力 | 仕上げ時の画角調整（任意） |
| EyeHeight | 視点高さ | 数値入力 | 仕上げ時の目線高さ調整（任意） |
| TimePreset | 時間帯 | セレクト | 仕上げ時の見え方確認（任意） |

## 3. 全ボタン意味定義

| ボタン文言 | data-action | 主/副 | 何のためにあるか |
|---|---|---|---|
| 制作を始める | `enter-workspace` | 主 | Splashから作業状態へ遷移する |
| 検索 | `search-location` | 主候補 | 地名検索→中心確定→自動生成へ進める |
| 富士山 / 横浜 / 箱根 | `quick-location` | 副 | 代表地点で即時に中心を決める |
| 地図中心を反映 | `apply-map-center` | 主候補 | 2D確認地点を確定して次の生成準備に進む |
| 反映して地形を生成 | `apply-map-center-and-generate` | 主導線短縮 | 地図確定と生成を1操作で完了する |
| 広域40km / 中域18km / 焦点8km | `apply-preset` | 副 | 生成条件を即決する |
| 詳細設定を開く/閉じる | `toggle-advanced-inputs` | 副 | 入力負荷を抑えつつ必要時のみ詳細を出す |
| 主CTA（生成時） | `generate-terrain` | 主 | 現条件で地形を生成する |
| 主CTA（生成後） | `export-glb` | 主 | 生成結果をGLB保存して主導線を完了する |
| 地形を再生成 | `generate-terrain` | 副 | 条件調整後の再生成 |
| 視点を戻す | `reset-camera` | 副（任意） | カメラを初期視点へ戻す |
| 開く/閉じる（仕上げ） | `toggle-finishing-options` | 副（任意） | 任意機能の展開・収納 |
| 視点ポイントを地形上で指定 | `apply-viewpoint` | 副（任意） | 視点指定モードに入る |
| 人間視点で360°表示 | `show-placement-guide` | 副（任意） | 視点指定後の確認へ進む |

## 4. 状態遷移での意味づけ

| 状態 | 画面の意味 | 主CTAの意味 |
|---|---|---|
| splash | 体験の入口 | 作業開始 |
| idle | 地点決定待ち | 検索で開始 |
| searching | 検索処理中 | 待機 |
| ready-to-generate | 生成準備完了 | 生成実行 |
| generating | 地形生成中 | 待機 |
| generated | 主導線の保存段階 | GLB保存 |
| error | 再開支援段階 | 原因確認と再試行 |

## 5. 改善ポイント（開発者視点）

- `data-action` の重複意味を分離する
- `generate-terrain` が主CTA/副CTAの両方に使われているため、分析時に誤認しやすい。副CTAを `regenerate-terrain` に分離すると保守性が上がる。
- ステップメタデータを型で管理する
- `step-id`, `journey-type`, `primary/secondary` を定数化して、UI更新時の抜け漏れを防ぐ。
- E2E基準の自動化
- 結合テスト表の主要ケース（IT-01/02/05/06/08）をCIで毎回回す。

## 6. 改善ポイント（デザイナー視点）

- 主CTAの視覚的優先をさらに明確化
- `generated` では保存ボタンを周辺操作より一段強く（サイズ・コントラスト）する。
- 任意導線の視覚ノイズ削減
- 仕上げセクションは `generated` 以外でより弱い見せ方にする（現状は存在感がやや強い）。
- 2D確認の読解性強化
- 地図の矩形凡例（青枠=生成範囲）を常時1行で明示し、初見理解をさらに速める。

## 7. 改善ポイント（PO視点）

- KPI連動の優先順位固定
- 優先順位は `生成完了率` → `保存完了率` → `任意機能利用率` の順で固定する。
- 1リリース1テーマ運用
- 「入力削減」「保存到達率」「エラー復帰率」など、1テーマだけ選んで改善する。
- 受け入れ条件の必須化
- リリース時は「主導線3ステップが迷わず通ること」を必須条件にする。

## 8. すぐ着手できる次アクション

1. `regenerate-terrain` を新設して `data-action` の意味衝突を解消する。
2. `generated` 状態時の保存CTAを視覚的に最強化する。
3. 結合テスト表の主要ケースをPlaywrightスクリプトとして固定化する。

