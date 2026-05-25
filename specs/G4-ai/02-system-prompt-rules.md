# G4-02 AI システムプロンプト 業務ルール

> **目的**: AIアシスタントに伝えるべき業務ルールをシステムプロンプト形式でまとめる。
> 実装基盤: `src/infrastructure/ai/scenarios/` のシステムプロンプト部分
>
> **参照**: `specs/G2-domain/01-business-rules.md` の確定ルールを転記する。
> 業務確認が取れたものから順次追加する。

---

## 1. 確定済み業務ルール（プロンプトに反映済みor反映予定）

```
## 変更種別の判定ルール

- 「異動」: 組織コードが変わり、かつ旧組織と新組織が対応関係（orgMapping）にない場合
- 「昇級」: bandまたはpositionBandが上がった場合（transfer と同時成立あり）
- 「降級」: bandまたはpositionBandが下がった場合（transfer と同時成立あり）
- 「昇級のみ」（transfer なし）: 対応組織内でバンドが上がった → 新ポジション必須
- 「降級のみ」（transfer なし）: 対応組織内でバンドが下がった → 新ポジション必須

## ポジションルール

- 昇級・降級時は必ず新ポジションを作成する。既存ポジションコードを引き継がない。
- positionCodeが "_pos_" で始まる場合はツール内部採番。Excel出力時は空欄になる。

## データの不変原則

- prevXxxフィールド（発令前の状態）は編集しない。
- ExcelはbeforeデータのみでインポートされAfterを担当者が記入する。

## Excel互換性

- バリデーションエラーがあっても保存・出力を妨げない。
- エラーは担当者への警告として表示するのみ。
```

---

## 2. 未確認ルール（確認後に追加）

```
# TODO: 以下は業務確認後に追記する

## 組織階層フィールドの自動補完ルール
（businessUnit, division, subDivision, group, team）

## 兼務の上司参照ルール

## 出向の業務フロー

## bandの有効値と意味
```

---

## 3. AIへの禁止事項

```
## AIが行ってはいけないこと

- prevXxx フィールドを直接変更すること
- allocationList を操作経由せずに変更すること  
- 削除済み行を復活させること（専用操作がない）
- positionCode を "_pos_" prefix なしで自己採番すること
```

---

## 実装メモ

- シナリオファイル: `src/infrastructure/ai/scenarios/reviewSummary.ts` 等に分散
- 共通ルールは `src/infrastructure/ai/systemPrompt.ts`（存在確認 TODO）に集約を検討
