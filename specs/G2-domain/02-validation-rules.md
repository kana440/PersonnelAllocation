# G2-02 バリデーション規則定義

> **目的**: `validateRow()` で実装すべきバリデーション規則を一覧化する。
> 実装後の変更はこのファイルを更新してから `validateRow.ts` に反映する。
>
> **原則（確定）**:
> - ERROR / WARNING があっても Excel 保存・出力はブロックしない
> - バリデーションは `changes?: RowChanges` を受け取り、変更種別と連動できる
> - フィールド単位で `ValidationIssue[]` を返す純粋関数として実装
>
> **凡例**
> - 実装状況: ✓ 実装済み / ✗ 未実装 / ❓ 業務確認待ち
> - レベル: `error` / `warning`

---

## 1. 必須フィールド

| # | フィールド | 条件 | レベル | メッセージ | 実装状況 |
|---|---|---|---|---|---|
| V01 | `userId` | 空 | `warning` | ユーザーIDが未入力です | ✓ |
| V02 | `departmentCode` | 空 | `warning` | 組織コードが未入力です | ✓ |
| V03 | `transferReason` | バンド変更あり かつ 空 | `warning` | バンドが変更されていますが異動事由が未入力です | ✓ |
| V04 | `concurrentReason` | `concurrentType='兼務'` かつ 空 | `warning` | 兼務の場合は兼務理由を入力してください | ✓ |
| V05 | `demotionReason` | `demotion` 検出 かつ 空 | `warning` | 降級が検出されましたが降格理由が未入力です | ✓ (V52と同実装) |

---

## 2. 値の整合性

| # | フィールド | 条件 | レベル | メッセージ | 実装状況 |
|---|---|---|---|---|---|
| V10 | `departmentCode` | orgマスタに存在しない値 | `error` | 組織コード "${code}" はマスタに存在しません | ✓ |
| V11 | `secondmentToCompany` | 設定あり かつ `departmentCode` 空 | `warning` | 出向先会社が設定されていますが出向先組織コードが未入力です | ✓ |
| V12 | `officialPositionCode` | codeListに存在しない値 | `warning` | 役職コードがマスタに存在しません | ✗ |
| V13 | `payGrade` | codeListに存在しない値 | `warning` | 給与等級がマスタに存在しません | ✗ |
| V14 | `location` | codeListに存在しない値 | `warning` | 勤務場所がマスタに存在しません | ✗ |
| V15 | `employmentType` | codeListに存在しない値 | `warning` | 雇用タイプがマスタに存在しません | ✗ |
| V16 | `jobType` | 選択した `jobFamily` の子に含まれない | `warning` | ジョブタイプが選択したジョブファミリーと一致しません | ✗ |
| V17 | `concurrentType` | codeListに存在しない値 | `warning` | 本務兼務区分がマスタに存在しません | ✗ |

---

## 3. ポジション・昇降格ルール

| # | フィールド | 条件 | レベル | メッセージ | 実装状況 |
|---|---|---|---|---|---|
| V20 | `positionCode` | (promotion or demotion) かつ !transfer かつ positionCode 未変更 | `error` | 昇級・降級が検出されましたが、ポジションコードが変更されていません（新ポジションへの登録が必要です） | ✓ |
| V21 | `positionBand` | `band` と `positionBand` が異なる | `warning` | 人バンドとポジションバンドが一致していません | ❓ 業務確認（乖離許容か） |
| V22 | `band` | 昇降格なし かつ `band` 変更あり | `warning` | バンドが変更されていますが昇降格サインが未入力です | ❓ |

---

## 4. 兼務ルール

| # | フィールド | 条件 | レベル | メッセージ | 実装状況 |
|---|---|---|---|---|---|
| V30 | `concurrentReason` | `concurrentType != '兼務'` かつ `concurrentReason` 設定あり | `warning` | 兼務区分が「兼務」でないのに兼務理由が設定されています | ✗ |

---

## 5. 出向ルール

| # | フィールド | 条件 | レベル | メッセージ | 実装状況 |
|---|---|---|---|---|---|
| V40 | `secondmentFromCompany` | 設定あり かつ `secondmentFromEmployeeNumber` 空 | `warning` | 出向元会社社員番号が未入力です | ✗ |
| V41 | `secondmentFromEmployeeNumber` | 設定あり かつ `secondmentFromCompany` 空 | `warning` | 出向元会社が未入力です | ✗ |

---

## 6. 変更検知と連動するルール

> `changes?: RowChanges` が渡された場合のみ評価する。

| # | フィールド | 条件 | レベル | メッセージ | 実装状況 |
|---|---|---|---|---|---|
| V50 | `transferReason` | `transfer` かつ `transferReason` 空 | `warning` | 異動が検出されましたが異動事由が未入力です | ✓ |
| V51 | `promotionSign` | `promotion` かつ `promotionSign` 空 | `warning` | 昇級が検出されましたが昇降格サインが未入力です | ❓ |
| V52 | `demotionReason` | `demotion` かつ `demotionReason` 空 | `warning` | 降級が検出されましたが降格理由が未入力です | ✓ (V05と同実装) |
| V53 | `payGradeChangeSign` | `payGrade` 変更 かつ `payGradeChangeSign` 空 | `warning` | 給与等級変更が検出されましたが変更サインが未入力です | ❓ |

---

## 7. 実装優先順位（提案）

| 優先度 | ルール群 | 理由 |
|---|---|---|
| 🔴 高 | V04, V05, V50, V52 | 入力漏れが最も多いフィールドへの誘導 |
| 🔴 高 | V12, V13, V14, V15 | codeList整合性チェック（ワイヤーのみ） |
| 🟡 中 | V16 | jobFamily/jobType連動 |
| 🟡 中 | V30, V40, V41 | 兼務・出向の整合性 |
| 🟢 低 | V21, V22, V51, V53 | 業務確認後に実装 |

---

## 実装手順メモ

```typescript
// validateRow.ts への追加パターン（例: V04）
function validateConcurrentReason(row: AllocationRow): ValidationIssue[] {
  if (row.concurrentType === '兼務' && !row.concurrentReason) {
    return [{
      field: 'concurrentReason',
      level: 'warning',
      message: '兼務の場合は兼務理由を入力してください',
    }]
  }
  return []
}

// validateRow() 内の return 配列に追加するだけ
```

> Claude Code でこのspecを読んで実装する場合は:
> 1. `// TODO: V04` 等のコメントで参照番号を記録する
> 2. 実装後はこのファイルの実装状況を ✗ → ✓ に更新する
