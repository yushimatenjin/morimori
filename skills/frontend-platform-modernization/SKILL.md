---
name: frontend-platform-modernization
description: morimorimori のフロントエンド基盤を、単一ファイル構成から Vite + 責務分離 + UI基盤へ進化させるときの実装スキル。
---

# フロント基盤モダナイズ

## 目的

`index.html` 単体構成から、公開運用可能な構成へ移行する。

## 手順

1. ビルド基盤を Vite へ移行する
2. `state / services / viewer / ui` に分割する
3. CSS を `foundation / layouts / components` に分割する
4. 状態語彙 7種を UI と JS で一致させる
5. 主CTAと状態文言を各状態で明示する
6. デスクトップ・モバイルの表示を確認する

## 受け入れ条件

- `npm run build` が成功する
- 7状態が画面上で判別できる
- 主要操作のDOMフックが `data-action` で統一される
- 文言の言語が画面単位で混在しない
