# G7-02 — DB スキーマ設計（ER 仕様）

> **対象**: STEP2 サーバー（Hono + Drizzle ORM + PGlite/Aurora）
> **ステータス**: 実装済み（2026-06）
> **スキーマ定義**: `apps/server/src/db/schema.ts`

---

## 設計方針

| 原則 | 内容 |
|---|---|
| **マルチテナント** | グループ傘下の複数会社をサポート。`companies` がテナント単位 |
| **Round = グループ横断** | Round は複数会社を束ねる。`round_companies` が Round × Company の実作業単位 |
| **Revision 廃止** | 前回 Round の `allocation_rows` を次回の出発点として直接参照（`rounds.based_on_round_id`） |
| **マスタ正規化** | 組織・コードリストを JSON blob ではなく正規化テーブルで管理 |
| **Excel は 1:1** | `round_company_files` が Round × Company ごとに 1 ファイル（base64 text） |

---

## ER 図

```
┌──────────────────────────────────────────────────────────────────────────┐
│ グループレベル（会社横断）                                                │
│                                                                          │
│  companies                 users                                         │
│  ──────────                ─────                                         │
│  id (PK)                   id (PK)                                       │
│  name, code, locale        name, email                                   │
│                            role (admin|coordinator|member)               │
│      │                          │                                        │
│      └────────────┬─────────────┘                                        │
│                   │ M:N                                                  │
│           user_company_roles                                             │
│           ─────────────────                                              │
│           user_id → users                                                │
│           company_id → companies                                         │
│           role, org_level_min, org_codes                                 │
│           PK: (user_id, company_id)                                      │
│                                                                          │
│  rounds (グループ作業サイクル)                                            │
│  ──────────────────────────                                              │
│  id (PK)                                                                 │
│  label, kind, status                                                     │
│  based_on_round_id → rounds.id  ← self-ref (nullable = 初回)            │
│  created_by → users                                                      │
└─────────────────────────┬────────────────────────────────────────────────┘
                          │ 1:N
┌─────────────────────────▼────────────────────────────────────────────────┐
│ round_companies（Round × Company 実作業単位）                             │
│ ──────────────────────────────────────────                               │
│ id (PK)                                                                  │
│ round_id → rounds                                                        │
│ company_id → companies                                                   │
│ status (draft|in_progress|ready|merged)                                  │
│ UNIQUE (round_id, company_id)                                            │
│                                                                          │
│   ├── 1:1  round_company_files                                           │
│   │        round_company_id (PK), filename, data(base64), size           │
│   │                                                                      │
│   ├── 1:N  round_company_orgs  ← 組織スナップショット（正規化ツリー）    │
│   │        id (serial PK)                                                │
│   │        round_company_id → round_companies                            │
│   │        is_after BOOL  ← false=before, true=after                    │
│   │        external_code, name                                           │
│   │        parent_id → round_company_orgs.id  ← self-ref                │
│   │        level, path TEXT  ← マテリアライズドパス "/1/3/7/"            │
│   │                                                                      │
│   ├── 1:N  round_company_code_items  ← コードリスト（正規化）           │
│   │        id (serial PK)                                                │
│   │        round_company_id → round_companies                            │
│   │        category  ← employment_type | job_level | ...                │
│   │        code, label, sort_order, attributes(JSON)                     │
│   │                                                                      │
│   ├── 1:N  allocation_rows  ← trunk の行データ                          │
│   │        id (serial PK)                                                │
│   │        round_company_id → round_companies                            │
│   │        submission_id → submissions  ← 最終更新した submission (nullable)│
│   │        row_id INT, data TEXT (JSON: AllocationRow)                   │
│   │        UNIQUE (round_company_id, row_id)                             │
│   │                                                                      │
│   └── 1:N  submissions  ← 委譲ツリー                                    │
│            id (PK)                                                       │
│            round_company_id → round_companies                            │
│            parent_id → submissions.id  ← self-ref (nullable = top-level)│
│            assignee_id → users                                           │
│            scope TEXT, status TEXT                                       │
│            snapshot_data  ← 委譲時点の親スナップショット（委譲範囲分）  │
│                                                                          │
│            └── 1:N  submission_rows  ← ブランチの編集行                 │
│                     submission_id → submissions                          │
│                     row_id INT, data TEXT                                │
│                     PK: (submission_id, row_id)                          │
└──────────────────────────────────────────────────────────────────────────┘

整合性チェック:
  consistency_issues      ← 会社内（round_company 内の submission 間）
    round_company_id → round_companies
    group_employee_id, field, value_a, value_b
    submission_a_id, submission_b_id → submissions

  cross_company_issues    ← 会社横断（同一グループ社員IDが複数会社に存在）
    round_id → rounds
    group_employee_id
    company_a_id, company_b_id → companies
    field, value_a, value_b

その他:
  positions    ← ポジションプール（会社別）
    code (PK), company_id → companies, status

  comments     ← consistency_issues へのコメント
  inquiries    ← round_company 内の行照会
  notifications ← 委譲・提出・差し戻し通知
```

