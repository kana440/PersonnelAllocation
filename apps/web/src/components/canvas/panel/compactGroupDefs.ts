import type { AllocationRow }  from '@personnel/domain/allocationRow'
import type { AllMasters }     from '@personnel/domain/masters/aggregate'
import type { EditCommand }    from '@personnel/domain/commands/types'
import type { EditOperation }  from '@personnel/domain/commands/defs/index'
import { DirectEditOperation } from '@personnel/domain/commands/handlers/directEdit'
import { promotionDef, demotionDef, mpTrackSwitchDef, titleChangeDef } from '@personnel/domain/commands/defs/promotionDefs'
import { jobTypeChangeDef } from '@personnel/domain/commands/defs/employmentTypeDefs'

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
      confirmMessage: (from: AllocationRow, toKey: string, groupSample?: AllocationRow) => string
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
   * 例: positionBand・役職・バンド／役職統合
   * groupSample: ドロップ先グループの代表行。合成キー（例: バンド／役職）から実際の値を
   * 引き当てたい場合に使う（省略可能。confirm と同じ考え方）。
   */
  | {
      kind:         'band-wizard'
      canDrop:      (from: AllocationRow, toKey: string, masters: AllMasters, groupSample?: AllocationRow) => boolean
      getDef:       (from: AllocationRow, toKey: string, masters: AllMasters, groupSample?: AllocationRow) => EditOperation
      buildInitial: (from: AllocationRow, toKey: string, masters: AllMasters, groupSample?: AllocationRow) => Partial<AllocationRow>
    }

// ── CompactGroupDef 型 ───────────────────────────────────────────────────────

export interface CompactGroupDef {
  id:            string
  label:         string
  /** AllocationRow からグループキーを取り出す（after 状態） */
  getKey:        (row: AllocationRow) => string
  /** AllocationRow からグループキーを取り出す（before/prev 状態。省略時は getKey にフォールバック） */
  getPrevKey?:   (row: AllocationRow) => string
  /** グループ間ドラッグ&ドロップの挙動。省略時はドロップ不可（照会のみ） */
  dropBehavior?: CompactGroupDropBehavior
  /**
   * グループヘッダーに補足ラベルを表示する場合に設定。
   * positionCodeToLookup を返すと BandMatrixPanel がその positionCode の行を allocationList から検索し
   * 所属組織名を括弧付きで表示する。（例: 上司グループ → 上司の所属組織名）
   */
  resolveSubLabel?: (key: string, sampleRow: AllocationRow) => { positionCodeToLookup: string } | undefined
  /**
   * グループヘッダーに表示するラベルを getKey/getPrevKey の結果から整形する（省略時は key をそのまま表示）。
   * usePrev=true のときは before（prev）側の表示なので、sampleRow の prevXxx フィールドを参照すること。
   * 例: 上司別グループは managerPositionCode をキーにしつつ、見出しには「上司名（ポジションコード）」を出す。
   */
  formatGroupLabel?: (key: string, sampleRow: AllocationRow, usePrev: boolean) => string
}

// ── ヘルパー ─────────────────────────────────────────────────────────────────

const UNSET = '(未設定)'

function bandLevel(band: string, masters: AllMasters): number {
  return masters.jobLevels.find(e => e.label === band)?.promotionDemotionWarningLevel ?? -1
}

/** 役職の優先度。masters.officialPositions 配列の先頭ほど上位とみなし、大きい値ほど上位になるよう反転する */
function roleRank(role: string | undefined, masters: AllMasters): number {
  if (!role) return -1
  const idx = masters.officialPositions.findIndex(e => e.label === role)
  return idx >= 0 ? masters.officialPositions.length - idx : -1
}

function rowPersonName(row: AllocationRow): string {
  return `${row.lastName ?? ''}${row.firstName ?? ''}`
}

/** バンド・役職統合グループのキー整形（役職未設定ならバンドのみ） */
function bandRoleKey(band: string | undefined, role: string | undefined): string {
  const b = band ?? UNSET
  return role ? `${b}・${role}` : b
}

/** JF・JT統合グループのキー整形（階層化はせずフラットな組み合わせキーにする） */
function jobFamilyTypeKey(jobFamily: string | undefined, jobType: string | undefined): string {
  const jf = jobFamily ?? UNSET
  return jobType ? `${jf}・${jobType}` : jf
}

type BandRoleDropKind = 'promotion' | 'demotion' | 'mpTrackSwitch' | 'titleChange'

