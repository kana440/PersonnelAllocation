# G6-02 連絡票ワークフロー仕様

> **ステータス**: STEP1 実装済み（2026-07）  
> コード上の識別子: `Contact`（`ContactRecord` / `ContactStatus` / `contactStore`）  
> 実装詳細: [`docs/19-contact-workflow.md`](../../docs/19-contact-workflow.md)  
> 関連: [`G6-01 担当者ワークフロー`](01-assignee-workflow.md)

---

## 概要

要員配置作業中に発生する「担当者間での情報確認」を構造化するワークフロー。  
「田中太郎の社員IDが不明」「出向元のポジションコードを確認したい」といった依頼を  
**連絡票**（ContactRecord）として管理し、Excel ファイル（Box 等の共有ドライブ）を  
経由してスレッド型で情報交換する。

---

## STEP1 と STEP2 の設計対比

| 観点 | STEP1（実装済み） | STEP2（未実装） |
|---|---|---|
| 連絡票の保存先 | Box 等の共有ドライブ上の .xlsx（File System Access API で読み書き） | PostgreSQL |
| 読み込み | 起動時自動 / 手動同期 | API GET |
| 書き込み | File System Access API（readwrite）で直接 .xlsx に書き込む | API POST / PUT |
| 識別子 | メールアドレス（設定画面で手動入力） | SSO（自動） |
| ルーティング | 手動（Teams / メール等で連絡票番号を共有） | サーバーが targetOrgId → ユーザーを解決して通知 |
| 楽観ロック | 返信前に Excel を再読みして thread.length を比較、競合時は警告 | サーバーが version フィールドで管理 |
| ローカルキャッシュ | OPFS（LocalContactStore） | 不要（API がソース） |
| 認証 | なし（myEmail を手動設定） | SSO セッション |

---

## アーキテクチャ：ポート分離

STEP1 → STEP2 の移行は**インフラ実装の差し替えのみ**。Application 層・Port 層は共通。

```
UI 層          ContactPanel / ContactForm / ThreadView / SentList / ReceivedList
               ↕
Store 層       contactStore（Zustand）
               ↕
Application 層 ContactService
               ↕ IdentityPort  ← 「自分は誰か」
               ↕ ContactSourcePort  ← 「Excel を読み書きする」（STEP1 のみ）
               ↕ ContactStorePort   ← 「連絡票をローカル保持する」
               ↕
Infrastructure 層
  STEP1:
    LocalIdentityStore   ← localStorage（手動入力メール・表示名）
    FileContactSource    ← File System Access API で .xlsx を読み書き（readwrite）
    NullContactSource    ← 機能無効状態
    LocalContactStore    ← OPFS（セッション内キャッシュ）
    ContactTsvSerializer ← ContactRecord ↔ TSV 純粋関数（fromTsv / toHeaderTsv 等）
  STEP2:
    ServerIdentityStore  ← SSO セッション（JWT）
    RemoteContactStore   ← API 呼び出し（read / write 両方）
    ※ ContactSource は不要（サーバーが master）
```

---

## データモデル（実装済み）

### ContactRecord

```typescript
export interface ContactRecord {
  id: string              // 'CON-XXXXXXXX' 形式
  status: ContactStatus   // draft | sent | answered | applied
  createdAt: string       // ISO 8601

  // 依頼者
  requesterEmail: string
  requesterName?: string

  // 宛先（組織ベース）
  targetOrgId: string     // org.externalCode
  targetOrgName: string
  assigneeHint?: string

  // 照会対象
  anchorRowId: number     // セッション内 rowId（Excel 往復後は -1）
  personName: string      // 対象者名（マッチング・表示用）
  fieldKey: string        // AllocationRow のフィールドキー
  requestType: RequestType

  // 起票時フィルタヒント（受信者が関連性を判断するため）
  beforeOrgCodeHint?: string   // Before組織の externalCode

  // 回答者が確定した行の識別子（回答時にセット）
  anchor?: ContactAnchor

  // チャットスレッド
  thread: ContactMessage[]     // 時系列。thread[0] が依頼本文

  resolvedValue?: string       // 依頼者が選択した適用値
  archived: boolean
}

// 回答者が「この行について回答した」と確定した識別子
export type ContactAnchor =
  | { kind: 'person';   groupEmployeeId: string; userId: string;  fieldValueAtAnchor?: string }
  | { kind: 'position'; positionCode: string;                     fieldValueAtAnchor?: string }
// fieldValueAtAnchor: アンカー設定時点の fieldKey の値（変更検知に使う）
```

---

## Excel フォーマット（TSV・16列）

