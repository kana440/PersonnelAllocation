# 連絡票ワークフロー 実装リファレンス

> 仕様書: [`specs/G6-workflow/02-contact-workflow.md`](../specs/G6-workflow/02-contact-workflow.md)  
> 実装状況: STEP1 完成（2026-07）

---

## 概要

要員配置作業中に担当者間で情報確認が必要な場面（「田中太郎の社員IDを教えてほしい」等）を
**連絡票**（ContactRecord）として管理するワークフロー。

Box 等の共有ドライブ上の `.xlsx` ファイルを中継点として読み書きし、スレッド型で情報交換する。
サーバーなし・ブラウザのみで動作する（File System Access API）。

---

## アーキテクチャ全体像

```
┌─────────────────────────────────────────────────────────────────┐
│ UI 層（ContactPanel）                                            │
│   ContactForm ─ 起票フォーム・D&D受け付け                        │
│   SentList    ─ 自分の送信済み                                   │
│   ReceivedList ─ 関連チケット一覧（isRelevant マッチング）        │
│   ThreadView  ─ スレッド・回答入力・アンカー設定                  │
│   ContactSettingsModal ─ メール・ファイル・テンプレート設定        │
└──────────────────┬──────────────────────────────────────────────┘
                   │ Zustand（contactStore）
┌──────────────────▼──────────────────────────────────────────────┐
│ Application 層（ContactService）                                  │
│   create / submitMessage / setAnchor                             │
│   markSent / archive / syncFromSource                            │
└──────┬────────────────────────────────────┬───────────────────── ┘
       │ ContactSourcePort                  │ ContactStorePort
┌──────▼──────────┐                ┌────────▼───────────┐
│ FileContactSource│                │ LocalContactStore   │
│ （XLSX 読み書き） │                │ （OPFS キャッシュ） │
└──────────────────┘                └────────────────────┘
```

---

## ContactService の主要メソッド

| メソッド | 説明 |
|---|---|
| `create(params)` | 起票・OPFS に保存。書き込み可能なら Excel にも追記 |
| `submitMessage(id, msg)` | 返信前に Excel を再読みして競合チェック（楽観ロック）。競合なければ OPFS + Excel に書き込む |
| `setAnchor(id, anchor)` | 回答者がアンカー行を確定。OPFS + Excel に書き込む |
| `markSent(id)` | ステータスを `sent` に変更 |
| `archive(id)` | アーカイブ（ローカルのみ。Excel は変更しない） |
| `syncFromSource()` | Excel を全件読み込み、OPFS と差分マージ |

---

## FileContactSource：File System Access API 読み書き

```
設定画面:
  showOpenFilePicker({ mode: 'readwrite' })
  → handle を IndexedDB（fileHandleDb.ts）に永続化
  → fileSource.setHandle(handle)

起動時:
  loadContactFileHandle() で handle を復元
  → permissionGranted は false のまま（ユーザー操作待ち）
  → ボタンクリック時に requestPermission() → readwrite 権限を要求

読み込み（readAll / readOne）:
  handle.getFile() → arrayBuffer → ExcelJS.load() → ws.eachRow → fromTsv()

書き込み（writeRecord）:
  ExcelJS.load() → 同一 id の行を上書き / なければ末尾に追加
  → xlsx.writeBuffer() → handle.createWritable() → write() → close()
```

### 楽観ロック

`submitMessage` の中で、返信前に `source.readOne(id)` を呼び Excel の最新スレッドを取得。
`sourceRecord.thread.length > localRecord.thread.length` なら競合とみなし、
ローカルを更新した上で `{ status: 'conflict', refreshed }` を返す。
ThreadView はこれを受けて amber バナーを表示し、送信ボタンを「再送信」に切り替える。

---

## TSV 形式（ContactTsvSerializer）

```
連絡票番号 | ステータス | 作成日 | 依頼者メール | 依頼者名
宛先組織コード | 宛先組織名 | 担当者ヒント | 対象者名
依頼概要 | 最新回答概要 | スレッドData（JSON・非表示）| 適用値 | 更新日
Before組織コード | アンカーData（JSON・非表示）
```

- 全 **16列**（旧フォーマット 14列も後方互換で読める）
- 列 12（スレッドData）・16（アンカーData）は Excel テンプレートで初期非表示
- `fromTsv` は `parts.length < 14` なら null を返す（最低 14列必須）

---

## ContactPanel の配置

ContactPanel は `apps/web/src/App.tsx` の `EditViewCore` の外側（末尾）に配置される
フローティングパネル（右端からスライド）。

```
App.tsx:
  <EditViewCore .../>
  <ContactPanel />               ← fixed パネル（transform でスライド）
  {settingsOpen && createPortal(<ContactSettingsModal/>, document.body)}
```

**CSS transform の注意点**: ContactPanel は `translate-x-*` を持つため、
この内部から `position: fixed` の子要素を出す場合は必ず `createPortal(…, document.body)` を使う。
OrgPickerModal・ContactSettingsModal はすべてポータル経由でレンダーする。

---

## アンカー / フィルタシステム

### 2つの概念

