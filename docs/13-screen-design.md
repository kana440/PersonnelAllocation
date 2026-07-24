# 13 — STEP2 画面設計・遷移定義

> **ステータス**: ドラフト（2026-06）  
> **用途**: Phase B 以降の実装前確認・チーム合意用。❓ 印の項目は業務確認待ち。  
> STEP2 要件は `docs/12-step2-requirements.md` 参照。

---

## 1. 画面一覧

### 1-1. STEP2 画面（ロール別アクセス）

| 画面 ID | 画面名 | admin | coordinator | member | 実装状態 |
|---|---|---|---|---|---|
| S-01 | ログイン（LoginView） | ✓ | ✓ | ✓ | ✓ 完了 |
| S-02 | 依頼一覧（PortalView） | ✓ | ✓ | ✓ | △ 編集ボタン実装済み |
| S-03 | Submission 編集（SubmissionEditView） | ✓ | ✓ | ✓ | △ 基本動作実装済み・snapshot/merge 未 |
| S-04 | 配下変更差分ビュー（DiffReviewView） | ✓ | ✓（配下あり） | ✗ | ✓ 完了 |
| S-05 | コンフリクト解消（ConflictResolveView） | ✓ | ✓（共通上位） | ✗ | ✓ 完了（マージ後パネル表示） |
| S-06 | 通知一覧（NotificationView） | ✓ | ✓ | ✓ | ✗ 未実装 |
| S-07 | 管理ダッシュボード（AdminView） | ✓ | ✗ | ✗ | ✓ 完了 |
| S-08 | Round 一覧（AdminView > RoundTab） | ✓ | ✗ | ✗ | ✓ 完了 |
| S-09 | Round 詳細・委任ツリー（RoundDetailView） | ✓ | ✗ | ✗ | ✓ 完了（マージ/差し戻し/途中取り込みボタン含む） |
| S-10 | Round 作成（RoundCreateModal） | ✓ | ✗ | ✗ | ✓ 完了 |
| S-11 | 委任追加（DelegationModal） | ✓ | ✓（❓） | ✗ | △ 管理者のみ |
| S-12 | ユーザー管理（AdminView > UserTab） | ✓ | ✗ | ✗ | ✓ 完了 |
| S-13 | ポジション管理（AdminView > PositionTab） | ✓ | ✗ | ✗ | ✓ 完了 |

---

## 2. ロール別画面遷移図

### 2-1. 管理者（admin）

```
ログイン (S-01)
  └─→ 管理ダッシュボード (S-07)  ← ログイン後の着地点
        ├─→ Round 一覧 (S-08)
        │     ├─→ [+ ラウンドを作成] → Round 作成モーダル (S-10)
        │     │     ├─→ ① Round 基本情報入力
        │     │     └─→ ② Excel アップロード → allocation_rows 初期化 → Round 一覧
        │     └─→ [詳細] → Round 詳細・依頼ツリー (S-09)
        │                    ├─→ [+ 依頼を追加] → 依頼追加モーダル (S-11)
        │                    ├─→ 各ノードの [+ 依頼] → 依頼追加（子依頼）
        │                    └─→ [確定 (closed)] → 確認ダイアログ → Round 一覧
        ├─→ ユーザー管理 (S-12)
        ├─→ ポジション管理 (S-13)
        └─→ ログアウト → ログイン (S-01)
```

将来追加（Phase C〜、未実装）: 通知一覧 (S-06)、コンフリクト解消 (S-05)。

---

### 2-2. 取りまとめ担当（coordinator）

```
ログイン (S-01)
  └─→ 依頼一覧 (S-02)  ← ログイン後の着地点
        ├─→ 自分の Submission: [編集] → Submission 編集 (S-03、自動保存)
        │     └─→ [提出] → 配下が全員マージ済み/取消済みなら提出。残りがあれば 409 →「強制提出しますか？」
        ├─→ 配下（提出済み）: [マージする] → 3-way merge → 配下が「マージ済み」に（コンフリクトは conflict_fields ハイライト + [差し戻す]）
        ├─→ 配下（未着手・編集中）: [現状を確認・反映] → sync（配下の status は変わらず自分のワークスペースに取り込む）
        ├─→ 配下（提出済み）: [差し戻す] → コメント入力 → 依頼一覧（差し戻し済み）
        ├─→ 通知バッジ → 通知一覧 (S-06)  [未実装]
        └─→ ログアウト → ログイン (S-01)
```

---

### 2-3. 担当者（member）

