import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists } from '../codeLists/aggregate'

export type EditPattern =
  // 職務情報系
  | 'promotion'
  | 'demotion'
  | 'titleChange'
  | 'jobTypeChange'
  | 'employmentExtension'
  // ポジション系
  | 'orgTransfer'
  | 'orgRestructure'
  | 'managerChange'
  | 'concurrentAdd'
  | 'concurrentRelease'
  // 出向系（本務）
  | 'secondmentOut'
  | 'secondmentIn'
  | 'secondmentOutRelease'
  | 'secondmentInRelease'
  // 出向系（兼務）
  | 'concurrentSecondmentOut'
  | 'concurrentSecondmentIn'
  | 'concurrentSecondmentOutRelease'
  | 'concurrentSecondmentInRelease'
  // 人操作系
  | 'leaveOfAbsence'
  | 'returnFromLeave'
  | 'employmentTransferOut'
  | 'employmentTransferIn'
  | 'noChange'
  // 既存（後方互換）
  | 'resignation'
  | 'vacantPositionMove'

export interface EditPatternMeta {
  label:      string
  addLabel:   string
  editLabel:  string
  badgeColor: string
  group:      'jobClassification' | 'position' | 'person' | 'legacy'
  /** メニューバッジ用の短縮ラベル（省略時は label を使用） */
  menuLabel?: string
  /**
   * この操作が対象行に対して追加可能かどうか（available リストのゲート）。
   * undefined = 常に available。
   * active 判定（変更検出済み）には影響しない。
   */
  availableFor?: (row: AllocationRow, codeLists: AllCodeLists) => boolean
}

function isOutsource(row: AllocationRow, cl: AllCodeLists): boolean {
  const et = row.employmentType as string | undefined
  if (!et) return false
  const entry = cl.employmentTypes.find(e => e.label === et || e.code === et)
  return entry?.isSecondmentAcceptance ?? false
}

export const ALL_EDIT_PATTERNS: EditPattern[] = [
  'promotion', 'demotion', 'titleChange', 'jobTypeChange', 'employmentExtension',
  'orgTransfer', 'orgRestructure', 'managerChange', 'concurrentAdd', 'concurrentRelease',
  'secondmentOut', 'secondmentIn', 'secondmentOutRelease', 'secondmentInRelease',
  'concurrentSecondmentOut', 'concurrentSecondmentIn',
  'concurrentSecondmentOutRelease', 'concurrentSecondmentInRelease',
  'leaveOfAbsence', 'returnFromLeave',
  'employmentTransferOut', 'employmentTransferIn', 'noChange',
  'resignation', 'vacantPositionMove',
]

// ── 4色の意味 ─────────────────────────────────────────────────────────────────
// 緑  = ポジティブ方向（昇格・復職・移籍入）
// 青  = 中立変更・移動（異動・出向追加・兼務追加・職務変更・組織改変）
// 赤  = 解除・離脱・ネガティブ（各解除・降格・退職・移籍出・休職）
// グレー = 変化なし（変更なし）

const C_GREEN = 'bg-green-100 text-green-700'
const C_BLUE  = 'bg-blue-100 text-blue-700'
const C_RED   = 'bg-red-100 text-red-600'
const C_GRAY  = 'bg-gray-100 text-gray-500'