---

## テーブル一覧

| テーブル | 用途 | レベル |
|---|---|---|
| `companies` | 会社マスタ | グループ |
| `users` | グループ横断ユーザー | グループ |
| `user_company_roles` | 会社ごとの役割・アクセス制御（M:N） | グループ |
| `rounds` | グループ作業サイクル | グループ |
| `round_companies` | Round × Company の実作業単位 | Round × Company |
| `round_company_files` | Excel ファイル（1:1） | Round × Company |
| `round_company_orgs` | 組織スナップショット（before/after） | Round × Company |
| `round_company_code_items` | コードリスト（役職・バンド等） | Round × Company |
| `allocation_rows` | trunk の AllocationRow | Round × Company |
| `submissions` | 委譲ツリーのノード | Round × Company |
| `submission_rows` | ブランチの編集行スナップショット | Submission |
| `consistency_issues` | 会社内の整合性問題 | Round × Company |
| `cross_company_issues` | 会社横断の整合性問題 | Round |
| `positions` | ポジションプール（会社別） | Company |
| `comments` | consistency_issues へのコメント | — |
| `inquiries` | 行照会 | Round × Company |
| `notifications` | 通知 | — |

---

## 主要な設計判断

### Revision を廃止した理由

- `revisions` は「Round 確定後のスナップショット」として機能していたが、
  前回 Round の `allocation_rows` がそのまま次回の出発点になるため不要
- `rounds.based_on_round_id` (self-ref) で前回 Round を参照するだけで十分
- テーブル数と概念が減り、シンプルになる

### 組織を正規化ツリーで持つ理由

- `round_masters.beforeOrganizations` / `afterOrganizations` (JSON blob) では
  DB でのサブツリー絞り込みが不可能だった
- `round_company_orgs.path` のマテリアライズドパス（"/1/3/7/"）で
  `path LIKE '/1/3/%'` による高速サブツリー検索が可能
- before/after を `is_after` フラグで同テーブルに格納（対称性・クエリの簡素化）

### Round × Company を中間テーブルにした理由

- 同一 Round に複数会社が参加（グループ全体の人事サイクルを統合管理）
- 会社横断の整合性チェック（同一グループ社員IDの重複検出）が必要
- `UNIQUE(round_id, company_id)` で 1 Round に同一会社は 1 つだけ

### マスタ（コードリスト）をラウンドごとに持つ理由

- Excel インポート時のマスタをそのまま保持（ラウンドをまたいで変わる可能性がある）
- `round_company_code_items.category` で種別を区別（employment_type / job_level / ...）
- `attributes` (JSON) でカテゴリ固有の追加属性を保持（`isOutsourceAcceptance` 等）

---

## API エンドポイント

```
GET    /api/rounds                                    - Round 一覧
POST   /api/rounds                                    - Round + RoundCompany 作成
GET    /api/rounds/:id                                - Round 詳細
PATCH  /api/rounds/:id                                - Round 更新（status/label）
GET    /api/rounds/:id/companies                      - Round 内の Company 一覧
POST   /api/rounds/:id/finalize                       - Round 確定（status=merged）
GET    /api/rounds/:id/tree                           - 委任ツリー（全 Company）

GET    /api/rounds/:id/companies/:companyId/masters   - 組織・コードリスト取得
GET    /api/rounds/:id/companies/:companyId/excel     - Excel ダウンロード

GET    /api/submissions                               - 自分の Submission 一覧
POST   /api/submissions                               - 依頼作成（roundCompanyId 指定）
GET    /api/submissions/:id                           - 詳細
GET    /api/submissions/:id/children                  - 子 Submission 一覧
GET    /api/submissions/:id/rows                      - 行一覧
PUT    /api/submissions/:id/rows                      - 行保存
POST   /api/submissions/:id/submit                    - 提出（force オプションあり）
POST   /api/submissions/:id/merge                     - マージ
POST   /api/submissions/:id/sync                      - 途中取り込み
POST   /api/submissions/:id/request-revision          - 差し戻し

GET    /api/admin/users                               - ユーザー一覧
POST   /api/admin/users                               - ユーザー作成
GET    /api/admin/users/:id                           - ユーザー詳細
PUT    /api/admin/users/:id                           - ユーザー更新
DELETE /api/admin/users/:id                           - ユーザー削除
GET    /api/admin/users/:id/company-roles             - 会社ロール一覧
PUT    /api/admin/users/:id/company-roles/:companyId  - 会社ロール設定
DELETE /api/admin/users/:id/company-roles/:companyId  - 会社ロール削除
```