```
ログイン (S-01)
  └─→ 依頼一覧 (S-02)  ← ログイン後の着地点
        │
        ├─→ [状態: 未着手・編集中・差し戻し] → [編集] → Submission 編集 (S-03)  [未実装]
        │     ├─→ （自動保存）
        │     ├─→ [提出] → 提出確認ダイアログ → 依頼一覧（提出済み）
        │     └─→ [← 戻る] → 依頼一覧
        │
        ├─→ 通知バッジ → 通知一覧 (S-06)  [未実装]
        └─→ ログアウト → ログイン (S-01)
```

---

## 3. 権限マトリクス

### 3-1. 画面アクセス

| 操作 | admin | coordinator | member |
|---|---|---|---|
| ログイン・ログアウト | ✓ | ✓ | ✓ |
| 依頼一覧を見る（自分の Submission） | ✓ | ✓ | ✓ |
| Submission を編集する | ✓ | ✓ | ✓ |
| Submission を提出する | ✓ | ✓ | ✓ |
| トップレベル依頼（Round → Submission 新規作成） | ✓ | ✗ | ✗ |
| 子依頼（Submission → 子 Submission 作成） | ✓ | ✓（coordinator 宛のみ） | ✗ |
| 配下 Submission のマージ確認 | ✓ | ✓（直接の委任先のみ） | ✗ |
| 配下 Submission を差し戻す | ✓ | ✓（直接の委任先のみ） | ✗ |
| 管理ダッシュボードを見る | ✓ | ✗ | ✗ |
| Round を作成する | ✓ | ✗ | ✗ |
| Round を確定する（closed） | ✓ | ✗ | ✗ |
| コンフリクトを解消する | ✓（最上位同士のみ） | ✓（共通上位の場合） | ✗ |
| 全 Submission を閲覧する | ✓ | ✗（自分の配下のみ） | ✗（自分のみ） |
| ユーザー管理 | ✓ | ✗ | ✗ |
| ポジション管理 | ✓ | ✗ | ✗ |

### 3-2. データアクセス

| データ | admin | coordinator | member |
|---|---|---|---|
| 自分のスコープの行（読み・書き） | ✓ | ✓ | ✓ |
| 自分のスコープ外の行 | ✓（全行） | ✗ | ✗ |
| 配下 Submission の行（読み取り） | ✓ | ✓ | ✗ |
| 出向・兼務相手方の限定情報 | ✓ | ✓ | ✓ |
| 相手方の Submission 全体 | ✗ | ✗ | ✗ |

---

## 4. Submission ステータス遷移

```
           [依頼作成]
               ↓
           pending
               │
          [編集開始・自動]
               ↓
          in_progress ◄───────────────────────────────────┐
               │ \                                         │
          [提出]  \[強制提出で巻き込まれた場合]       [再提出]
            ↙   ↘   ↘                                     │
  [整合エラー] [OK] cancelled                              │
  （ブロック）   ↓                                         │
            submitted ──────────────────────────────────→ │
               │ \      [親が差し戻し → revision_requested]│
     [親がマージ] \                                        │
               ↓  ↘[コンフリクト → conflict_fields 記録]  │
            merged                                        │
```

**ステータス一覧・削除したステータス（`accepted`）の説明は `docs/14-delegation-model.md` §3 参照。**

- 提出（`submitted`）はマージ待ち状態。自動マージは行わない（Q-B 改訂）
- 親 coordinator が明示的に「マージする」を押したとき初めて 3-way merge が実行され、親の submission_rows に反映
- 親が「現状を確認・反映」を押せば、子が未提出のままでも途中状態を親のワークスペースに取り込める（子 status は変わらない）
- 配下が全員 `merged` または `cancelled` になれば親は自分の Submission を提出できる
- 最上位 coordinator が submit したとき allocation_rows に反映される
- 強制提出時: 配下の未完了 Submission がすべて `cancelled` に遷移し、partial merge が親のワークスペースに反映

---

## 5. 画面別レイアウト概要

### S-02 依頼一覧（PortalView）— 現状と ToBe

**現状（実装済み）:** ヘッダー（ユーザー名・ログアウト）+ 依頼一覧テーブル（ラウンド名・ステータス・行数・更新日時・コメント・編集ボタン）。

**ToBe（Phase B で追加予定）:**
- 通知バッジ（ヘッダー右）
- 依頼コメントの展開表示
- 差し戻しコメントの強調表示（赤バッジ）
- 配下一覧を依頼一覧の中に埋め込み表示（子行の展開）
- 配下が `submitted` のとき「マージする」ボタン
- 配下が `in_progress`/`pending` のとき「現状を確認・反映」ボタン（sync）

---

### S-03 Submission 編集（SubmissionEditView）— 未実装