export const EDIT_PATTERN_META: Record<EditPattern, EditPatternMeta> = {
  // ── 昇降格・役職変更 ──────────────────────────────────────────────────────────
  promotion: {
    label: '昇格', addLabel: '昇格', editLabel: '昇格',
    badgeColor: C_GREEN, group: 'jobClassification',
    availableFor: (row, cl) => !isOutsource(row, cl),
  },
  demotion: {
    label: '降格', addLabel: '降格', editLabel: '降格',
    badgeColor: C_RED, group: 'jobClassification',
    availableFor: (row, cl) => !isOutsource(row, cl),
  },
  titleChange: {
    label: '役職変更（昇降格なし）', addLabel: '役職変更', editLabel: '役職変更',
    menuLabel: '役職変更',
    badgeColor: C_BLUE, group: 'jobClassification',
  },
  // ── 職務内容・雇用形態 ─────────────────────────────────────────────────────────
  jobTypeChange: {
    label: 'ジョブタイプ変更', addLabel: 'ジョブタイプ変更', editLabel: 'ジョブタイプ変更',
    menuLabel: '職種変更',
    badgeColor: C_BLUE, group: 'jobClassification',
    availableFor: (row, cl) => !isOutsource(row, cl),
  },
  employmentExtension: {
    label: '雇用延長', addLabel: '雇用延長', editLabel: '雇用延長',
    badgeColor: C_BLUE, group: 'jobClassification',
  },
  // ── 組織異動 ──────────────────────────────────────────────────────────────────
  orgTransfer: {
    label: '社内異動', addLabel: '社内異動', editLabel: '社内異動',
    badgeColor: C_BLUE, group: 'position',
    availableFor: (row, cl) => !isOutsource(row, cl),
  },
  orgRestructure: {
    label: '組織改変', addLabel: '組織改変', editLabel: '組織改変',
    badgeColor: C_BLUE, group: 'position',
  },
  managerChange: {
    label: '上司変更', addLabel: '上司変更', editLabel: '上司変更',
    badgeColor: C_BLUE, group: 'position',
    availableFor: (row) => !!row.positionCode,
  },
  // ── 兼務 ──────────────────────────────────────────────────────────────────────
  concurrentAdd: {
    label: '社内兼務追加', addLabel: '社内兼務追加', editLabel: '社内兼務追加',
    menuLabel: '兼務追加',
    badgeColor: C_BLUE, group: 'position',
    availableFor: (row) => !!row.userId && row.concurrentType !== '兼務',
  },
  concurrentRelease: {
    label: '社内兼務解除', addLabel: '社内兼務解除', editLabel: '社内兼務解除',
    menuLabel: '兼務解除',
    badgeColor: C_RED, group: 'position',
    availableFor: (row) =>
      row.concurrentType === '兼務' && !row.secondmentToCompany && !row.secondmentFromCompany,
  },
  // ── 出向（本務） ──────────────────────────────────────────────────────────────
  secondmentOut: {
    label: '本務出向', addLabel: '本務出向', editLabel: '本務出向',
    badgeColor: C_BLUE, group: 'person',
    availableFor: (row, cl) => !isOutsource(row, cl) && row.concurrentType !== '兼務',
  },
  secondmentIn: {
    label: '本務出向受入', addLabel: '本務出向受入', editLabel: '本務出向受入',
    menuLabel: '出向受入',
    badgeColor: C_BLUE, group: 'person',
    availableFor: (row) => row.concurrentType !== '兼務',
  },
  secondmentOutRelease: {
    label: '本務出向解除', addLabel: '本務出向解除', editLabel: '本務出向解除',
    menuLabel: '出向解除',
    badgeColor: C_RED, group: 'person',
    availableFor: (row) => !!(row.prevSecondmentToCompany as string | undefined),
  },
  secondmentInRelease: {
    label: '本務出向受入解除', addLabel: '本務出向受入解除', editLabel: '本務出向受入解除',
    menuLabel: '受入解除',
    badgeColor: C_RED, group: 'person',
    availableFor: (row) => !!(row.prevSecondmentFromCompany as string | undefined),
  },
  // ── 出向（兼務） ──────────────────────────────────────────────────────────────
  concurrentSecondmentOut: {
    label: '兼務出向', addLabel: '兼務出向', editLabel: '兼務出向',
    badgeColor: C_BLUE, group: 'person',
    availableFor: (row) => row.concurrentType !== '兼務',
  },
  concurrentSecondmentIn: {
    label: '兼務出向受入', addLabel: '兼務出向受入', editLabel: '兼務出向受入',
    menuLabel: '兼務受入',
    badgeColor: C_BLUE, group: 'person',
    availableFor: (row) => row.concurrentType !== '兼務',
  },
  concurrentSecondmentOutRelease: {
    label: '兼務出向解除', addLabel: '兼務出向解除', editLabel: '兼務出向解除',
    badgeColor: C_RED, group: 'person',
    availableFor: (row) => row.concurrentType === '兼務' && !!row.secondmentToCompany,
  },
  concurrentSecondmentInRelease: {
    label: '兼務出向受入解除', addLabel: '兼務出向受入解除', editLabel: '兼務出向受入解除',
    menuLabel: '兼務受入解除',
    badgeColor: C_RED, group: 'person',
    availableFor: (row) => row.concurrentType === '兼務' && !!row.secondmentFromCompany,
  },
  // ── 在籍状況・退職 ────────────────────────────────────────────────────────────
  leaveOfAbsence: {
    label: '休職', addLabel: '休職', editLabel: '休職',
    badgeColor: C_RED, group: 'person',
    availableFor: (row) => !!row.userId && !row.leaveFlag,
  },
  returnFromLeave: {
    label: '復職', addLabel: '復職', editLabel: '復職',
    badgeColor: C_GREEN, group: 'person',
    availableFor: (row) => !!row.leaveFlag,
  },
  employmentTransferOut: {
    label: '移籍（出る）', addLabel: '移籍（出る）', editLabel: '移籍（出る）',
    menuLabel: '移籍（出）',
    badgeColor: C_RED, group: 'person',
    availableFor: (row) => !!row.userId,
  },
  employmentTransferIn: {
    label: '移籍（入る）', addLabel: '移籍（入る）', editLabel: '移籍（入る）',
    menuLabel: '移籍（入）',
    badgeColor: C_GREEN, group: 'person',
    availableFor: (row) => !row.prevDepartmentCode,
  },
  noChange: {
    label: '変更なし', addLabel: '変更なし', editLabel: '変更なし',
    badgeColor: C_GRAY, group: 'person',
  },
  resignation: {
    label: '退職', addLabel: '退職', editLabel: '退職',
    badgeColor: C_RED, group: 'legacy',
    availableFor: (row, cl) => !isOutsource(row, cl),
  },
  vacantPositionMove: {
    label: 'ポジション異動', addLabel: 'ポジション異動', editLabel: 'ポジション異動',
    menuLabel: '席異動',
    badgeColor: C_BLUE, group: 'legacy',
    availableFor: (row, cl) => !isOutsource(row, cl),
  },
}
