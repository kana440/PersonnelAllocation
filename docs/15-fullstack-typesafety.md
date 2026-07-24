# docs/15 — フルスタック型安全アーキテクチャ

> **対象読者**: このプロジェクトに初めて触れる開発者・引き継ぎ者  
> **目的**: DB から UI まで型が自動伝播する構成の設計思想・実装パターンを理解する

---

## 1. 概要

このプロジェクトの STEP2 サーバー側は、**「型を一度書いたら最後まで伝播する」**構成を採用している。

```
型の流れ（一方向・手書き不要）

  PostgreSQL スキーマ
      ↓  Drizzle ORM が推論
  TypeScript 型（サーバー内）
      ↓  Hono RPC が伝播
  TypeScript 型（クライアント内）
      ↓  TanStack Query が管理
  React コンポーネント（型付き props）
```

従来の手書き型管理との比較:

| 作業 | 従来 | この構成 |
|---|---|---|
| テーブル定義 → 型 | 手書き interface | Drizzle が自動推論 |
| サーバー → クライアント型 | 手書き interface（adminApi.ts） | Hono RPC が自動伝播 |
| フィールド名変更 | 3箇所を手で直す | DB schema 1箇所を直すとコンパイルエラーで検出 |
| ルート追加 | API client に手書き追加 | hc<AppType> に自動反映 |
| 非同期状態管理 | useState + useEffect を毎回 | TanStack Query のフック 1行 |

---

## 2. 技術スタックの全体像

```
apps/web（React + Vite）
  コンポーネント → useQuery/useMutation（TanStack Query）→ client.api.submissions.$get()（hc<AppType>()）
                                        │ HTTP（型付き）
apps/server（Hono + Node.js）
  app.ts（export type AppType）← routes/*.ts ← zValidator（入力検証）← c.json(rows) ← db.select()... ← Drizzle ORM ← schema.ts
                                        │ SQL
PostgreSQL / PGlite（スキーマが TypeScript 型の単一ソース）
```

---

## 3. 各レイヤーの役割と実装パターン

### 3-1. Drizzle ORM（DB → TypeScript型）

**役割**: テーブル定義がそのまま TypeScript 型になる。命名規則（`ApiXxx` を camelCase にする理由など）は `apps/server/CLAUDE.md`「Drizzle ORM のキー命名規則」参照。ここでは型推論の伝播だけ示す。

```typescript
// apps/server/src/db/schema.ts
export const submissions = pgTable('submissions', {
  id:             text('id').primaryKey(),
  roundCompanyId: text('round_company_id').notNull(),
  status:         text('status').notNull().default('pending'),
})
// type Submission = typeof submissions.$inferSelect  ← 自動生成、手書き不要
// → { id: string; roundCompanyId: string; status: string }
```

`schema.ts` でカラム名を変えると、そのフィールドを参照している全クエリがコンパイルエラーになる。実行前に気づける。

---

### 3-2. Hono RPC（サーバー型 → クライアント型）

**役割**: ルート定義の返却型をクライアントに自動伝播する。`adminApi.ts` に手書きしていた interface が不要になる。

```typescript
// apps/server/src/app.ts — サーバー側: AppType をエクスポート
const app = new Hono()
  .route('/api/rounds',      roundRoutes)
  .route('/api/submissions', submissionRoutes)
export type AppType = typeof app   // 型だけをクライアントが import（バンドルされない）

// apps/web/src/infrastructure/api/client.ts — クライアント側
import { hc } from 'hono/client'
import type { AppType } from '@server/app'
export const client = hc<AppType>('http://localhost:3000', { headers: () => ({ 'X-User-Id': ... }) })
// client.api.submissions.$get() の返却型はサーバーの SELECT クエリ結果から自動推論される
```

**入力バリデーション（zValidator）**: ルートに `zValidator('json', schema)` を挟むと `c.req.valid('json')` が `z.infer<typeof schema>` 型になり、不正リクエストは自動的に 400 で弾かれる（if 文不要）。Hono RPC クライアント側でもリクエスト時に入力型が補完される。

---

### 3-3. TanStack Query（非同期状態管理）

**役割**: サーバー状態（フェッチ・キャッシュ・再フェッチ・ミューテーション）の管理を標準化する（§1 の比較表の通り `useState`/`useEffect` の定型コードが消える）。

```typescript
// カスタムフック（一度書けば再利用）
export function useSubmissions() {
  return useQuery({
    queryKey: ['submissions'],
    queryFn:  async () => (await client.api.submissions.$get()).json(),
    // 返却型: Drizzle の SELECT 結果型（自動推論）
  })
}

// コンポーネント（定型コードが消える）
function PortalView() {
  const { data: submissions, isLoading, error } = useSubmissions()
  if (isLoading) return <Spinner />
  if (error)     return <ErrorMessage error={error} />
  return <Table rows={submissions} />  // submissions は型付き配列
}

// ミューテーション（更新系）: 成功時に一覧を自動再フェッチ
export function useSubmitMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => client.api.submissions[':id'].submit.$post({ param: { id } }).then(r => r.json()),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: ['submissions'] }),
  })
}
```

