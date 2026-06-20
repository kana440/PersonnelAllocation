# 00 横断的影響チェックリスト

> **目的**: 変更の種類ごとに「影響を受ける可能性のある領域」を網羅する。
> 実装時・レビュー時に参照し、実装漏れを防ぐ。
>
> **使い方**:
> - 実装前にこのファイルを読み、該当する変更種別のチェックリストを確認する
> - チェックが不要な項目は「対象外」と判断した理由をコメントに残す
> - スラッシュコマンド (`/project:implement-spec` 等) が自動的に参照する

> **用語について**: spec 内で「マスタ」と記載しているものは、コード上の `AllCodeLists` 型（`packages/domain/src/masters/`）を指す。
> 旧称「コードリスト（codeList）」から「マスタ（master）」へ統一。TypeScript 型名 `AllCodeLists` は後方互換のため据え置き。

---

## A. フィールドを追加・変更するとき

> 対象: `FIELD_METADATA` や `AfterValues` への追加、フィールドの挙動変更

| # | 領域 | 確認/更新先 | 必須度 |
|---|---|---|---|
| A1 | フィールド定義表 | `specs/G1-fields/01-field-definitions.md` — 行を追加・更新 | 必須 |
| A2 | 入力種別 | `specs/G3-ui/01-row-editor-input-spec.md` — 入力種別・マスタ対応を記載 | 必須 |
| A3 | RowEditorPanel | `CODE_LIST_KEYS`, `FLAG_FIELDS`, `ORG_FIELDS` のいずれかに追加が必要か | 必須 |
| A4 | バリデーション | `specs/G2-domain/02-validation-rules.md` — このフィールドに必要な規則があるか | 必須 |
| A5 | 変更検知 | `src/domain/review/changeDetection.ts` — ChangeKind の判定に影響するか | 要確認 |
| A6 | レビュー表示 | `specs/G3-ui/02-review-display-spec.md` — 特殊な前後比較表示が必要か | 要確認 |
| A7 | AI Tools | `specs/G4-ai/01-tools-spec.md` — AI から読み取り・書き込みが必要か | 要確認 |
| A8 | AI プロンプト | `specs/G4-ai/02-system-prompt-rules.md` — 業務ルールをAIに伝える必要があるか | 要確認 |
| A9 | FieldBinding | `src/domain/allocationRow.ts` FIELD_METADATA — binding分類が正しいか | 要確認 |

---

## B. バリデーションルールを追加・変更するとき

> 対象: `validateRow.ts` への validator 追加、ValidationIssue の level 変更

| # | 領域 | 確認/更新先 | 必須度 |
|---|---|---|---|
| B1 | バリデーション規則表 | `specs/G2-domain/02-validation-rules.md` — 行を追加・実装状況を ✗→✓ に更新 | 必須 |
| B2 | validateRow.ts | 純粋関数として追加し、`validateRow()` の return 配列に追加 | 必須 |
| B3 | RowEditorPanel | `issuesForField()` 経由で自動表示される → 追加実装不要 | 自動 |
| B4 | ValidationDashboard | `data.rows` から自動集計される → 追加実装不要 | 自動 |
| B5 | AI プロンプト | 重要なバリデーションルールは `specs/G4-ai/02-system-prompt-rules.md` にも記載 | 要確認 |
| B6 | レビュー画面ヘッダー | `data.totalIssues` に自動カウントされる → 追加実装不要 | 自動 |

---

## C. 変更種別（ChangeKind）を追加・変更するとき

> 対象: `changeDetection.ts` の `ChangeKind` 型, `detectChanges()` ロジック

| # | 領域 | 確認/更新先 | 必須度 |
|---|---|---|---|
| C1 | 業務ルール | `specs/G2-domain/01-business-rules.md` — 判定条件を記述 | 必須 |
| C2 | changeDetection.ts | `ChangeKind` 型と `detectChanges()` 実装 | 必須 |
| C3 | ChangeDigest | `src/components/review/components/ChangeDigest.tsx` — カウンター行を追加 | 必須 |
| C4 | AttributeGrid | `src/components/review/components/AttributeGrid.tsx` — フィルタ選択肢を追加 | 必須 |
| C5 | useReviewData | `src/components/review/hooks/useReviewData.ts` — summary カウンターを追加 | 必須 |
| C6 | レビュー表示 | `specs/G3-ui/02-review-display-spec.md` — バッジ色・ラベルを記載 | 必須 |
| C7 | AI Tools | `getChangedPersons` の `kinds` フィルタに新 ChangeKind を追加 | 要確認 |
| C8 | AI プロンプト | `specs/G4-ai/02-system-prompt-rules.md` — 変更種別の判定ルールを記載 | 要確認 |

