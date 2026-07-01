/**
 * rowRule.ts — 単一行スコープのルール定義
 *
 * FieldRule（1フィールド × マスタ照合）では表現できない、
 * 複数フィールド間の相関ロジック・自動導出を宣言する場所。
 *
 * 制約: validate / derive の引数に allocationList を持たない。
 *   複数行間のロジックは InterRowRule（interRowRule.ts）へ。
 *
 * パフォーマンス設計:
 *   バッチ処理（validateAllRows）ではバッチ全体で RowRuleCtx を 1 インスタンス共有する。
 *   高コストな計算（buildFlatOrgView 等）は RowRuleCtx の lazy getter が初回アクセス時に
 *   1 回だけ実行し、以降はキャッシュする。
 */

import type { AllocationRow }   from '../allocationRow'
import type { Organization }    from '../schemas'
import type { AllMasters }      from '../masters/aggregate'
import type { OrgMasterEntry }  from '../masters/orgMaster'
import type { ValidationIssue } from './validate/types'
import type { FlatOrgEntry }    from './options/orgTree'
import { buildFlatOrgView }     from './options/orgTree'

// ── RowRuleCtx ─────────────────────────────────────────────────────────────────

/**
 * バッチループで 1 インスタンスを共有する遅延評価コンテキスト。
 *
 * 各 getter は初回アクセス時に 1 回だけ計算しキャッシュする（??= パターン）。
 * 新しい高コスト計算が必要になった場合は getter を追加するだけでよい。
 * RowRule インターフェースの変更は不要。
 */
export class RowRuleCtx {
  constructor(
    readonly masters:            AllMasters,
    readonly afterOrganizations: Organization[],
  ) {}

  // ── 組織ツリー展開ビュー ──────────────────────────────────────────────────
  // buildFlatOrgView は再帰処理（O(orgs)）のためバッチ全体で 1 回だけ呼ぶ

  private _orgFlatView?: FlatOrgEntry[]
  get orgFlatView(): FlatOrgEntry[] {
    return this._orgFlatView ??= buildFlatOrgView(this.afterOrganizations)
  }

  /** orgCode → FlatOrgEntry（O(1) ルックアップ） */
  private _orgFlatEntryByCode?: Map<string, FlatOrgEntry>
  get orgFlatEntryByCode(): Map<string, FlatOrgEntry> {
    return this._orgFlatEntryByCode ??= new Map(
      this.orgFlatView.map(e => [e.orgCode, e])
    )
  }

  // ── 組織マスタ ─────────────────────────────────────────────────────────────

  /** org.id → Organization（O(1) ルックアップ） */
  private _orgById?: Map<string, Organization>
  get orgById(): Map<string, Organization> {
    return this._orgById ??= new Map(this.afterOrganizations.map(o => [o.id, o]))
  }

  /** org.externalCode → Organization（O(1) ルックアップ） */
  private _orgByCode?: Map<string, Organization>
  get orgByCode(): Map<string, Organization> {
    return this._orgByCode ??= new Map(
      this.afterOrganizations.map(o => [o.externalCode ?? o.id, o])
    )
  }

  /**
   * orgMasterEntries の code → entry（O(1) ルックアップ）。
   * 'after' フェーズのエントリを優先して格納する（row/correlation.ts C1/C2 と同じロジック）。
   */
  private _orgMasterByCode?: Map<string, OrgMasterEntry>
  get orgMasterByCode(): Map<string, OrgMasterEntry> {
    return this._orgMasterByCode ??= (() => {
      const m = new Map<string, OrgMasterEntry>()
      for (const e of this.masters.orgMasterEntries) {
        if (!m.has(e.code) || e.phase === 'after') m.set(e.code, e)
      }
      return m
    })()
  }
}

// ── RowRule ────────────────────────────────────────────────────────────────────

export interface RowRule {
  readonly id:    string
  /**
   * 'state' : 常時評価（全バリデーション・全導出実行時）
   * 'action': 操作フォームが開いているときのみ評価。
   *           ResolveContext.rowConstraints として EditOperation から注入する。
   */
  readonly scope: 'state' | 'action'

  /**
   * このルールを適用するかどうかの事前条件。
   * 省略時は常に適用。false を返すと validate / derive ともにスキップ。
   */
  when?: (row: AllocationRow, masters: AllMasters) => boolean

  /**
   * バリデーション。violations があれば ValidationIssue[] を返す。
   * 引数に allocationList を持たない（必要なら InterRowRule へ）。
   */
  validate(row: AllocationRow, ctx: RowRuleCtx): ValidationIssue[]

  /**
   * フィールド変更時の自動導出（省略可）。
   * delta: 直前の変更差分（resolveRow Phase 1 での収束ループで渡される）。
   * row:   現在の行状態（delta 適用後）。
   * 返値: 新たに導出するフィールド更新。変化がなければ {} を返す。
   */
  derive?(
    delta: Partial<AllocationRow>,
    row:   AllocationRow,
    ctx:   RowRuleCtx,
  ): Partial<AllocationRow>
}

// ── ROW_RULES ─────────────────────────────────────────────────────────────────

/**
 * 登録済み RowRule の一覧。
 * validateAllRows()（validate/batchValidate.ts）と resolveRow()（resolver.ts）が参照する。
 *
 * row/index.ts で C1〜C4（相関チェック）・W2（昇降格）が登録済み。
 */
export const ROW_RULES: RowRule[] = []
