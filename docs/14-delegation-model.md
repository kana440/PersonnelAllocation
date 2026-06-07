# 14 — 依頼・スナップショット・マージモデル

> **ステータス**: 決定済み（2026-06、改訂 2026-06-07）  
> 実装仕様は `specs/G8-delegation/01-snapshot-merge.md` 参照。
>
> **用語メモ**: コード上は `submission`, `parent_id`, `assignee_id` などの英語識別子はそのまま。  
> UI・ドキュメントでは「委任・委譲」ではなく「依頼」で統一する（主担当が担当者に情報入力を依頼する概念のため）。

---

## 1. 設計の背景

### Excel 運用での「スナップショット渡し」

現状の Excel 運用では、取りまとめ担当（coordinator）が次のことを行う：

1. coordinator がある程度行を記入した Excel を担当者に渡す（担当者は自分の担当列のみ入力）
2. 担当者が担当列だけ入力して返却
3. coordinator がローカルで手動マージして最終 Excel を作る

この「スナップショット渡し → 担当者が差分を入れる → coordinator がマージ確認」の流れをシステム化する。

### Git との対応

| Git 概念 | 本システム |
|---|---|
| リポジトリ | Round（1回の配置作業全体） |
| main ブランチ | `allocation_rows`（最終確定データ。admin 直下の trunk） |
| feature ブランチ | coordinator の `submission_rows`（自分のワークスペース） |
| sub-feature ブランチ | 配下 coordinator / member の `submission_rows` |
| `git checkout -b` | 依頼作成。snapshot_data = 親のワークスペースの現在行 |
| `git commit` | 担当者が行を PUT する |
| `git push` / PR | 担当者が「提出する」ボタンを押す（status → `submitted`） |
| `git merge`（手動） | 親が「マージする」を押す → 親の submission_rows に 3-way merge 反映 → 子 status → `merged` |
| `git pull`（途中確認） | 親が「現状を確認・反映」を押す → sync → 親の submission_rows 更新（子 status は変わらない） |
| `git push to main` | 最上位 coordinator が submit → allocation_rows に反映 |

---

## 2. データモデル

### allocation_rows（最終確定データ = trunk）

```
allocation_rows:
  round_id      TEXT  (FK rounds.id)
  row_id        INT
  submission_id TEXT  (最後にこの行を書いた Submission。記録用・ロックには使わない)
  data          JSON  (AllocationRow full object)
  updated_at    TEXT
  UNIQUE(round_id, row_id)
```

admin が Round を作成したとき（Excel インポート含む）に初期値が入る。  
最上位 coordinator が submit するときに 3-way merge で更新される。  
それ以外のタイミングでは変更しない（coordinator / member の作業は submission_rows で行う）。

### submission_rows（各 Submission のワークスペース）

```
submission_rows:
  submission_id TEXT  (FK submissions.id、CASCADE DELETE)
  row_id        INT
  data          JSON  (AllocationRow full object)
  updated_at    TEXT
  PRIMARY KEY (submission_id, row_id)
```

- 各 coordinator・member の「作業コピー」
- PUT /submissions/:id/rows で書き込む（allocation_rows は触らない）
- 依頼作成時・初期表示時: 存在しなければ親の submission_rows（なければ allocation_rows）を返す

### submissions（追加カラム）

```
submissions:
  ...（既存カラム）
  snapshot_data  JSON  ← 依頼作成時点の「親ワークスペース」スコープ行のコピー（3-way merge の base）
  conflict_fields JSON  ← merge/sync で衝突したフィールド記録（UI ハイライト用）
```

**snapshot_data の取得元**（依頼作成時）:
1. 親 Submission が `submission_rows` を持っていれば → 親の submission_rows のスコープ行
2. 親が submission_rows を持っていなければ → `allocation_rows` のスコープ行

---

## 3. ステータス遷移

```
           [依頼作成]
               ↓
           pending
               │
          [編集開始・自動]
               ↓
          in_progress ◄────────────────────────────────┐
               │ \                                      │
          [提出]  \[強制提出で巻き込まれた場合]    [再提出]
            ↙   ↘   ↘                                  │
  [整合エラー] [OK] cancelled                           │
  （ブロック）   ↓                                      │
            submitted                                  │
               │ \                                      │
     [親がマージ]  \[親が差し戻し]                       │
               ↓    ↓                                   │
            merged  revision_requested ─────────────────┘
```

### ステータス一覧

| ステータス | 説明 | 誰が遷移させるか |
|---|---|---|
| `pending` | 依頼作成済み・未着手 | 自動（依頼作成時） |
| `in_progress` | 編集中 | 自動（最初の PUT 時） |
| `submitted` | 提出済み。親のマージ待ち | 担当者が「提出」ボタン |
| `merged` | 親がマージ済み。親のワークスペースに反映済み | 親 coordinator が「マージ」 |
| `revision_requested` | 差し戻し中。担当者が再編集する必要あり | 親 coordinator が「差し戻し」 |
| `cancelled` | 強制取消。強制提出で発生 | 親が「強制提出」を実行 |

**削除したステータス**: `accepted`（不要と判断）

---

## 4. 操作一覧（親 coordinator が実行できる操作）

### A. マージ（`POST /submissions/:id/merge`）