STEP1 と共通の EditView コアを使用し、スロットを差し替える。ヘッダーに依頼コメント（折りたたみ）、フッターに戻る・委任追加（❓ 未確定、Q-C 参照）・整合エラー件数・提出ボタンを配置する。中央は STEP1 と共通の EditView コア（組織パネル・Canvas・AI など）。

**スロット設計（`EditViewSlots` インターフェース）:**

| スロット | STEP1 | STEP2 |
|---|---|---|
| `userSlot` | モードセレクタ | ユーザー名表示 |
| `primaryActionSlot` | Excel エクスポート | 提出ボタン |
| `step2ExtrasSlot` | — | 依頼コメント・差し戻しコメント・整合エラーバナー |

---

### S-04 配下変更差分ビュー（DiffReviewView）— 未実装

coordinator が配下の Submission 提出後に「何が変わったか」を確認するオプション画面。  
**承認ではない**。自動マージは提出時に既に完了している。差し戻しが必要な行を見つけたときに使う。

画面構成: 配下 Submission の提出状況一覧（担当者・範囲・行数・提出日・差し戻すボタン）+ 変更内容の差分ビュー（フィールド単位で前後をスタック表示、conflict 行をハイライト）。

---

## 6. Phase B 実装前の確認事項

> ✓ = 解決済み、❓ = 確認待ち

| # | 論点 | 決定 |
|---|---|---|
| ✓ Q-A | 承認（submitted → accepted）は誰が、どこから実行するか | `accepted` ステータスを廃止。提出と同時に 3-way merge が自動実行され coordinator の編集画面に即座に反映。明示的な承認操作は不要（詳細: `docs/14-delegation-model.md`）|
| ✓ Q-B | マージ確認を行うタイミングと UI の位置（2026-06-07） | **親 coordinator が明示的に実行**（手動マージ）。`POST /submissions/:id/merge`（配下が `submitted` → 子 status `merged`）と `POST /submissions/:id/sync`（配下が `in_progress`/`pending` → 子 status 変わらず取り込み）の2種。S-04 はオプションの差分確認画面 |
| ✓ Q-D | 差し戻し時、孫 Submission のステータスはどうなるか | 差し戻しは1段のみ。孫は連動しない（連鎖差し戻しは複雑すぎるため、child の扱いは child の判断に委ねる） |
| ✓ Q-E | 担当者（member）がさらに依頼できるか | **coordinator 以上のみ**。member には依頼機能を付けない。用語整理として「委任」ではなく「依頼」で UI・ドキュメントを統一（DB カラム名は変えない） |
| ✓ Q-F | 「提出」ボタンの前提条件（配下あり coordinator） | 強制提出オプションを実装。通常提出は配下が全員 `submitted`/`cancelled` のときのみ可、強制提出は未提出配下を再帰的に `cancelled` にして partial merge を反映（409 時に `window.confirm` で促す） |
| ✓ Q-G | PortalView の依頼一覧に「配下の進捗」を表示するか | 表示する。`GET /api/submissions` に `child_count`/`child_done_count` を追加し「配下 N/M 完了」列を表示（`submitted` と `cancelled` を完了カウント） |

### ❓ Q-C 委任を追加できるのは SubmissionEditView 内か、PortalView からか

coordinator が子委任を追加する UI がない（現状は admin の RoundDetailView からのみ）。選択肢: Submission 編集画面（S-03）のフッター／依頼一覧（PortalView）の各行／両方に配置。

---

## 7. 実装フェーズと対応画面

| フェーズ | 対象 | 画面 | 状態 |
|---|---|---|---|
| **Phase A** | EditView リファクタ + Submission 編集基本 | S-03（SubmissionEditView）| ✓ 完了 |
| **Phase B1** | スナップショット・3-way merge 基盤・強制提出 | サーバー + domain 層 | ✓ 完了 |
| **Phase B2** | 手動マージ（merge/sync）・`merged` ステータス・Excel アップロード・スナップショット修正 | サーバー + UI | ✓ マージ/差し戻し/途中取り込み UI 完了。Excel アップロードは未 |
| **Phase C** | 差分ビュー（S-04）・コンフリクトハイライト UI | DiffReviewView | ✓ 完了 |
| **Phase D** | 通知・整合チェック UI | S-06（NotificationView）| ✗ 未 |
| **Phase F** | 本番化 | 認証・DB アダプタ差し替え | ✗ 未 |

> ~~Phase E（Cross-Round マージ）~~: 実装しないことを決定済み（`docs/12-step2-requirements.md` §13 参照）。S-05（ConflictResolveView）は既に bottom-up マージのコンフリクト表示用として完了している。

---

*❓ 項目への回答後、対応する仕様を `specs/` に落とし込んで実装に進む。*
