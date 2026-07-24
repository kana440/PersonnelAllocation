# 開発ガイド

## Excel の列が変わったとき（メンテナンス）

| 変更対象 | 変更ファイル |
|---|---|
| 要員配置リストの列定義 | `packages/domain/src/csvImport/allocationList/labels.ts` の `ALLOCATION_LIST_FIELDS` |
| after / prev* の対応表 | `packages/domain/src/allocationRow.ts` の `BEFORE_AFTER_FIELD_PAIRS` |
| 組織CD一覧の列 | `apps/web/src/infrastructure/excel/shared/orgMasterParser.ts` の `parseOrgMaster` |
| エクスポート列 | `apps/web/src/infrastructure/excel/zip/core.ts` の `EXPORT_FIELDS`（`ALLOCATION_LIST_FIELDS` の re-export） |

---

## 新しい業務操作の追加

`EditCommand` の実装手順・登録順序（`EditPattern` → 検出 → `EditCommand` → バリデーション →
`EditOperation` → `SummaryView.tsx` → `EditScenario`）は root `CLAUDE.md` の
「業務操作の追加方法」に一本化されている。**このドキュメントでは繰り返さない。** 実装するときはまずそちらを読む。

TDD での進め方（テストヘルパー・`OperationScenario` の書き方）は `docs/07-tdd-guide.md` を参照。

---

## バリデーションルールの追加

新しいバリデーションは `packages/domain/src/rules/field.ts`（`FIELD_RULES` / エイリアス `FIELD_CONSTRAINTS`）に宣言を追加するのが基本。
W系（ワーニング）のようにマスタ照合だけで表現できないルールは
`packages/domain/src/rules/row/`（単行スコープ）または `packages/domain/src/rules/interRow/`（行間スコープ）に
`RowRule` / `InterRowRule` として実装する。

設計の詳細（3軸宣言・3フェーズパイプライン・系統一覧）は `docs/18-domain-field-rules.md` を参照。
ルール関数を追加するだけで、Web UI（フォーム）と AI（`propose_*` ツール）の両方で自動的に使われる — 別々に実装しない。

---

## AI Tool の追加

AI が使えるツールを追加する場合は `apps/web/src/application/aiTools/` の該当カテゴリファイル
（`read.ts` / `write.ts` / `review.ts` / `diagnose.ts`）の `*Methods` ファクトリ関数に追加する。
`HRApplicationService` の既存メソッドに委譲し、ロジックを重複して書かない。

### 追加例: 異動候補の提案（`write.ts`）

```typescript
function suggestTransferTargets(userId: string): PersonSearchResult[] {
  const rows = getPersonRows(userId)
  if (rows.length === 0) return []
  const currentBand = rows[0].band
  // 同バンドで空き組織を返す（例）
  return findPersons({}).filter(p => p.orgCode !== rows[0].departmentCode).slice(0, 5)
}

// createWriteMethods() の return に追加
return { ..., suggestTransferTargets }
```

LLM に見せるツール定義（名前・パラメータ schema・`kind`）は別レイヤーの
`apps/web/src/infrastructure/ai/toolRegistry/` に追加する。ツール種別（read/render/navigate/execute/confirm）の
判断基準は root `CLAUDE.md` の「AI ツール」セクションを参照。

---

## パターン検出（AI が操作パターンを判定する仕組み）

「この人は出向パターンっぽい」といった変更種別の自動判定は
`packages/domain/src/patterns/defs/`（`jobClassification` / `position` / `person` / `secondment` / `legacy` ごとに分割）の
`detect()` 純粋関数として実装されており、`editPatternMatcher.ts` が集約する。

新しいパターンを追加する手順は root `CLAUDE.md`「業務操作の追加方法」の Step 1・2（`EditPattern` 追加 →
`detect()` 実装）を参照。ここでは繰り返さない。

---

## よくある質問

### Q: 新しい操作は Registry に登録が必要？

不要。`EditCommand` を実装したクラスをインスタンス化して
`executeOperation(op)` または `executeScenario({ label, commands })` に渡すだけ。

### Q: 複数人にまたがる操作（玉突き等）はどうする？

`executeScenario` を使う。複数の `EditCommand` を1つの `EditScenario` にまとめると、
順次 validate/apply され、1つの StatePatch として UndoStack に積まれる。

### Q: Undo はどう動く？

`executeScenario()` が全 Command を適用し差分 StatePatch を UndoStack に積む。
`undo()` は `undoStack.undo()` → `applyPatch(direction: 'undo')` で巻き戻す。
ハンドラー側で特別な実装は不要。

### Q: AI と Web UI でバリデーションが違う動きをしないか？

同じ `executeOperation()` を通るので同一。`validate()` は同じコードが呼ばれる。

### Q: エラーが出たとき状態はどうなる？

`validate()` が失敗した場合、`checkpoint()` も `apply()` も呼ばれない。状態は変化しない。

### Q: テストで Zustand や React が必要？

ドメイン層（`packages/domain/src/`）と AI Tools（`aiTools/`）のテストは Zustand も React も不要。Node.js で純粋に動く。