/**
 * バンド・役職グループへのドラッグ先を、実際の昇降格判定（jobClassification.ts の
 * classifyBandTitle と同じ考え方）に沿って分類する。ドロップ時に開くウィザードの選択に使う。
 *   1. バンドの警告レベルが変化 → 昇格/降格
 *   2. バンドは変わるが警告レベルは同じ（promotionDemotionBand が同一）→ M職P職切替
 *   3. バンドは同じで役職のみ変化 → マスタ順で明確に上下が分かれば昇格/降格、そうでなければ役職名変更
 *   4. どちらも同じ → 役職名変更（フリータイトルのみの変更として扱う）
 */
function classifyBandRoleDrop(
  from:        AllocationRow,
  groupSample: AllocationRow | undefined,
  masters:     AllMasters,
): BandRoleDropKind {
  const fromBand = (from.positionBand as string | undefined) ?? ''
  const toBand   = (groupSample?.positionBand as string | undefined) ?? fromBand

  if (fromBand !== toBand) {
    const fromLevel = bandLevel(fromBand, masters)
    const toLevel   = bandLevel(toBand, masters)
    if (fromLevel !== toLevel) return toLevel > fromLevel ? 'promotion' : 'demotion'

    const fromEntry = masters.jobLevels.find(e => e.label === fromBand)
    const toEntry   = masters.jobLevels.find(e => e.label === toBand)
    if (fromEntry?.promotionDemotionBand && fromEntry.promotionDemotionBand === toEntry?.promotionDemotionBand) {
      return 'mpTrackSwitch'
    }
  }

  const fromRole = from.officialPositionCode as string | undefined
  const toRole   = groupSample?.officialPositionCode as string | undefined
  if (fromRole !== toRole) {
    const labels  = masters.officialPositions.map(e => e.label)
    const fromIdx = labels.indexOf(fromRole ?? '')
    const toIdx   = labels.indexOf(toRole ?? '')
    if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) return toIdx < fromIdx ? 'promotion' : 'demotion'
  }

  return 'titleChange'
}

/**
 * 全グループ共通の並び順ルール（グループ化の軸に関わらず統一）:
 *   1. ライン長（パネル組織内で自分より上の管理職がその組織内に存在しないポジション。
 *      topPositionCodeOfOrg と同じ定義）を含むグループが先頭
 *   2. グループ内のポジションのバンド等級の MAX 値が高い順
 *   3. バンドが同順位のときは役職（masters.officialPositions 配列順）の MAX が高い順
 *   4. (未設定) は常に末尾
 */
export function sortGroupsByLineAndBand(
  groups:           ReadonlyArray<{ key: string; rows: AllocationRow[] }>,
  masters:          AllMasters,
  linePositionCode: string | undefined,
): string[] {
  const maxBandLevel = (rows: AllocationRow[]): number =>
    rows.reduce((max, r) => Math.max(max, bandLevel((r.positionBand as string | undefined) ?? '', masters)), -1)
  const maxRoleRank = (rows: AllocationRow[]): number =>
    rows.reduce((max, r) => Math.max(max, roleRank(r.officialPositionCode as string | undefined, masters)), -1)

  const hasLine = (rows: AllocationRow[]): boolean =>
    !!linePositionCode && rows.some(r => r.positionCode === linePositionCode)

  return [...groups]
    .sort((a, b) => {
      if (a.key === UNSET) return 1
      if (b.key === UNSET) return -1
      const lineA = hasLine(a.rows)
      const lineB = hasLine(b.rows)
      if (lineA !== lineB) return lineA ? -1 : 1
      const bandDiff = maxBandLevel(b.rows) - maxBandLevel(a.rows)
      if (bandDiff !== 0) return bandDiff
      return maxRoleRank(b.rows) - maxRoleRank(a.rows)
    })
    .map(g => g.key)
}

// ── グループ定義 ─────────────────────────────────────────────────────────────

