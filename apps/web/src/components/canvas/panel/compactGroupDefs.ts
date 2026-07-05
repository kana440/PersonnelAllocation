import type { AllocationRow }  from '@personnel/domain/allocationRow'
import type { AllMasters }     from '@personnel/domain/masters/aggregate'
import type { Organization }   from '@personnel/domain/schemas'
import type { EditCommand }    from '@personnel/domain/commands/types'
import type { EditOperation }  from '@personnel/domain/commands/defs/index'
import { DirectEditOperation } from '@personnel/domain/commands/handlers/directEdit'
import { promotionDef, demotionDef } from '@personnel/domain/commands/defs/promotionDefs'

// ── ドロップ挙動の型定義 ─────────────────────────────────────────────────────

export type CompactGroupDropBehavior =
  /**
   * 確認ダイアログ → 即時実行
   * 例: 勤務場所（単一フィールドの変更）、上司変更（グループサンプル行から positionCode を取得）
   * groupSample: ドロップ先グループの代表行。positionCode 等を参照したい場合に使う（省略可能）。
   */
  | {
      kind:           'confirm'
      canDrop:        (from: AllocationRow, toKey: string) => boolean
      buildCommand:   (from: AllocationRow, toKey: string, groupSample?: AllocationRow) => EditCommand
      confirmMessage: (from: AllocationRow, toKey: string) => string
    }
  /**
   * OperationDef フォームをモーダルで開く（pre-filled）
   * 例: 役職変更（titleChangeDef）
   */
  | {
      kind:         'form'
      canDrop:      (from: AllocationRow, toKey: string) => boolean
      def:          EditOperation
      buildInitial: (from: AllocationRow, toKey: string) => Partial<AllocationRow>
    }
  /**
   * バンド昇降格ウィザード（quickInputs フォーム）
   * 例: positionBand
   */
  | {
      kind:         'band-wizard'
      canDrop:      (from: AllocationRow, toKey: string, masters: AllMasters) => boolean
      getDef:       (from: AllocationRow, toKey: string, masters: AllMasters) => EditOperation
      buildInitial: (from: AllocationRow, toKey: string) => Partial<AllocationRow>
    }

// ── sortGroupsWithContext 用のコンテキスト型 ─────────────────────────────────

/**
 * sortGroupsWithContext に渡されるフル情報。
 * sortKeys では受け取れない allocationList・org階層・パネルの orgId を含む。
 */
export interface SortGroupsContext {
  masters:           AllMasters
  /** positionCode → AllocationRow の O(1) Map */
  positionCodeToRow: Map<string, AllocationRow>
  /** org.id → Organization の Map */
  orgById:           Map<string, Organization>
  /** org.externalCode → Organization の Map */
  orgByExternalCode: Map<string, Organization>
  /** このパネルの組織 ID */
  currentOrgId:      string
}

// ── CompactGroupDef 型 ───────────────────────────────────────────────────────

export interface CompactGroupDef {
  id:            string
  label:         string
  /** AllocationRow からグループキーを取り出す（after 状態） */
  getKey:        (row: AllocationRow) => string
  /** AllocationRow からグループキーを取り出す（before/prev 状態。省略時は getKey にフォールバック） */
  getPrevKey?:   (row: AllocationRow) => string
  /** グループキー配列を表示順に並び替える。(未設定) は末尾 */
  sortKeys:      (keys: string[], masters: AllMasters) => string[]
  /**
   * sortKeys の拡張版。各グループのサンプル行と org 階層情報を受け取って順序を決める。
   * 定義されている場合は sortKeys より優先される。
   * 引数の groups は { key, sampleRow } 配列（sampleRow は各グループの先頭行）。
   * 戻り値はソート済みキーの配列。
   */
  sortGroupsWithContext?: (
    groups: ReadonlyArray<{ key: string; sampleRow: AllocationRow }>,
    ctx: SortGroupsContext
  ) => string[]
  /** グループ間ドラッグ&ドロップの挙動。省略時はドロップ不可（照会のみ） */
  dropBehavior?: CompactGroupDropBehavior
  /**
   * グループヘッダーに補足ラベルを表示する場合に設定。
   * positionCodeToLookup を返すと BandMatrixPanel がその positionCode の行を allocationList から検索し
   * 所属組織名を括弧付きで表示する。（例: 上司グループ → 上司の所属組織名）
   */
  resolveSubLabel?: (key: string, sampleRow: AllocationRow) => { positionCodeToLookup: string } | undefined
}

