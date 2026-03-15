---
name: optimal-decision-design-governance
description: morimorimori で改善案の最適案を意思決定し、同時にデザインシステム統一を担保するときに使う。複数案比較、重み付き採点、採用/却下判断、デザインガバナンス審査を行うタスクで必ず使う。
---

# 最適案意思決定 + デザイン統一ガバナンス

この Skill は、案を比較して最適案を選びつつ、デザイン崩れを防ぐために使います。

最初に `../../AGENTS.md` を読みます。次に以下を参照します。

- `../../docs/optimal-decision-framework.md`
- `../../docs/design-system-governance.md`
- `../../docs/ui-element-3view-improvement-matrix.md`
- `../../docs/flow-dependency-pruning-map.md`
- `../../docs/decision-feedback-loop-template.md`

## 実行手順

1. 候補案を最大3案に整理する
2. 重み付きで採点する（主導線効果を最優先）
3. 1位案を選定し、却下理由も記録する
4. デザイン統一審査を実施する
5. Playwrightで実動作確認する
6. `ship / no-ship` を決める
7. リリース後 24h/72h/1week で再採点し、継続/縮小/ロールバックを決める

## 必須チェック

- 主CTAは1つか
- モバイルで主CTAが初期表示内か
- 任意導線が主導線より目立っていないか
- 同役割UIが同一コンポーネントに統一されているか

## 出力フォーマット

1. 候補案比較表（A/B/C）
2. 採点結果（総合点）
3. 採用案と理由
4. 却下案と理由
5. リスクと回避策
6. 実装後の検証結果（Playwright）
7. 反復結果（24h/72h/1week）
