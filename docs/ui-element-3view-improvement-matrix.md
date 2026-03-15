# UI要素 3視点改善マトリクス（廃止候補洗い出し用）

## 判定ルール

- 重要度: `P0`（主導線に必須）/ `P1`（主導線を強く補助）/ `P2`（任意価値）/ `P3`（削除候補）
- 推奨アクション: `Keep`（維持）/ `Improve`（改善）/ `Remove`（削除）
- 3視点:
- Dev: 実装の一貫性、保守性、テスト容易性
- Design: 情報階層、視認性、認知負荷
- PO: 主導線完了率、保存到達率、リリース価値

## セクション単位レビュー

| 要素 | 目的 | Dev視点 | Design視点 | PO視点 | 重要度 | 推奨 | 理由 |
|---|---|---|---|---|---|---|---|
| SplashOverlay | 導線開始の合意 | ロジック単純、安定 | 入口説明として十分 | 初回迷子を防ぐ | P1 | Keep | 主導線説明の入口 |
| StatusPill/Title/Detail | 現在地の可視化 | 状態語彙7種と整合 | 文言階層が明確 | 次行動が伝わる | P0 | Keep | 状態誤解を防ぐ中核 |
| LocationStepSection | 地点確定 | 責務分離できている | 初手として自然 | 主導線1章 | P0 | Keep | 最重要導線 |
| GenerationStepSection | 生成条件決定 | 設定責務が集中 | 情報量は多い | 主導線2章 | P0 | Improve | 初期表示の入力負荷は継続監視 |
| ExportStepSection | 保存完了 | 主CTA切替が明確 | 優先度は高い | 主導線3章 | P0 | Keep | 完了率KPIに直結 |
| OptionalFinishingSection | 任意調整 | 分離済みで安全 | 任意表示として妥当 | 主導線を邪魔しない | P2 | Improve | `generated` 時のみ表示に絞る余地 |
| ViewerRoot | 3D確認 | Three.js連携安定 | 体験価値が高い | 生成結果の納得感 | P1 | Keep | プロダクト核の可視化 |
| SummaryCard:中心 | 参照情報固定 | 実装容易 | 見失い防止 | 再試行時に有用 | P1 | Keep | 地点確認の再認知コスト削減 |
| SummaryCard:範囲 | 条件確認 | 値同期が明快 | 生成条件理解に寄与 | 失敗時の調整判断に有用 | P1 | Keep | 再生成導線を強化 |
| SummaryCard:操作ヒント | 操作説明 | 静的で保守容易 | 初見支援 | 価値はあるが優先低 | P2 | Improve | 折りたたみ化検討可 |
| Footnote(Unity/Unrealメモ) | 出力補足 | 静的要素 | 下部に常設でノイズ化 | 一部ユーザーのみ有益 | P3 | Remove候補 | 別ヘルプへ移設が妥当 |

## ボタン単位レビュー

| ボタン | data-action | Dev視点 | Design視点 | PO視点 | 重要度 | 推奨 | 理由 |
|---|---|---|---|---|---|---|---|
| 制作を始める（Splash） | `enter-workspace` | 単機能で明確 | 入口CTAとして十分 | 導線開始に必須 | P1 | Keep | 初動の摩擦を減らす |
| 検索 | `search-location` | API依存点のみ | 意図が明確 | 主要導線の起点 | P0 | Keep | 主導線到達率に直結 |
| クイック地点3種 | `quick-location` | 実装重複小 | 選択肢が少数で妥当 | 初回成功率向上 | P1 | Keep | 初回価値提示に有効 |
| 地図中心を反映 | `apply-map-center` | 状態遷移明快 | クリック確定として自然 | 主導線補助として有効 | P1 | Keep | 2D確認後の確定操作 |
| 反映して地形を生成 | `apply-map-center-and-generate` | 便利だが分岐増 | 速いが文脈短絡あり | 完了率を上げる | P1 | Improve | 「標準設定で生成」説明を追加 |
| 広域/中域/焦点プリセット | `apply-preset` | 保守容易 | 選択理解しやすい | 時短効果が高い | P1 | Keep | 入力削減に効く |
| 詳細設定トグル | `toggle-advanced-inputs` | 状態管理容易 | ノイズ削減に寄与 | 迷いを減らす | P1 | Keep | 入力過多対策の要 |
| 主CTA(生成) | `generate-terrain` | 主要処理呼び出し | 強調必要 | 主導線の核 | P0 | Keep | 生成完了率の中心 |
| 主CTA(保存) | `export-glb` | 安定機能 | 生成後最強化すべき | 完了KPI直結 | P0 | Improve | 視覚強度をさらに上げる |
| 地形を再生成 | `generate-terrain` | action衝突あり | 文言やや曖昧 | 誤押下リスクあり | P2 | Improve | `regenerate-terrain` へ分離推奨 |
| 視点を戻す | `reset-camera` | 安定 | 便利だが主導線外 | 任意価値 | P2 | Keep | 任意機能として妥当 |
| 仕上げ開閉 | `toggle-finishing-options` | 単純 | 折りたたみとして良い | 主導線保護に有効 | P2 | Keep | 任意機能隔離の鍵 |
| 視点ポイント指定 | `apply-viewpoint` | 3D連携複雑 | 手順理解が必要 | 任意価値 | P2 | Improve | 生成後のみ強調表示 |
| 360表示 | `show-placement-guide` | 依存条件あり | 連続操作が必要 | 任意価値 | P2 | Improve | 前提不足時の説明を強化 |

## 入力要素単位レビュー

| 入力 | Dev視点 | Design視点 | PO視点 | 重要度 | 推奨 | 理由 |
|---|---|---|---|---|---|---|
| SearchQuery | 基本入力として安定 | 期待行動と一致 | 主要流入 | P0 | Keep | 主導線起点 |
| MapPreviewSurface | 自前実装で軽量 | 視認性は十分 | 地点誤り防止 | P1 | Improve | ピン/凡例の強化余地 |
| WidthRange/HeightRange | ロジック明確 | 詳細設定内で妥当 | 中級者向け調整 | P2 | Keep | 折りたたみ維持が前提 |
| ZoomSelect | 負荷と品質の要 | 初心者には難解 | 再試行時に有効 | P2 | Improve | 推奨値固定の説明強化 |
| CameraFov/EyeHeight/TimePreset | 任意設定 | 仕上げに限定可能 | 主導線への影響低 | P3 | Remove候補（段階） | 初期リリースでは非表示化可 |

## 「削る」候補（優先順）

1. `Footnote(Unity/Unrealメモ)`  
理由: 常設ノイズ。必要ユーザーにだけヘルプで十分。

2. `CameraFov/EyeHeight/TimePreset`（初期リリース段階で隠す）  
理由: 主導線完了率への寄与が低く、入力負荷を増やす。

3. `地形を再生成` のラベル/アクション重複  
理由: `generate-terrain` と意味衝突。誤認を生むため分離か一時削除が妥当。

## 次リリース実行案（最小で効果が高い順）

1. `P0/P1` 以外を初期表示から外す（特に Footnote と任意仕上げ詳細）。
2. `export-glb` を `generated` 状態で唯一の強主CTAにする。
3. `regenerate-terrain` を新設し、主CTAと副CTAの意味衝突を解消する。
