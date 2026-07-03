import type React from 'react'
import type { Organization }  from '@personnel/domain/schemas'
import type { ChildrenMode, PanelDef } from '../../../store/canvasLayoutStore'

export type { PanelViewModeId } from '../../../store/canvasLayoutStore'

// ── ツリーノードに渡す子組織操作アダプタ ─────────────────────────────
export interface PanelTreeAdapter {
  /** orgId → そのパネル定義を返す（存在しない場合は undefined） */
  getPanelByOrgId:  (orgId: string) => PanelDef | undefined
  openOrg:          (orgId: string) => void
  closeOrg:         (orgId: string) => void
  /** after 側のみ（before 側では undefined） */
  addPanel?:        (orgId: string, opts?: { childrenMode?: ChildrenMode; collapsedOrgIds?: string[] }) => void
}

// ── キャンバスレベルの操作アダプタ ───────────────────────────────────
export interface OrgTreeCanvasAdapter {
  panels:              PanelDef[]
  setPanelPosition:    (panelId: string, x: number, y: number) => void
  togglePanelOpen:     (panelId: string) => void
  setPanelHeight:      (panelId: string, height: number) => void
  setChildrenMode:     (panelId: string, mode: ChildrenMode) => void
  setCollapsedOrgIds:  (panelId: string, ids: string[]) => void
  openOrg:             (orgId: string) => void
  closeOrg:            (orgId: string) => void
  addPanel?:           (orgId: string, opts?: { childrenMode?: ChildrenMode; collapsedOrgIds?: string[] }) => void
  removeOrgPanels?:    (orgIds: string[]) => void
}

// ── ドラッグ操作（after 側のみ） ─────────────────────────────────────
export interface OrgDragHandlers {
  handleDragOver:  (e: React.DragEvent, orgId: string) => void
  handleDragLeave: () => void
  handleDrop:      (e: React.DragEvent, orgId: string) => void
  dragOverOrgId:   string | null
}

// ── パネルのヘッダー色計算 ───────────────────────────────────────────
export type HeaderBgFn = (orgId: string) => string

// ── OrgTreeNode / OrgTreePanel に渡す描写設定 ────────────────────────
export interface OrgTreeConfig {
  orgs:             Organization[]
  /** O(1) ルックアップ用。Canvas が useMemo で1回だけ構築して全パネルに渡す */
  orgById:          Map<string, Organization>
  /** O(1) ルックアップ用。orgId → 直接の子 Organization[] */
  childrenByOrgId:  Map<string, Organization[]>
  /** その組織の直接所属アイテム数（カード数） */
  getItemCount:     (orgId: string) => number
  /** O(1) ルックアップ用。orgId → サブツリー全体のアイテム数（TreeWindow が useMemo で1回だけ構築） */
  subtreeCountByOrgId?: Map<string, number>
  /** ツリーモードのカード描写 */
  renderItems:      (orgId: string, panelId: string) => React.ReactNode
  /** バンド等のフラットモード描写 */
  renderFlatItems?: (orgId: string, panelId: string) => React.ReactNode
  /** 組織ヘッダー右端の追加ボタン（AddRowDropdown など） */
  renderOrgExtra?:  (orgId: string) => React.ReactNode
  /** true のとき空の組織ノードもドロップ先として表示（after 側のみ true） */
  showEmptyOrgs?:   boolean
  /** ヘッダー色計算関数 */
  getHeaderBg:      HeaderBgFn
  /** 子組織チップのアクセントカラー（after='blue', before='amber'） */
  accentColor:      'blue' | 'amber'
  dragHandlers?:    OrgDragHandlers
  selectedOrgId?:   string
  onSelectOrg?:     (orgId: string) => void
}