---

## 4. 開発フロー：機能を一本追加する手順

新機能（例: 「ラウンドのコメント機能」）を端から端まで追加するときの手順:

```
① apps/server/src/db/schema.ts
   → テーブル/カラム追加
   → npx drizzle-kit generate で migration SQL 生成

② apps/server/src/routes/xxx.ts
   → zValidator でスキーマ定義（入力型が確定）
   → db.select/insert でクエリ（返却型が自動推論）
   → c.json() で返却（AppType に型が乗る）

③ apps/web/src/hooks/useXxx.ts
   → client.api.xxx.$get() でフェッチ（型補完が効く）
   → useQuery / useMutation でラップ

④ apps/web/src/components/xxx.tsx
   → useXxx() で取得（型付き data が届く）
   → サーバー側の型変更 → ③でコンパイルエラー → 気づける
```

手書きの型定義を書くステップが存在しない。

---

## 5. トレードオフと制約

正直なデメリットも記録しておく。

| 制約 | 内容 | 回避策 |
|---|---|---|
| **Hono RPC の型推論が重い** | ルートが増えると tsc が遅くなる | `isolatedModules: true` で部分チェック |
| **zValidator 漏れは防げない** | await 漏れ等の runtime bug は型では検出できない | サーバーテスト（vitest + `app.request()`）で補完 |
| **AppType の import はビルド設定依存** | `@server/*` エイリアスが Vite の設定と噛み合わないと壊れる | `import type` のみ使用（ランタイム import しない） |
| **Drizzle のリレーション型** | 複雑な JOIN は型が `null` だらけになる | 必要な列だけ SELECT して型を絞る |
| **TanStack Query のキャッシュ設計** | 過剰なキャッシュでデータが古くなることがある | `staleTime` と `invalidateQueries` を意図的に設計する |

---

## 6. ファイル構成の対応関係

```
apps/server/src/db/schema.ts     ← ① 型の起点（Single Source of Truth）。database.ts が PGlite/Aurora 切り替え
apps/server/src/routes/*.ts      ← zValidator + Drizzle クエリ（submissions.ts, rounds.ts, admin/users.ts）
apps/server/src/app.ts           ← AppType エクスポート（Hono RPC の核心）。env.ts が起動時バリデーション（Zod）

apps/web/src/infrastructure/api/client.ts    ← hc<AppType>()（Hono RPC クライアント）
apps/web/src/infrastructure/api/adminApi.ts  ← 旧クライアント（移行期間中は共存）
apps/web/src/hooks/*.ts                      ← TanStack Query カスタムフック（useSubmissions.ts 等）
apps/web/src/components/                     ← フック経由でデータを受け取るだけ
```

---

## 7. 環境変数一覧

```bash
# apps/server/.env.local（開発）
PORT=3000
JWT_SECRET=dev-secret-change-in-production   # 32文字以上推奨
DATABASE_URL=                                 # 未設定 → PGlite 使用
CORS_ORIGIN=http://localhost:5173

# 本番追加
JWT_SECRET=<ランダム64文字>
DATABASE_URL=postgres://...
SAML_ENTRY_POINT=https://login.microsoftonline.com/...
SAML_ISSUER=https://our-app.example.com
SAML_IDP_CERT=<IdP の公開証明書>
SAML_CALLBACK_URL=https://our-app.example.com/api/auth/saml/callback
```

起動時に `env.ts`（Zod）が検証し、必須項目が未設定なら即プロセス終了する。

---

## 付録: よくある疑問

- **`adminApi.ts` はいつ消えるか？** 既存コンポーネントが TanStack Query + Hono client に移行し終えた時点で削除できる。移行は段階的で良い。新しいコンポーネントは最初から `client.ts` を使う
- **SAML の実装はどこから手をつければ良いか？** `apps/server/src/routes/auth.ts` のコメントアウト部分。IdP メタデータ（entryPoint, cert, callbackUrl）が確定してから `@node-saml/node-saml` をインストールして有効化する（`issueToken()` は実装済み）
- **Aurora（本番 DB）への切り替えは？** `DATABASE_URL` 環境変数を設定するだけ。`database.ts` がアダプタを自動切り替えする。Drizzle のクエリコードは変更なし
- **Cloudflare Workers へのデプロイは？** `@hono/node-server` を外して Cloudflare アダプタに変えるだけ。Hono はランタイム非依存のためルートコードの変更は不要