| # | 列名 | 内容 |
|---|---|---|
| 1 | 連絡票番号 | `id` |
| 2 | ステータス | 下書き / 依頼中 / 回答済 / 適用済 |
| 3 | 作成日 | `createdAt` |
| 4 | 依頼者メール | `requesterEmail` |
| 5 | 依頼者名 | `requesterName` |
| 6 | 宛先組織コード | `targetOrgId` |
| 7 | 宛先組織名 | `targetOrgName` |
| 8 | 担当者ヒント | `assigneeHint` |
| 9 | 対象者名 | `personName` |
| 10 | 依頼概要 | `thread[0].summary` |
| 11 | 最新回答概要 | 最新 answer の `summary` |
| 12 | スレッドData | `thread` JSON（初期非表示列）|
| 13 | 適用値 | `resolvedValue` |
| 14 | 更新日 | 最終メッセージの日付 |
| 15 | Before組織コード | `beforeOrgCodeHint` |
| 16 | アンカーData | `anchor` JSON（初期非表示列）|

旧形式（14列）は `fromTsv` が後方互換で読む（15・16列が欠損 → `undefined` 扱い）。

---

## アンカー / フィルタシステム

### フィルタ（起票時・依頼者が設定）

- `personName`：対象者の氏名（キャンバスのドラッグ&ドロップで自動入力可）
- `beforeOrgCodeHint`：対象者の現在の組織（Before org の externalCode）

受信者は自分の `allocationList` とこの2フィールドを照合して**関連あり**を判定する。

### アンカー（回答時・回答者が設定）

- ThreadView の「行を指定」ボタンで `allocationList` から候補行を選択
- 選択時に `groupEmployeeId + userId`（または `positionCode`）と `fieldValueAtAnchor` を記録
- 以降、アンカー行の `fieldKey` が変更されると ThreadView に警告を表示

### 受信リスト（ReceivedList）の表示条件

```
表示する = !archived && (status === 'sent' || status === 'answered')
  && (
    requesterEmail !== myEmail            // 他者の起票は常に表示
    || isRelevant(ticket, allocationList) // 自分の起票は関連ありの場合のみ
  )
```

**isRelevant の判定ロジック**（`ReceivedList.tsx` の `isRelevant()`）:
1. `personName`（スペース除去）が自分の `allocationList` の `lastName + firstName` と完全一致する行があるか
2. `beforeOrgCodeHint` の組織（+ その配下の全組織）の `externalCode` が、自分の `allocationList` のいずれかの行の `prevDepartmentCode` と一致するか

---

## 実装済みコンポーネント一覧

```
apps/web/src/
  ports/
    contactTypes.ts         ← ContactRecord / ContactAnchor / ContactMessage 型定義
    ContactSourcePort.ts    ← read/write インターフェース
    ContactStorePort.ts     ← OPFS インターフェース
    IdentityPort.ts         ← 自己識別インターフェース

  application/
    ContactService.ts       ← create / submitMessage / setAnchor / syncFromSource 等

  infrastructure/contact/
    LocalIdentityStore.ts   ← localStorage
    FileContactSource.ts    ← File System Access API による .xlsx 読み書き
    NullContactSource.ts    ← 機能無効状態
    LocalContactStore.ts    ← OPFS キャッシュ
    ContactTsvSerializer.ts ← TSV ↔ ContactRecord 純粋関数（16列）
    createTemplateXlsx.ts   ← テンプレート .xlsx 生成・ダウンロード
    fileHandleDb.ts         ← FileSystemFileHandle を IndexedDB に保存
    index.ts                ← DI（fileSource シングルトン・createContactService）

  store/
    contactStore.ts         ← Zustand（contacts / load / create / submitMessage / setAnchor 等）

  components/contact/
    ContactPanel/
      index.tsx             ← パネルシェル（スライド式 fixed パネル・タブ切替）
      SentList.tsx          ← 送信済みリスト
      ReceivedList.tsx      ← 受信リスト（isRelevant マッチング・関連あり優先表示）
      ContactForm.tsx       ← 起票フォーム（Before組織ピッカー・D&D受け付け）
      ThreadView.tsx        ← スレッド表示・回答入力・アンカー設定
    ContactSettingsModal.tsx ← 設定（myEmail / myDisplayName / ファイル指定）
```

---

## 未実装・未決事項

- ❓ 引用回答フロー（回答モード中のキャンバスカードへの引用ボタン）
- ❓ STEP2 への移行（RemoteContactStore / ServerIdentityStore）
- ❓ ReceivedList の isRelevant が空 allocationList / 空 beforeOrganizations の場合に動作しない問題（デバッグ中）
- ❓ STEP2 での連絡票の Round スコープ（Round に紐づくか、ユーザー間でフラットか）
