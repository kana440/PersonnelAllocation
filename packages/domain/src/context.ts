// ドメイン層の共通コンテキスト型
//
// DomainContext  — 全ドメイン操作（EditCommand・OperationDef・バリデーション）の共通基盤
// RowContext     — 行単位の処理（バリデーション・EditPattern 検出・availableFor）に追加情報を付与
//
// OperationContext は DomainContext に統一された（旧名は廃止）

import type { AllocationRow } from './allocationRow'
import type { Organization }  from './schemas'
import type { AllCodeLists }  from './masters/aggregate'
import type { RowChanges }    from './patterns/changeDetection'

// ── 全ドメイン処理の共通基盤 ─────────────────────────────────────────────────

export interface DomainContext {
  readonly allocationList:     AllocationRow[]   // 全行（E系・cross-row 参照に使用）
  readonly afterOrganizations: Organization[]    // 組織ツリー
  readonly codeLists:          AllCodeLists      // マスタデータ
}

// ── 行単位の処理に追加情報を付与 ─────────────────────────────────────────────

export interface RowContext extends DomainContext {
  readonly row:      AllocationRow
  readonly changes?: RowChanges   // G/W系・EditPattern 検出に使用。不要な処理は無視してよい
}

// ── グループ行ヘルパー ────────────────────────────────────────────────────────
// 出向など、同一 groupEmployeeId を持つ複数行をまとめて参照したいときに使う。
// コンテキストには持たせず、必要な関数内で都度呼び出す。

export function groupRows(ctx: DomainContext, row: AllocationRow): AllocationRow[] {
  if (!row.groupEmployeeId) return [row]
  return ctx.allocationList.filter(r => r.groupEmployeeId === row.groupEmployeeId)
}