- **対象**: `submitted` 状態の子 Submission
- **実行者**: 親 coordinator（または admin）
- **処理**:
  1. 3-way merge を実行（§5 参照）
  2. 結果を **親の submission_rows** に書き込む（最上位なら allocation_rows）
  3. 子の status を `submitted` → `merged` に更新
  4. conflict があれば conflict_fields に記録
- **コンフリクト時**: conflict_fields を返し、UI でハイライト表示。差し戻しも選択可能

### B. 現状を反映（`POST /submissions/:id/sync`）

- **対象**: 任意の status（`pending`, `in_progress`, `submitted` すべて可）
- **実行者**: 親 coordinator（配下の進捗を随時確認したい場合）
- **処理**:
  1. 子の現在の submission_rows（なければ snapshot_data）で 3-way merge を計算
  2. 結果を **親の submission_rows** に書き込む
  3. **子の status は変更しない**（担当者は気づかず編集継続）
  4. conflict があれば conflict_fields に記録
- **ユースケース**: 「まだ提出していないが現状どうなっているか確認したい。自分のワークスペースに取り込んで全体像を把握したい」

### C. 差し戻し（`POST /submissions/:id/request-revision`）

- **対象**: `submitted` 状態の子 Submission
- **処理**: status を `revision_requested` に変更。コメント付きで返送
- **子の担当者**: 再編集して再提出する

### D. 強制提出（`POST /submissions/:id/submit` with `{ force: true }`）

- **対象**: 自分自身の Submission（配下に未マージの子がある状態でも強制実行）
- **処理**:
  1. 配下のすべての未完了 Submission（`merged`/`cancelled` 以外）を再帰的に処理
  2. 各未完了子について sync 相当の merge を実行（部分マージ）→ 親ワークスペースに反映
  3. 対象子を `cancelled` に変更
  4. 自分自身を submit

---

## 5. 3-way merge アルゴリズム

### 定義

```
base   = 子の snapshot_data（依頼時点の親ワークスペースの状態）
theirs = 子の現在の submission_rows（merge / sync 時に参照）
ours   = 親の現在の submission_rows（sync/merge する親のワークスペース）
         （最上位の場合は allocation_rows）
```

### フィールド単位の判定

| base vs ours | base vs theirs | 結果 |
|---|---|---|
| 変化なし | 変化なし | ours を保持 |
| ours が変更 | 変化なし | ours を保持 |
| 変化なし | theirs が変更 | **theirs を採用** |
| 両方が変更（同じ値） | 同上 | ours を保持（同値なので問題なし） |
| 両方が変更（異なる値） | 同上 | **conflict** → ours を保持 + conflict_fields に記録 |

### conflict の扱い

- merge/sync 後、conflict フィールドは `submissions.conflict_fields` に記録
- 親 coordinator の編集画面で該当フィールドをハイライト表示（Phase C UI）
- 親が値を保存した時点で conflict 解消
- conflict があっても merge/sync は完了する（conflict を理由にブロックしない）

---

## 6. 階層別の書き込み先

```
Round
  └─ admin が allocation_rows を初期化（Excel インポート）
       └─ Coordinator A の submission_rows（A が編集・依頼を出す）
             └─ Coordinator B の submission_rows（B が編集・依頼を出す）
                   └─ Member C の submission_rows（C が編集して提出）
                        ↑ B が「マージ」→ B の submission_rows に反映
             ↑ A が「マージ」→ A の submission_rows に反映
       ↑ A が「提出」→ allocation_rows に反映（最上位のみ）
```

**最上位 Submission（parent_id が null）の submit のみ** allocation_rows に書く。  
それ以外はすべて親の submission_rows に書く。

---

## 7. 依頼作成時・初期表示のデータ取得ルール

### 依頼作成時（snapshot_data の取得元）

```
if 親が submission_rows を持っている:
  snapshot_data = 親の submission_rows のスコープ行
else:
  snapshot_data = allocation_rows のスコープ行
```

### GET /submissions/:id/rows（担当者の初期表示）

```
if 自分の submission_rows が存在する:
  return 自分の submission_rows
elif 親の submission_rows が存在する:
  return 親の submission_rows のスコープ行
else:
  return allocation_rows のスコープ行
```

これにより「coordinator がある程度記入してから依頼した場合、担当者は coordinator の記入済み内容を引き継いで表示される」。

---

## 8. 実装しないこと

### DelegationPolicy（列制限）

「担当者に見せる列だけを委任時に指定する」機能は実装しない。理由：
- 編集画面・バリデーション・マージ処理が複雑になりすぎる
- 担当者は業務上わからない列を読み飛ばして入力するだけで十分

### 外部 npm モジュール

`microdiff` や `fast-json-patch` 等は使わない。`AllocationRow` は固定スキーマで全フィールドが primitive なため、domain 層の純粋関数で十分に実装できる。

### 孫 Submission の連動差し戻し

差し戻しは直接の依頼元（parent）から依頼先（child）への 1段のみ。孫は連動しない。

---

## 9. Excel インポート（Round 初期化）

admin が Round を作成する際、Excel ファイルをアップロードして `allocation_rows` を初期化できる。

1. Admin が RoundCreateModal で Excel ファイルを選択
2. STEP1 の既存 Excel パーサー（`excelImporter`）で行データを生成
3. `POST /api/rounds` の `rows` フィールドに渡す
4. サーバーが `allocation_rows` に保存
5. 以降、coordinator への依頼作成が可能になる
