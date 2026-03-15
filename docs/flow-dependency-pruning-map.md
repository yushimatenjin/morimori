# フロー依存マップと削減判断（必須でないなら削る）

## 目的

- UI要素の前後関係を可視化し、不要要素を削る判断を可能にする
- 「主導線に必須か？」を唯一の基準にしてシンプル化する

## 1. 主導線（最小完成フロー）

1. 地点を決める
2. 地形を生成する
3. GLBを保存する

この3つに直接効かない要素は、初期表示から外す候補。

## 2. 前後関係（依存グラフ）

| 要素 | 直前に必要なもの | 直後に開くもの | 主導線必須 | 削除時の影響 |
|---|---|---|---|---|
| `enter-workspace` | なし | `idle` 状態 | Yes | 開始不能 |
| `search-query` + `search-location` | `idle` | `generated`（自動生成） | Yes | 地点探索不能 |
| `quick-location` | `idle` | `generated`（自動生成） | No | 速度低下のみ |
| `MapPreviewSurface` | `idle` | `apply-map-center` | No | 目視確認精度が低下 |
| `apply-map-center` | 2D候補地点 | `ready-to-generate` | No | 2D確認導線が成立しない |
| `apply-map-center-and-generate` | 2D候補地点 | `generated` | No | 1クリック短縮が消えるだけ |
| `apply-preset` | `idle/ready-to-generate` | 生成条件確定 | No | 速度低下のみ |
| `generate-terrain`（主） | 中心地点 | `generated` | Yes | 生成不能 |
| `export-glb`（主） | `generated` | 導線完了 | Yes | 完了不能 |
| `generate-terrain`（副:再生成） | `generated` | `generating` | No | 再試行が1手増える |
| `toggle-advanced-inputs` | なし | 詳細入力表示 | No | 初心者向け簡潔化に有利 |
| `Width/Height/Zoom` 詳細入力 | 詳細設定を開く | 高度調整 | No | 精密調整不可 |
| `toggle-finishing-options` | `generated` | 任意仕上げ表示 | No | 仕上げ機能に到達しづらい |
| `apply-viewpoint` / `show-placement-guide` | `generated` + 任意開閉 | 360確認 | No | 主導線には無影響 |
| `reset-camera` | `generated` | 視点復帰 | No | 便利機能喪失のみ |
| `SummaryCard群` | 各状態 | 状況把握補助 | No | 認知コスト増 |
| `Footnote` | なし | なし | No | ほぼ無影響 |

## 3. 削る判断ルール（機械的）

- Rule-1: 主導線3ステップに直接寄与しない要素は初期表示しない
- Rule-2: なくても主導線完了率が下がらない要素は `Remove` または `後段へ移動`
- Rule-3: 1クリック短縮系は、混乱を増やすなら削る
- Rule-4: 補助説明は、行動を変えないなら削る

## 4. 要素別「残す/削る」一次判定

| 要素 | 判定 | 理由 |
|---|---|---|
| `enter-workspace` | Keep | 入口の必須操作 |
| `search-location` | Keep | 地点決定の中核 |
| `generate-terrain`（主） | Keep | 生成そのもの |
| `export-glb`（主） | Keep | 完了そのもの |
| `quick-location` | Keep（任意） | 初回成功率を上げる |
| `MapPreviewSurface` | Keep（任意） | 位置誤りを減らす |
| `apply-map-center-and-generate` | Improve/Remove候補 | 便利だが章を飛ばしやすい |
| `apply-preset` | Keep | 入力削減に有効 |
| `toggle-advanced-inputs` | Keep | 入力過多対策の要 |
| `Width/Height/Zoom` | Keep（折りたたみ内） | 上級調整として妥当 |
| 任意仕上げ一式 | Keep（後段限定） | 主導線と分離できている |
| `SummaryCard:操作ヒント` | Remove候補 | 行動変化が弱い |
| `Footnote` | Remove候補 | 常時表示の価値が低い |

## 5. シンプル化プラン（即実行）

### Phase A（すぐやる）
- `Footnote` を削除
- `SummaryCard:操作ヒント` を非表示（必要時のみ）
- `apply-map-center-and-generate` の文言を「標準設定で生成」に変更

### Phase B（主導線をさらに短く）
- `quick-location` を2件に削減（最大2）
- ステップ2の初期表示を「プリセット + 主CTA」のみに固定

### Phase C（任意機能の徹底隔離）
- `generated` 以外で任意仕上げをDOMごと非表示
- `reset-camera` を任意セクション配下へ移動

## 6. 「これが必須じゃないなら削る」最終チェック

各要素に対して以下をYes/Noで判定:

1. これがないと `地点決定` できないか？
2. これがないと `地形生成` できないか？
3. これがないと `GLB保存` できないか？

3つすべてNoなら、初期表示から外す（または削除）。

