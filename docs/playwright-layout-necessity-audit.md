# Playwright レイアウト必要性監査（位置実測ベース）

## 実測条件

- URL: `http://127.0.0.1:4173`
- 実行順: Splashで`制作を始める`押下直後
- ビューポート:
- Desktop: `1440 x 900`
- Mobile: `390 x 844`

## 1. Desktop 実測（x,y,w,h）

| 要素 | 位置/サイズ | 初期表示内か | 判定材料 |
|---|---|---|---|
| `LocationStepSection` | `x33 y177 w386 h511` | Yes | 主導線の入口として表示される |
| `GenerationStepSection` | `x33 y708 w386 h280` | Yes（下端） | ほぼ折り返し位置で可 |
| `ExportStepSection` | `x33 y1114 w386 h161` | No | 主CTA領域が初期表示外 |
| 主CTA（Export内先頭） | `y1131 h40` | No | 最重要操作が見えない |
| `OptionalFinishingSection` | `y1008 h86` | No | 初期表示で不要だが高さを圧迫 |
| `ViewerRoot` | `x453 y17 w659 h1326` | Yes | 過大高さで縦伸び要因 |
| 右サイドバー（`aside.order-3`） | `x1129 y16 w280 h1328` | Yes | 常時表示価値を要再評価 |
| Footnote | `y1295 h32` | No | 初期表示外、常設不要候補 |

## 2. Mobile 実測（y,h）

| 要素 | 位置/サイズ | 初期表示内か | 判定材料 |
|---|---|---|---|
| `ViewerRoot` | `y13 h369` | Yes | 先頭表示される |
| `LocationStepSection` | `y560 h551` | 部分的 | 入力開始は可能 |
| `GenerationStepSection` | `y1131 h280` | No | 1スクロール以上必要 |
| `ExportStepSection` | `y1545 h181` | No | 主CTAが遠い |
| 主CTA（Export内先頭） | `y1562 h40` | No | 保存導線までの距離が長い |
| 右サイドバー（`aside.order-3`） | `y1811 h346` | No | 初期導線では視認不能 |
| Footnote | `y1746 h32` | No | 価値低、削除候補 |

## 3. 必要性判定（Playwright根拠）

| 要素 | 必須性 | 根拠（実測） | 推奨 |
|---|---|---|---|
| `ExportStepSection` | 必須 | 主CTA領域 | 位置を上に移動（固定/スティッキー） |
| 右サイドバー | 低〜中 | Mobileで完全に後段 | 初期表示から外す or 折りたたみ |
| `OptionalFinishingSection` | 低 | 主導線前に高さ消費 | `generated` までDOM非表示 |
| Footnote | 低 | どちらも初期表示外 | 削除またはヘルプへ移設 |
| Viewerの過大高さ | 中 | 左カラムCTAを押し下げ | 高さ制約を導入 |

## 4. 「いらないよね」を判断する基準（実装用）

次の3条件を満たす要素は削除/後段移動候補:

1. 初期表示で見えていない
2. 主導線3ステップの成功に直接寄与しない
3. 表示しても次行動を変えない

## 5. 直近アクション（優先順）

1. `ExportStepSection` を左カラム下固定（または上部固定）にし、主CTA常時可視化
2. 右サイドバーを `generated` まで非表示に変更
3. `OptionalFinishingSection` を `generated` 以外でDOM非表示
4. Footnote削除

