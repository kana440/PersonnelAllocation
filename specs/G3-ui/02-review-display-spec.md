# G3-02 レビュー画面 変更表示仕様

> **目的**: レビュー画面での変更バッジ・前後比較チップの表示ルールを定義する。
> 実装基盤: `src/components/review/`
>
> **現状**: ChangeDigest（集計）・AttributeGrid（一覧）・ValidationDashboard は実装済み。
> このspecは追加・改善すべき表示仕様を記述する。

---

## 1. 変更バッジ（ChangeKind ラベル）

| ChangeKind | 日本語ラベル | バッジ色 | 実装状況 |
|---|---|---|---|
| `transfer` | 異動 | blue | ✓ |
| `promotion` | 昇級 | green | ✓ |
| `demotion` | 降級 | orange | ✓ |
| `titleChange` | 役職変更 | purple | ✓ |
| `newHire` | 新規採用 | emerald | ✓ |
| `termination` | 退職 | red | ✓ |
| `transfer + promotion` | 異動+昇級 | blue+green | ✓（複数バッジ） |
| `transfer + demotion` | 異動+降級 | blue+orange | ✓（複数バッジ） |

---

## 2. AttributeGrid の前後比較表示

### 2.1 現状
- before/after の値を列で並べて表示
- 差分あり行を強調

### 2.2 改善案（TODO）
- [ ] 変更フィールドを視覚的に強調（背景色or下線）
- [ ] `departmentCode` は orgName を解決して表示
- [ ] `managerPositionCode` → 在席者名を表示

---

## 3. 変更理由の表示（TODO）

❓ **業務確認待ち**: `transferReason`, `demotionReason`, `promotionSign` を
レビュー画面でどのように見せるか。

---

## 4. スコープフィルタ表示

- ✓ `useScopedStore` でスコープ内の行のみ表示済み
- [ ] 現在のスコープ名をレビュー画面ヘッダーに表示

---

## 未確認事項

- [ ] レビュー画面にコメント/承認フローは必要か
- [ ] 印刷・PDF出力の要件
