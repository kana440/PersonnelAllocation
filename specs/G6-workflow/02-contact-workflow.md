# G6-02 連絡票ワークフロー仕様

> **ステータス**: STEP1 実装済み（2026-07）
> コード上の識別子: `Contact`（`ContactRecord` / `ContactStatus` / `contactStore`）
> **実装詳細は [`docs/19-contact-workflow.md`](../../docs/19-contact-workflow.md) を参照**（TSV列レイアウト・
> `isRelevant()` の実装・アーキテクチャ図・コンポーネント一覧・デバッグポイントはそちらが正）
> 関連: [`G6-01 担当者ワークフロー`](01-assignee-workflow.md)

---

## 概要

要員配置作業中に発生する「担当者間での情報確認」を構造化するワークフロー。
「田中太郎の社員IDが不明」「出向元のポジションコードを確認したい」といった依頼を
**連絡票**（ContactRecord）として管理し、Excel ファイル（Box 等の共有ドライブ）を
経由してスレッド型で情報交換する。

**設計判断**: サーバーを新設せず、既存の Excel 配布フロー（担当者ワークフロー、G6-01 参照）に
乗せる形にした。組織担当は既に Excel を Box 経由でやり取りしているため、連絡票専用の
配布経路を別に用意するコストを避けている。

---

## STEP1 と STEP2 の設計対比

STEP1 → STEP2 は**インフラ実装の差し替えのみ**で移行できるよう Port 層で抽象化する方針。

| 観点 | STEP1（実装済み） | STEP2（未実装） |
|---|---|---|
| 連絡票の保存先 | Box 等の共有ドライブ上の .xlsx（File System Access API で読み書き） | PostgreSQL |
| 読み込み / 書き込み | 起動時自動 / 手動同期・File System Access API（readwrite）で直接書き込み | API GET / POST・PUT |
| 識別子 | メールアドレス（設定画面で手動入力） | SSO（自動） |
| ルーティング | 手動（Teams / メール等で連絡票番号を共有） | サーバーが targetOrgId → ユーザーを解決して通知 |
| 楽観ロック | 返信前に Excel を再読みして thread.length を比較、競合時は警告 | サーバーが version フィールドで管理 |
| ローカルキャッシュ | OPFS（LocalContactStore） | 不要（API がソース） |
| 認証 | なし（myEmail を手動設定） | SSO セッション |

Application 層・Port 層（`ContactService` / `IdentityPort` / `ContactSourcePort` / `ContactStorePort`）は
STEP1・STEP2 共通。STEP2 では `RemoteContactStore` / `ServerIdentityStore` を追加し、`ContactSourcePort`
（Excel 読み書き）はサーバーが master になるため不要になる想定。

---

## データモデルの設計判断

`ContactRecord` は「フィルタ」と「アンカー」という2つの識別子を持つ構造にしている。

| 概念 | 設定者 | タイミング | 用途 |
|---|---|---|---|
| **フィルタ** (`personName` + `beforeOrgCodeHint`) | 依頼者（起票時） | 起票フォーム入力 | 受信者が「自分に関連するか」を判断する（曖昧一致でよい） |
| **アンカー** (`ContactAnchor`) | 回答者 | ThreadView で「行を指定」 | 回答対象行を一意に確定する（`groupEmployeeId+userId` または `positionCode`）。`fieldValueAtAnchor` も記録しフィールド変更検知に使う |

この2段階にした理由: 起票時点では依頼者は受信者側の `allocationList` の rowId を知り得ない
（担当者ごとに Excel ファイルが分かれているため）。氏名・組織コードという緩いヒントで届け、
回答者側が自分の手元データで行を確定する設計にしている。

型定義・TSVシリアライズ形式・`isRelevant()` の実装詳細は `docs/19-contact-workflow.md` を参照。

---

## 未実装・未決事項

- ❓ 引用回答フロー（回答モード中のキャンバスカードへの引用ボタン）
- ❓ STEP2 への移行（`RemoteContactStore` / `ServerIdentityStore` の実装）
- ❓ ReceivedList の `isRelevant` が空 `allocationList` / 空 `beforeOrganizations` の場合に動作しない問題（デバッグ中）
- ❓ STEP2 での連絡票の Round スコープ（Round に紐づくか、ユーザー間でフラットか）