| 概念 | 設定者 | タイミング | 用途 |
|---|---|---|---|
| **フィルタ** (`personName` + `beforeOrgCodeHint`) | 依頼者（起票時） | 起票フォーム入力 | 受信者が「自分に関連するか」を判断 |
| **アンカー** (`ContactAnchor`) | 回答者 | ThreadView で「行を指定」 | 回答対象行の確定。フィールド変更検知 |

### フィルタの自動入力（D&D）

キャンバスの人物カードを起票フォームにドラッグ&ドロップすると:
- `dragType === 'person'` の `application/json` を受け取る
- `rowId` で `allocationList` を引く
- `personName` ← `lastName + firstName`
- 宛先組織（変更後） ← `departmentCode` → `afterOrganizations` で名称解決
- Before組織ヒント ← `prevDepartmentCode` → `beforeOrganizations` で名称解決

### アンカーの変更検知

ThreadView の `AnchorSection` が毎レンダー時に:
1. `anchor` の `groupEmployeeId + userId`（または `positionCode`）で `allocationList` から行を探す
2. 現在の `row[fieldKey]` と `anchor.fieldValueAtAnchor` を比較
3. 値が変わっていれば "⚠ 紐付け先のフィールド値が変更されています" バナーを表示

### isRelevant（ReceivedList のフィルタ判定）

```typescript
function isRelevant(ticket, allocationList, beforeOrganizations) {
  // 1. 氏名マッチ（スペース除去して完全一致）
  const targetName = ticket.personName.replace(/\s+/g, '')
  if (allocationList.some(r => [r.lastName, r.firstName].join('') === targetName)) return true

  // 2. Before組織サブツリーマッチ
  if (ticket.beforeOrgCodeHint) {
    const rootOrg = beforeOrganizations.find(o => o.externalCode === ticket.beforeOrgCodeHint)
    if (rootOrg) {
      const descendantIds = getDescendantOrgIds(rootOrg.id, beforeOrganizations)
      descendantIds.add(rootOrg.id)
      const descendantCodes = new Set(
        beforeOrganizations.filter(o => descendantIds.has(o.id)).map(o => o.externalCode)
      )
      if (allocationList.some(r => descendantCodes.has(r.prevDepartmentCode))) return true
    }
  }

  return false
}
```

**⚠ 注意**: `allocationList` や `beforeOrganizations` が空の場合、両条件とも false になる。
Excel 未読み込みの状態では isRelevant は常に false を返す。

### ReceivedList の表示条件

- 他者の起票 → 常に表示（status: sent または answered）
- 自分の起票 → `isRelevant()` が true の場合のみ表示
- 表示順: 関連あり（紫バッジ）→ 回答待ち → 回答済み → 日付降順

---

## 設定・初期化フロー

```
初回:
  1. ContactSettingsModal でメールアドレス・表示名を入力 → settingsStore に保存
  2. "連絡票テンプレートをダウンロード" でヘッダー行だけの .xlsx を生成
  3. .xlsx を Box 等の共有ドライブに置く
  4. "ファイルを選択" → showOpenFilePicker({ mode: 'readwrite' })
     → handle を IndexedDB に永続化、fileSource に設定
  5. "ファイルを読み込んで閉じる" → load() → OPFS にキャッシュ

2回目以降:
  1. App.tsx 起動時に initContactSource() → IndexedDB から handle を復元
  2. hasContactFileHandle = true → 連絡票ボタンがアクティブに
  3. パネルを開いた際に requestPermission() でユーザーへ権限確認
```

---

## 連絡票の状態遷移

```
draft ──[markSent]──→ sent ──[submitMessage(answer)]──→ answered ──[resolve]──→ applied
  ↑                     ↑                                    ↑
起票後・未送信          Excel に起票行を書いた後              回答受領

archived: ローカルのみのフラグ（Excel には反映しない）
```

---

## Zustand ストア（contactStore）購読の注意

ContactPanel の内部コンポーネントは `useShallow` を使って必要フィールドのみ購読する。

```typescript
// ✅ OK
const { contacts, select } = useContactStore(useShallow(s => ({ contacts: s.contacts, select: s.select })))
const myEmail = useSettingsStore(s => s.myEmail)  // プリミティブ → useShallow 不要

// ❌ NG（新オブジェクトを毎回返す → 無限再レンダー）
const { myEmail } = useSettingsStore(s => ({ myEmail: s.myEmail }))
```

---

## 既知の問題・デバッグポイント

| 症状 | 疑うべき原因 |
|---|---|
| 受信リストに出てこない | allocationList / beforeOrganizations が空（Excel 未読み込み） |
| 受信リストに出てこない | personName のスペース形式が allocationList と不一致 |
| 受信リストに出てこない | beforeOrgCodeHint が起票時に設定されていない |
| OrgPickerModal が表示されない | createPortal を document.body に向けているか確認 |
| 最大更新深度エラー | useSettingsStore のセレクタがオブジェクトを返していないか確認 |
| Excel に書き込まれない | fileSource.isWritable() が false（権限未取得）→ requestPermission() を呼ぶ |