---

## D. AI Tool を追加・変更するとき

> 対象: `src/application/aiTools.ts` への tool 追加

| # | 領域 | 確認/更新先 | 必須度 |
|---|---|---|---|
| D1 | Tools 仕様 | `specs/G4-ai/01-tools-spec.md` — tool 設計を追加 | 必須 |
| D2 | aiTools.ts | tool 実装（`HRApplicationService` の既存メソッドに委譲） | 必須 |
| D3 | AI プロンプト | `specs/G4-ai/02-system-prompt-rules.md` — tool の使い所をルールで記述 | 必須 |
| D4 | 書き込みツール | `EditCommand` 経由か確認（直接 allocationList を変更しない） | 必須 |
| D5 | Undo 対象確認 | `executeOperation()` 経由なら自動で Undo 対象になる | 自動 |

---

## E. ドメインオペレーションを追加・変更するとき

> 対象: `src/domain/operation/handlers/` への Operation クラス追加

| # | 領域 | 確認/更新先 | 必須度 |
|---|---|---|---|
| E1 | 自動補完 | `departmentCode` を変更する場合は `deriveOrgSubFields()` で org sub-fields を更新する | 必須 |
| E2 | 自動補完 | `managerPositionCode` を設定する場合は `deriveManagerName()` で `managerName` を更新する | 必須 |
| E3 | FieldBinding | `afterKeysByBinding('allocation')` で清される `managerName` を意図的に設定する場合は allocClears の後に配置する | 必須 |
| E4 | Undo 対象 | `executeOperation()` 経由なら自動で Undo 対象 | 自動 |
| E5 | AI Tools | AI から呼べるようにする場合は `aiTools.ts` と `toolRegistry.ts` に追加 | 要確認 |

---

## F. 担当者ワークフロー・フィルタ関連を変更するとき

> 対象: `assignee` フィールド, `AssigneeSelectStep`, `useScopedStore`（担当者ベース）, 分割エクスポート

| # | 領域 | 確認/更新先 | 必須度 |
|---|---|---|---|
| F1 | フィールド定義 | `specs/G1-fields/01-field-definitions.md` の `assignee` 行を更新 | 必須 |
| F2 | 担当者フィルタ | `useScopedStore.ts` のフィルタロジック（assignee ベース）に影響するか | 必須 |
| F3 | Excel 読み取り | A列の読み取りロジック（`excelImport.ts` 相当）に影響するか | 必須 |
| F4 | Excel エクスポート | A列への assignee 出力に影響するか | 必須 |
| F5 | 変更検知 | `sameOrgPairs` の計算は組織マッピングに依存するため影響するか確認 | 要確認 |
| F6 | ワーニング表示 | 他担当者行・未割当行のワーニング UI に影響するか | 要確認 |
| F7 | 分割エクスポート | 担当者ごとの分割エクスポートロジックに影響するか | 要確認 |
| F8 | 上司名補完 | `managerName` → `managerPositionCode` 補完フローに影響するか | 要確認 |
| F9 | 担当者ウィザード | 分割軸選択・自動割り当てロジックに影響するか | 要確認 |

---

## G. スラッシュコマンド・自動化を追加・変更するとき

| # | 領域 | 確認/更新先 | 必須度 |
|---|---|---|---|
| G1 | コマンドファイル | `.claude/commands/xxx.md` を作成・更新 | 必須 |
| G2 | このファイル | 該当するチェックリスト（A〜F）への参照を追加 | 必須 |
| G3 | CLAUDE.md | specs/ 索引に反映が必要か | 要確認 |

---

## 「自動」の意味

「自動」と書いた項目は、既存のアーキテクチャによって追加実装なしに反映されることを意味する。
変更時に「なぜ自動か」が分からなくなった場合は `src/` のコードを確認すること。