export const COMPACT_GROUP_DEFS: CompactGroupDef[] = [
  // ── バンド・役職（統合・昇降格ウィザード） ─────────────────────────────
  // バンドと役職はいずれも昇降格・MP転換に関連するグループ軸のため1つに統合する。
  // キーは「バンド・役職」の組み合わせ（役職未設定ならバンドのみ）。
  {
    id:         'bandRole',
    label:      'バンド・役職',
    getKey:     row => bandRoleKey(row.positionBand as string | undefined, row.officialPositionCode as string | undefined),
    getPrevKey: row => bandRoleKey(
      (row.prevPositionBand as string | undefined) ?? (row.positionBand as string | undefined),
      (row.prevOfficialPositionCode as string | undefined) ?? (row.officialPositionCode as string | undefined),
    ),
    // グループ名が長くなりがちなので2行表示にする（\n を whitespace-pre-line で改行）。
    // 役職名はフリータイトルがあればそちらを優先し、なければ役職（officialPositionCode）を使う。
    formatGroupLabel: (_key, sampleRow, usePrev) => {
      const band = usePrev
        ? (sampleRow.prevPositionBand as string | undefined) ?? (sampleRow.positionBand as string | undefined)
        : (sampleRow.positionBand as string | undefined)
      const officialPosition = usePrev
        ? (sampleRow.prevOfficialPositionCode as string | undefined) ?? (sampleRow.officialPositionCode as string | undefined)
        : (sampleRow.officialPositionCode as string | undefined)
      const localTitle = usePrev
        ? (sampleRow.prevLocalJobTitle as string | undefined) ?? (sampleRow.localJobTitle as string | undefined)
        : (sampleRow.localJobTitle as string | undefined)
      const roleName = localTitle || officialPosition
      return `バンド：${band ?? UNSET}\n役職名：${roleName ?? UNSET}`
    },
    dropBehavior: {
      kind: 'band-wizard',
      canDrop: (from, _toKey, _masters, groupSample) => {
        if (!groupSample) return false
        const fromBand = from.positionBand as string | undefined
        const toBand   = groupSample.positionBand as string | undefined
        if (!fromBand || !toBand) return false
        const fromRole = from.officialPositionCode as string | undefined
        const toRole   = groupSample.officialPositionCode as string | undefined
        return fromBand !== toBand || fromRole !== toRole
      },
      // 昇格/降格だけでなく、警告レベルが同じバンド変化は M職P職切替、バンドが同じで役職のみの
      // 変化かつマスタ順で上下が判定できない場合は役職名変更、というように4種を判定する
      // （jobClassification.ts の classifyBandTitle と同じ考え方。既存の実データで降格ばかり
      // 出ていたのは、この判定がなく全て昇格/降格の二択に押し込められていたため）。
      getDef: (from, _toKey, masters, groupSample) => {
        const kind = classifyBandRoleDrop(from, groupSample, masters)
        if (kind === 'promotion')     return promotionDef
        if (kind === 'demotion')      return demotionDef
        if (kind === 'mpTrackSwitch') return mpTrackSwitchDef
        return titleChangeDef
      },
      buildInitial: (from, _toKey, masters, groupSample) => {
        const kind = classifyBandRoleDrop(from, groupSample, masters)
        if (kind === 'titleChange') {
          return {
            officialPositionCode: groupSample?.officialPositionCode as string | undefined,
            localJobTitle:        groupSample?.localJobTitle as string | undefined,
          }
        }
        if (kind === 'mpTrackSwitch') {
          return {
            band:                 groupSample?.positionBand as string | undefined,
            officialPositionCode: groupSample?.officialPositionCode as string | undefined,
          }
        }
        return {
          positionBand:         groupSample?.positionBand as string | undefined,
          officialPositionCode: groupSample?.officialPositionCode as string | undefined,
        }
      },
    },
  },

  // ── JF・JT（照会のみ・階層化はせずフラットな組み合わせで表示） ───────────
  {
    id:         'jobType',
    label:      'JF・JT',
    getKey:     row => jobFamilyTypeKey(row.jobFamily as string | undefined, row.jobType as string | undefined),
    getPrevKey: row => jobFamilyTypeKey(
      (row.prevJobFamily as string | undefined) ?? (row.jobFamily as string | undefined),
      (row.prevJobType as string | undefined) ?? (row.jobType as string | undefined),
    ),
    // グループ名が長くなりがちなので2行表示にする（\n を whitespace-pre-line で改行）
    formatGroupLabel: (_key, sampleRow, usePrev) => {
      const jf = usePrev
        ? (sampleRow.prevJobFamily as string | undefined) ?? (sampleRow.jobFamily as string | undefined)
        : (sampleRow.jobFamily as string | undefined)
      const jt = usePrev
        ? (sampleRow.prevJobType as string | undefined) ?? (sampleRow.jobType as string | undefined)
        : (sampleRow.jobType as string | undefined)
      return `JF:${jf ?? UNSET}\nJT:${jt ?? UNSET}`
    },
    dropBehavior: {
      kind: 'band-wizard',
      canDrop: (from, _toKey, _masters, groupSample) => {
        if (!groupSample) return false
        const fromJf = from.jobFamily as string | undefined
        const toJf   = groupSample.jobFamily as string | undefined
        const fromJt = from.jobType as string | undefined
        const toJt   = groupSample.jobType as string | undefined
        return fromJf !== toJf || fromJt !== toJt
      },
      getDef: () => jobTypeChangeDef,
      buildInitial: (_from, _toKey, _masters, groupSample) => ({
        jobFamily: groupSample?.jobFamily as string | undefined,
        jobType:   groupSample?.jobType as string | undefined,
      }),
    },
  },

  // ── 上司（照会のみ・上司のポジションコードでグルーピングし、上司の所属組織名を補足表示） ──
  // 上司名は表記ゆれ・同姓同名の可能性があるため、キーは managerPositionCode（一意な識別子）にし、
  // 見出しには上司名とポジションコードの両方を表示する。
  {
    id:         'managerName',
    label:      '上司',
    getKey:     row => (row.managerPositionCode as string | undefined) ?? UNSET,
    getPrevKey: row => (row.prevManagerPositionCode as string | undefined) ?? (row.managerPositionCode as string | undefined) ?? UNSET,
    formatGroupLabel: (key, sampleRow, usePrev) => {
      if (key === UNSET) return UNSET
      const name = usePrev
        ? (sampleRow.prevManagerName as string | undefined) ?? (sampleRow.managerName as string | undefined)
        : (sampleRow.managerName as string | undefined)
      return name ? `${name}（${key}）` : key
    },
    dropBehavior: {
      kind: 'confirm',
      canDrop: (from, toKey) =>
        (from.managerPositionCode as string | undefined) !== toKey && toKey !== UNSET,
      buildCommand: (from, toKey, groupSample) => {
        // groupSample はドロップ先グループの代表行。その managerName が目標上司の氏名
        const newManagerName = groupSample?.managerName as string | undefined
        return new DirectEditOperation(
          from.rowId,
          { managerPositionCode: toKey, managerName: newManagerName },
          `上司変更: ${rowPersonName(from)} → ${newManagerName ?? toKey}`,
        )
      },
      confirmMessage: (from, toKey, groupSample) => {
        const newName = (groupSample?.managerName as string | undefined) ?? toKey
        const oldName = (from.managerName as string | undefined) ?? '未設定'
        return `${rowPersonName(from)} の上司を「${oldName}」→「${newName}」に変更しますか？`
      },
    },
    resolveSubLabel: (_key, sampleRow) => {
      const pc = sampleRow.managerPositionCode as string | undefined
      return pc ? { positionCodeToLookup: pc } : undefined
    },
  },

  // ── 勤務場所（確認ダイアログ） ───────────────────────────────────────────
  {
    id:         'location',
    label:      '勤務場所',
    getKey:     row => (row.location as string | undefined) ?? UNSET,
    getPrevKey: row => (row.prevLocation as string | undefined) ?? (row.location as string | undefined) ?? UNSET,
    dropBehavior: {
      kind: 'confirm',
      canDrop: (from, toKey) => (from.location as string | undefined) !== toKey,
      buildCommand: (from, toKey) =>
        new DirectEditOperation(from.rowId, { location: toKey }, `勤務場所変更: ${rowPersonName(from)}`),
      confirmMessage: (from, toKey) =>
        `${rowPersonName(from)} の勤務場所を「${(from.location as string | undefined) ?? '未設定'}」→「${toKey}」に変更しますか？`,
    },
  },

  // ── コストセンタ（確認ダイアログ） ──────────────────────────────────────
  {
    id:         'costCenter',
    label:      'コストセンタ',
    getKey:     row => (row.costCenter as string | undefined) ?? UNSET,
    getPrevKey: row => (row.prevCostCenter as string | undefined) ?? (row.costCenter as string | undefined) ?? UNSET,
    dropBehavior: {
      kind: 'confirm',
      canDrop: (from, toKey) => (from.costCenter as string | undefined) !== toKey,
      buildCommand: (from, toKey) =>
        new DirectEditOperation(from.rowId, { costCenter: toKey }, `コストセンタ変更: ${rowPersonName(from)}`),
      confirmMessage: (from, toKey) =>
        `${rowPersonName(from)} のコストセンタを「${(from.costCenter as string | undefined) ?? '未設定'}」→「${toKey}」に変更しますか？`,
    },
  },

  // ── 本務/兼務（照会のみ） ───────────────────────────────────────────────
  {
    id:         'concurrentType',
    label:      '本務/兼務',
    getKey:     row => (row.concurrentType as string | undefined) ?? '本務',
    getPrevKey: row => (row.prevConcurrentType as string | undefined) ?? (row.concurrentType as string | undefined) ?? '本務',
  },

  // ── 社員タイプ（照会のみ）───────────────────────────────────────────────
  // カードの色分けにも使われているが色の凡例がないため、グループ化でも確認できるようにする
  {
    id:         'employmentType',
    label:      '社員タイプ',
    getKey:     row => (row.employmentType as string | undefined) ?? UNSET,
    getPrevKey: row => (row.prevEmploymentType as string | undefined) ?? (row.employmentType as string | undefined) ?? UNSET,
  },
]

export const DEFAULT_COMPACT_GROUP_ID = 'bandRole'