// ── ヘルパー ─────────────────────────────────────────────────────────────────

const UNSET = '(未設定)'

function byMasterOrder(keys: string[], labels: string[]): string[] {
  const orderMap = new Map(labels.map((l, i) => [l, i]))
  return [...keys].sort((a, b) => {
    if (a === UNSET) return 1
    if (b === UNSET) return -1
    return (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999)
  })
}

function bandLevel(band: string, masters: AllMasters): number {
  return masters.jobLevels.find(e => e.label === band)?.promotionDemotionWarningLevel ?? -1
}

function rowPersonName(row: AllocationRow): string {
  return `${row.lastName ?? ''}${row.firstName ?? ''}`
}

// ── グループ定義 ─────────────────────────────────────────────────────────────

export const COMPACT_GROUP_DEFS: CompactGroupDef[] = [
  // ── バンド（昇降格ウィザード） ───────────────────────────────────────────
  {
    id:         'positionBand',
    label:      'バンド',
    getKey:     row => (row.positionBand as string | undefined) ?? UNSET,
    getPrevKey: row => (row.prevPositionBand as string | undefined) ?? (row.positionBand as string | undefined) ?? UNSET,
    sortKeys: (keys, masters) => {
      const levelMap = new Map(
        masters.jobLevels.map(e => [e.label, e.promotionDemotionWarningLevel ?? -1])
      )
      return [...keys].sort((a, b) => {
        if (a === UNSET) return 1
        if (b === UNSET) return -1
        return (levelMap.get(b) ?? -1) - (levelMap.get(a) ?? -1)  // 降順（高バンドが上）
      })
    },
    dropBehavior: {
      kind: 'band-wizard',
      canDrop: (from, toKey, masters) => {
        const fromBand = from.positionBand as string | undefined
        if (!fromBand || fromBand === toKey) return false
        return bandLevel(fromBand, masters) !== bandLevel(toKey, masters)
      },
      getDef: (from, toKey, masters) => {
        const fromBand = (from.positionBand as string | undefined) ?? ''
        return bandLevel(toKey, masters) > bandLevel(fromBand, masters) ? promotionDef : demotionDef
      },
      buildInitial: (_from, toKey) => ({ positionBand: toKey }),
    },
  },

  // ── 勤務場所（確認ダイアログ） ───────────────────────────────────────────
  {
    id:         'location',
    label:      '勤務場所',
    getKey:     row => (row.location as string | undefined) ?? UNSET,
    getPrevKey: row => (row.prevLocation as string | undefined) ?? (row.location as string | undefined) ?? UNSET,
    sortKeys: (keys, masters) => byMasterOrder(keys, masters.workLocations.map(e => e.label)),
    dropBehavior: {
      kind: 'confirm',
      canDrop: (from, toKey) => (from.location as string | undefined) !== toKey,
      buildCommand: (from, toKey) =>
        new DirectEditOperation(from.rowId, { location: toKey }, `勤務場所変更: ${rowPersonName(from)}`),
      confirmMessage: (from, toKey) =>
        `${rowPersonName(from)} の勤務場所を「${(from.location as string | undefined) ?? '未設定'}」→「${toKey}」に変更しますか？`,
    },
  },

  // ── 役職（昇降格ウィザード・officialPositionCode を pre-fill） ──────────
  {
    id:         'officialPositionCode',
    label:      '役職',
    getKey:     row => (row.officialPositionCode as string | undefined) ?? UNSET,
    getPrevKey: row => (row.prevOfficialPositionCode as string | undefined) ?? (row.officialPositionCode as string | undefined) ?? UNSET,
    sortKeys: (keys, masters) => byMasterOrder(keys, masters.officialPositions.map(e => e.label)),
    /**
     * グループ代表行の positionBand を使ってバンドレベル順（高→低）に並び替える。
     * 同じバンドの役職はマスタ順（byMasterOrder）で決定。
     */
    sortGroupsWithContext: (groups, { masters }) => {
      const levelMap = new Map(
        masters.jobLevels.map(e => [e.label, e.promotionDemotionWarningLevel ?? -1])
      )
      const masterOrder = new Map(masters.officialPositions.map((e, i) => [e.label, i]))
      return [...groups].sort((a, b) => {
        if (a.key === UNSET) return 1
        if (b.key === UNSET) return -1
        const bandA = a.sampleRow.positionBand as string | undefined
        const bandB = b.sampleRow.positionBand as string | undefined
        const lvlA  = bandA ? (levelMap.get(bandA) ?? -1) : -1
        const lvlB  = bandB ? (levelMap.get(bandB) ?? -1) : -1
        if (lvlB !== lvlA) return lvlB - lvlA  // 降順（高バンドが上）
        return (masterOrder.get(a.key) ?? 999) - (masterOrder.get(b.key) ?? 999)
      }).map(g => g.key)
    },
    dropBehavior: {
      kind: 'band-wizard',
      canDrop: (from, toKey) => (from.officialPositionCode as string | undefined) !== toKey,
      getDef: (from, toKey, masters) => {
        // マスタ配列の前 = 上位職とみなして昇降格を判定
        const labels = masters.officialPositions.map(e => e.label)
        const fromIdx = labels.indexOf((from.officialPositionCode as string | undefined) ?? '')
        const toIdx   = labels.indexOf(toKey)
        return (toIdx >= 0 && fromIdx >= 0 && toIdx < fromIdx) ? promotionDef : demotionDef
      },
      buildInitial: (_from, toKey) => ({ officialPositionCode: toKey }),
    },
  },

  // ── ジョブタイプ（照会のみ） ─────────────────────────────────────────────
  {
    id:         'jobType',
    label:      'ジョブタイプ',
    getKey:     row => (row.jobType as string | undefined) ?? UNSET,
    getPrevKey: row => (row.prevJobType as string | undefined) ?? (row.jobType as string | undefined) ?? UNSET,
    sortKeys: (keys, masters) => byMasterOrder(keys, masters.jobTypes.map(e => e.label)),
  },

  // ── コストセンタ（確認ダイアログ） ──────────────────────────────────────
  {
    id:         'costCenter',
    label:      'コストセンタ',
    getKey:     row => (row.costCenter as string | undefined) ?? UNSET,
    getPrevKey: row => (row.prevCostCenter as string | undefined) ?? (row.costCenter as string | undefined) ?? UNSET,
    sortKeys: (keys) => [...keys].sort((a, b) => {
      if (a === UNSET) return 1
      if (b === UNSET) return -1
      return a.localeCompare(b)
    }),
    dropBehavior: {
      kind: 'confirm',
      canDrop: (from, toKey) => (from.costCenter as string | undefined) !== toKey,
      buildCommand: (from, toKey) =>
        new DirectEditOperation(from.rowId, { costCenter: toKey }, `コストセンタ変更: ${rowPersonName(from)}`),
      confirmMessage: (from, toKey) =>
        `${rowPersonName(from)} のコストセンタを「${(from.costCenter as string | undefined) ?? '未設定'}」→「${toKey}」に変更しますか？`,
    },
  },

  // ── 上司（照会のみ・上司の所属組織名を補足表示） ─────────────────────────
  {
    id:         'managerName',
    label:      '上司',
    getKey:     row => (row.managerName as string | undefined) ?? UNSET,
    getPrevKey: row => (row.prevManagerName as string | undefined) ?? (row.managerName as string | undefined) ?? UNSET,
    sortKeys: (keys) => [...keys].sort((a, b) => {
      if (a === UNSET) return 1
      if (b === UNSET) return -1
      return a.localeCompare(b, 'ja')
    }),
    /**
     * 上司グループの順序:
     *   0: 上位階層の上司（パネル組織の祖先 org に所属）
     *   1: 自組織の上司（パネル組織と同じ org）
     *   2: 全く別の組織の上司
     *   3: 上司なし / 解決不能
     * 同ランク内は氏名のかな順。
     */
    sortGroupsWithContext: (groups, { positionCodeToRow, orgById, orgByExternalCode, currentOrgId }) => {
      // パネル組織の祖先 orgId セットを構築
      const ancestorIds = new Set<string>()
      let cur = orgById.get(currentOrgId)
      while (cur?.parentId) {
        cur = orgById.get(cur.parentId)
        if (cur) ancestorIds.add(cur.id)
      }

      const rankOf = (sampleRow: AllocationRow): number => {
        if ((sampleRow.managerName as string | undefined) === undefined) return 3
        const pc = sampleRow.managerPositionCode as string | undefined
        if (!pc) return 3
        const managerRow = positionCodeToRow.get(pc)
        if (!managerRow) return 3
        const deptCode = managerRow.departmentCode as string | undefined
        if (!deptCode) return 3
        const managerOrg = orgByExternalCode.get(deptCode)
        if (!managerOrg) return 3
        if (ancestorIds.has(managerOrg.id)) return 0  // 上位階層
        if (managerOrg.id === currentOrgId)  return 1  // 自組織
        return 2                                        // 別組織
      }

      return [...groups]
        .sort((a, b) => {
          if (a.key === UNSET) return 1
          if (b.key === UNSET) return -1
          const dr = rankOf(a.sampleRow) - rankOf(b.sampleRow)
          return dr !== 0 ? dr : a.key.localeCompare(b.key, 'ja')
        })
        .map(g => g.key)
    },
    dropBehavior: {
      kind: 'confirm',
      canDrop: (from, toKey) =>
        (from.managerName as string | undefined) !== toKey && toKey !== UNSET,
      buildCommand: (from, toKey, groupSample) => {
        // groupSample はドロップ先グループの代表行。その managerPositionCode が目標上司の positionCode
        const newPositionCode = groupSample?.managerPositionCode as string | undefined
        return new DirectEditOperation(
          from.rowId,
          { managerName: toKey, managerPositionCode: newPositionCode },
          `上司変更: ${rowPersonName(from)} → ${toKey}`,
        )
      },
      confirmMessage: (from, toKey) =>
        `${rowPersonName(from)} の上司を「${(from.managerName as string | undefined) ?? '未設定'}」→「${toKey}」に変更しますか？`,
    },
    resolveSubLabel: (_key, sampleRow) => {
      const pc = sampleRow.managerPositionCode as string | undefined
      return pc ? { positionCodeToLookup: pc } : undefined
    },
  },

  // ── 本務/兼務（照会のみ） ───────────────────────────────────────────────
  {
    id:         'concurrentType',
    label:      '本務/兼務',
    getKey:     row => (row.concurrentType as string | undefined) ?? '本務',
    getPrevKey: row => (row.prevConcurrentType as string | undefined) ?? (row.concurrentType as string | undefined) ?? '本務',
    sortKeys: (keys) => {
      const order: Record<string, number> = { '本務': 0, '兼務': 1 }
      return [...keys].sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99))
    },
  },
]

export const DEFAULT_COMPACT_GROUP_ID = 'positionBand'
