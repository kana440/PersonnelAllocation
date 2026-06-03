# 11 ポジションコード割当設計

## 概要

新規ポジション作成時に内部採番される `_pos_XXX` コードを、正式な外部ポジションコード（`P + 8桁数字`、例: `P12345678`）に割り当てる機能。

**業務背景**: ポジションコードはスプレッドシート上の番号表で管理されており、利用時に番号を取得して割り当てる運用になっている。将来的には DB/API からの取得に移行する可能性がある。

---

## 設計思想

### Port パターン

`IPositionCodePort`（`src/ports/index.ts`）を経由して番号取得元を抽象化。

```
UI / AI
  ↓
AssignPositionCodesOperation   ← EditCommand
  ↓
HRApplicationService.assignPositionCodes()
  ↓
(Port 実装) ClipboardPositionCodeAdapter  ← 現在の実装（クリップボード経由）
             FutureApiAdapter             ← 将来実装（DB/API経由）
```

現時点の `IPositionCodePort` が担うのは **フォーマット/パース** のみ。  
データベースへの書き込み（`markUsed`）や自動取得（`fetchAvailable`）は省略可能なオプションメソッドとして予約済み。

### クリップボードワークフロー

```
[1] ツール / ダイアログで一覧をコピー
        ↓ TSV（rowId | 内部コード | 職種 | 組織コード | 組織名 | [空欄]）
[2] スプレッドシートへ貼り付け
        ↓ 番号表から P コードを「新ポジションコード」列に記入
[3] スプレッドシートをコピーして貼り戻す
        ↓ ClipboardPositionCodeAdapter.parseImport() がパース
[4] プレビュー → 確定
        ↓ AssignPositionCodesOperation が実行
[5] positionCode + managerPositionCode (cascade) が更新される
```

### Excel 出力との関係

- `_pos_` プレフィックスのコードは Excel 出力時に **空欄** として出力される
- 外部コード（`P\d{8}`）が割り当てられた後は正式コードとして出力される

---

## 実装ファイル一覧

| ファイル | 役割 |
|---|---|
| `src/ports/index.ts` | `IPositionCodePort`, `UnassignedPosition`, `PositionCodeAssignment` 型定義 |
| `src/infrastructure/positionCode/ClipboardAdapter.ts` | クリップボード用 TSV フォーマット/パース |
| `src/domain/commands/handlers/assignPositionCodes.ts` | `AssignPositionCodesOperation` — validate + apply（cascade含む） |
| `src/application/HRApplicationService.ts` | `getUnassignedPositions()` / `assignPositionCodes()` |
| `src/store/useStore.ts` | 上記を UI に公開 |
| `src/components/positionCodeAssignment/index.tsx` | UI ダイアログ（3ステップ: Export → Import → Done） |
| `src/components/positionCodeAssignment/helpers.ts` | `buildExportText` / `parseImportText` |
| `src/application/aiTools.ts` | `getUnassignedPositions()` |
| `src/infrastructure/ai/toolRegistry.ts` | `getUnassignedPositions`（read）/ `propose_assign_position_codes`（confirm）|

---

## cascade ルール（重要）

`_pos_XXX` → `P12345678` へのコード変更時に、同じコードを `managerPositionCode` として参照している **すべての行** を連動更新する。

```
ポジション A (_pos_42)
  ↑ managerPositionCode 参照
ポジション B (_pos_42 を上司に設定)
ポジション C (_pos_42 を上司に設定)

→ A に P12345678 を割り当てると
   B.managerPositionCode = P12345678
   C.managerPositionCode = P12345678
```

`AssignPositionCodesOperation.apply()` が `codeMap`（旧コード→新コード）を組み立て、全行を1パスでスキャンして更新する。

---

## AI ツール連携

```
ユーザー: 「内部採番コードを確認して」
→ getUnassignedPositions()

ユーザー: 「P12345678 をポジション rowId=42 に割り当てて」
→ propose_assign_position_codes({ assignments: [{ rowId: 42, newPositionCode: 'P12345678' }] })
→ diff-preview で確認 → ユーザーが承認 → AssignPositionCodesOperation 実行
```

---

## 将来拡張

| 拡張 | 方針 |
|---|---|
| DB/API から番号を自動取得 | `IPositionCodePort.fetchAvailable()` を実装した新アダプターに差し替え |
| 取得時に番号表に使用済フラグ | `IPositionCodePort.markUsed()` を実装（メモ付きで記録可能） |
| UI ダイアログでスプレッドシートを省略 | `fetchAvailable` が実装されたらステップ 1 で自動割当ボタンを追加 |

---

## バリデーション

`AssignPositionCodesOperation.validate()` で以下をチェック：

1. 対象 `rowId` が存在すること
2. 現在のコードが `_pos_` で始まること（外部コードへの上書きは禁止）
3. `newPositionCode` が `P\d{8}` 形式であること
4. 同じコードが他の行に既に使用されていないこと
