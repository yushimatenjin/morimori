# コンポーネントモデル

このプロジェクトには、まだ固定された UI キットはありません。先に完成形の部品名を決め打ちするのではなく、
状態と役割からコンポーネントを定義します。

## まず決めること

1. どの状態で出る要素か
2. その要素の役割は何か
3. 何回以上繰り返し使うか
4. バリアント差分なのか、別コンポーネントなのか

## コンポーネント候補の切り方

次の観点で切り出します。

- 行動: 何かを実行させる
- 入力: 値を受け取る
- 状態: 現在の状況を見せる
- 要約: 数値や設定を短く見せる
- 補助: 使い方や意図を補う
- 導線: 状態遷移を前に進める

## 最初に候補になりやすい部品

ここにある名前は固定ルールではなく、最初の設計候補です。

- `PrimaryAction`
- `SecondaryAction`
- `TertiaryAction`
- `IconAction`
- `SearchField`
- `ParameterField`
- `RangeControl`
- `SelectControl`
- `ToggleControl`
- `StatusBlock`
- `SummaryCard`
- `EmptyState`
- `OnboardingOverlay`
- `HintBlock`

役割が違うなら別部品、役割が同じなら同じ部品として扱います。

## 命名規約

内部識別子は英語で統一します。ユーザー向け文言は日本語を基本とします。

- JS component: `PascalCase`
- CSS component: `c-*`
- CSS state: `is-*`, `has-*`
- DOM hook: `data-component`, `data-action`, `data-state`

例:

- `data-component="PrimaryAction"`
- `data-action="generate-terrain"`
- `c-button`
- `is-loading`

## 状態語彙

全員で共有する最低限の状態語彙:

- `splash`
- `idle`
- `searching`
- `ready-to-generate`
- `generating`
- `generated`
- `error`

同じ意味なのに `ready`, `done`, `loaded`, `success` のような別名を乱立させないこと。
