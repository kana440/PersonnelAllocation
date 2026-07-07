import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../../../store/useStore'
import { rowDiff, type AllocationRow } from '@personnel/domain/allocationRow'
import { ALLOCATION_LIST_LABEL_MAP } from '@personnel/domain/csvImport/allocationList/labels'
import { ALL_EDIT_OPERATIONS, ALL_MULTI_ROW_OPERATION_DEFS, resolveAvailability } from '@personnel/domain/commands/defs/index'
import { OPERATION_BADGE_COLORS } from '../../../config/badgeColors'
import { useUnavailableOperationDisplay } from '../../../hooks/useFieldStrictness'
import { detectPatterns } from '@personnel/domain/patterns/detection'
import { validateRow } from '@personnel/domain/rules/validate/validateRow'
import { resolveIssueMeta } from '@personnel/domain/rules/validate/issueTypeMeta'
import { PATTERN_COLOR_MAP, PATTERN_LABEL_MAP } from '../../common/patternChips'

const FIELD_LEVEL_IDS = new Set(['field_constraint', 'field_constraint_conditional'])
import { useDisplayPreferenceStore } from '../../../store/displayPreferenceStore'
import type { PanelView } from './types'

// ── セクションエントリ型 ──────────────────────────────────────────────────────
// id          : EditOperation の id（単一行操作）
// multiRowId  : MultiRowOperationDef の id（複数行操作）
// directEdit  : 「全項目を直接編集」プレースホルダー
// どちらかを持つ排他的ユニオン

type SectionEntry =
  | { id:         string; shortLabel: string; cancel?: boolean }
  | { multiRowId: string; shortLabel: string; cancel?: boolean }
  | { chooser:    'secondmentOut' | 'concurrentSecondmentOut'; shortLabel: string }

type Section =
  | { label: string; ops: SectionEntry[] }
  | { directEdit: true }

// ── セクション定義 ────────────────────────────────────────────────────────────
// セクション分けは command def ファイル（= pattern グループ）に対応させる。
// MultiRowOperationDef を追加するときは multiRowId: '...' で記載する。
const SECTIONS: Section[] = [
  // ── promotionDefs ──────────────────────────────────────────────────────────
  {
    label: '昇降格・役職変更',
    ops: [
      { id: 'Promotion',     shortLabel: '昇格' },
      { id: 'Demotion',      shortLabel: '降格' },
      { id: 'TitleChange',   shortLabel: '役職名変更' },
      { id: 'MpTrackSwitch', shortLabel: 'M職/P職\n切替' },
    ],
  },
  // ── employmentTypeDefs ─────────────────────────────────────────────────────
  {
    label: '職務内容・雇用形態',
    ops: [
      { id: 'JobTypeChange',             shortLabel: '職種変更' },
      { id: 'EmploymentExtension',       shortLabel: '雇用延長' },
      { id: 'EmploymentExtensionCancel', shortLabel: '雇用延長\n取消',     cancel: true },
      { id: 'EmploymentTypeChange',      shortLabel: '雇用タイプ\n変更' },
    ],
  },
  // ── orgTransferDefs ────────────────────────────────────────────────────────
  {
    label: '組織への異動',
    ops: [
      { id: 'OrgTransfer',    shortLabel: '異動' },
      { id: 'OrgRestructure', shortLabel: '異動（組改）' },
    ],
  },
  // ── positionAddDef / positionMoveDefs ────────────────────────────────────
  {
    label: 'ポジション',
    ops: [
      { id: 'ManagerChange',        shortLabel: '上司変更' },
      { id: 'AddEmptyPosition',     shortLabel: '新規Pos\n追加' },
      { id: 'SubordinateHandoff',   shortLabel: '部下\n引継・統合' },
      { id: 'MoveToVacantPosition', shortLabel: '空Posへ\n移動' },
    ],
  },
  // ── concurrentDefs ─────────────────────────────────────────────────────────
  {
    label: '社内兼務',
    ops: [
      { id: 'ConcurrentAdd',       shortLabel: '兼務追加' },
      { id: 'ConcurrentAddNew',    shortLabel: '新規兼務\n追加' },
      { id: 'ConcurrentAddCancel', shortLabel: '兼務追加\n取消', cancel: true },
      { id: 'ConcurrentRelease',   shortLabel: '兼務解除' },
    ],
  },
  // ── personDefs ─────────────────────────────────────────────────────────────
  {
    label: '在籍・退職',
    ops: [
      { id: 'LeaveOfAbsence',           shortLabel: '休職' },
      { id: 'LeaveOfAbsenceCancel',     shortLabel: '休職取消',       cancel: true },
      { id: 'ReturnFromLeave',          shortLabel: '復職' },
      { id: 'ReturnFromLeaveCancel',    shortLabel: '復職取消',       cancel: true },
      { id: 'Resignation',              shortLabel: '退職' },
      { id: 'ResignationCancel',        shortLabel: '退職取消',       cancel: true },
      { id: 'EmploymentTransfer',       shortLabel: '移籍' },
      { id: 'EmploymentTransferCancel', shortLabel: '移籍取消',       cancel: true },
      { id: 'NoChange',                 shortLabel: '変更なし' },
      { id: 'NoChangeCancel',           shortLabel: '変更なし\n取消', cancel: true },
    ],
  },
  { directEdit: true },
  // ── secondmentMainDefs ─────────────────────────────────────────────────────
  {
    label: '本務出向',
    ops: [
      { chooser: 'secondmentOut',             shortLabel: '本務出向' },
      { id: 'SecondmentInNew',                shortLabel: '本務\n受入追加' },
      { id: 'SecondmentOutReleaseSF',         shortLabel: 'SF\n本務出向解除' },
      { id: 'SecondmentOutReleaseNonSF',      shortLabel: 'SF外\n本務出向解除' },
      { multiRowId: 'NonSFSecondmentRelease', shortLabel: 'SF外\n出向解除' },
      { multiRowId: 'NonSFSecondmentCancel',  shortLabel: 'SF外出向\n取消',   cancel: true },
      { id: 'SecondmentInReleaseSF',          shortLabel: 'SF\n本務受入解除' },
      { id: 'SecondmentInReleaseNonSF',       shortLabel: 'SF外\n本務受入解除' },
      { id: 'SecondmentInCancel',             shortLabel: '本務受入\n取消',   cancel: true },
    ],
  },
  // ── secondmentConcurrentDefs ───────────────────────────────────────────────
  {
    label: '兼務出向',
    ops: [
      { chooser: 'concurrentSecondmentOut',        shortLabel: '兼務出向' },
      { id: 'ConcurrentSecondmentInNew',           shortLabel: '兼務\n受入追加' },
      { id: 'ConcurrentSecondmentOutReleaseSF',    shortLabel: 'SF\n兼務出向解除' },
      { id: 'ConcurrentSecondmentOutReleaseNonSF', shortLabel: 'SF外\n兼務出向解除' },
      { id: 'ConcurrentSecondmentInReleaseSF',     shortLabel: 'SF\n兼務受入解除' },
      { id: 'ConcurrentSecondmentInReleaseNonSF',  shortLabel: 'SF外\n兼務受入解除' },
      { id: 'ConcurrentSecondmentInCancel',        shortLabel: '兼務受入\n取消',   cancel: true },
    ],
  },
  // ── リセット ───────────────────────────────────────────────────────────────
  {
    label: 'リセット',
    ops: [
      { id: 'ResetToBefore', shortLabel: '割当\nリセット' },
    ],
  },
]

const COLOR_AVAILABLE   = 'bg-blue-100 text-blue-700'
const COLOR_CANCEL      = 'bg-red-100 text-red-600'
const COLOR_UNAVAILABLE = 'bg-gray-100 text-gray-400'

const editOpById     = new Map(ALL_EDIT_OPERATIONS.map(d => [d.id, d]))
const multiRowById   = new Map(ALL_MULTI_ROW_OPERATION_DEFS.map(d => [d.id, d]))

interface Props {
  row:      AllocationRow
  onSelect: (view: PanelView) => void
}

export function SummaryView({ row, onSelect }: Props) {
  const { masters, afterOrganizations, allocationList } = useStore()
  const unavailableDisplay = useUnavailableOperationDisplay()
  const { visiblePatterns, visibleIssueIds } = useDisplayPreferenceStore(
    useShallow(s => ({ visiblePatterns: s.visiblePatterns, visibleIssueIds: s.visibleIssueIds }))
  )

  const diffs = useMemo(() => rowDiff(row), [row])
  const detection = useMemo(
    () => detectPatterns(row, { allocationList, afterOrganizations, masters }),
    [row, allocationList, afterOrganizations, masters],
  )
  const visiblePatternChips = useMemo(
    () => [...detection.patterns].filter(p => visiblePatterns.has(p)),
    [detection.patterns, visiblePatterns],
  )
  const visibleIssueChips = useMemo(() => {
    const issues = validateRow({ row, afterOrganizations, masters, allocationList: [], changes: detection })
    return issues.filter(i => {
      const meta = resolveIssueMeta(i)
      return meta ? visibleIssueIds.has(meta.id) : false
    })
  }, [row, afterOrganizations, masters, detection, visibleIssueIds])
  const orgName = afterOrganizations.find(
    o => o.externalCode === row.departmentCode || o.id === row.departmentCode
  )?.name ?? (row.departmentCode as string | undefined) ?? ''

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* 人物・行情報 */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <div className="text-sm font-semibold text-gray-800">
          {[row.lastName, row.firstName].filter(Boolean).join(' ') || '（空席）'}
        </div>
        {orgName && <div className="text-xs text-gray-400 mt-0.5 truncate">{orgName}</div>}
        {row.concurrentType === '兼務' && (
          <span className="inline-block mt-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">兼務</span>
        )}
      </div>

      {/* 変更済みフィールドのサマリー + 変更種別チップ + 問題チップ（全件・省略なし） */}
      {(diffs.length > 0 || visiblePatternChips.length > 0 || visibleIssueChips.length > 0) && (
        <div className="px-4 py-2 border-b border-gray-100 bg-blue-50 flex-shrink-0">
          {diffs.length > 0 && (
            <div className={(visiblePatternChips.length > 0 || visibleIssueChips.length > 0) ? 'mb-2' : ''}>
              <div className="text-[10px] font-semibold text-blue-600 mb-1">変更済み（{diffs.length}件）</div>
              <div className="space-y-0.5 max-h-24 overflow-y-auto">
                {diffs.map(({ afterKey, prevValue, afterValue }) => (
                  <div key={afterKey as string} className="flex items-center gap-1 text-[10px]">
                    <span className="text-gray-400 flex-shrink-0 truncate max-w-[80px]">
                      {ALLOCATION_LIST_LABEL_MAP[afterKey as string]?.ja ?? afterKey as string}
                    </span>
                    <span className="text-gray-300">→</span>
                    <span className="text-blue-700 truncate">{afterValue || '（空）'}</span>
                    {prevValue && <span className="text-gray-300 truncate">（前: {prevValue}）</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {visiblePatternChips.length > 0 && (
            <div className={visibleIssueChips.length > 0 ? 'mb-2' : ''}>
              <div className="text-[10px] font-semibold text-blue-600 mb-1">変更種別</div>
              <div className="flex flex-wrap gap-1">
                {visiblePatternChips.map(p => (
                  <span
                    key={p}
                    className={`text-[10px] px-1.5 py-0.5 rounded border leading-none font-medium flex-shrink-0 ${PATTERN_COLOR_MAP[p] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
                  >
                    {PATTERN_LABEL_MAP[p] ?? p}
                  </span>
                ))}
              </div>
            </div>
          )}
          {visibleIssueChips.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-red-500 mb-1">問題</div>
              <div className="flex flex-wrap gap-1">
                {visibleIssueChips.map((issue, idx) => {
                  const meta      = resolveIssueMeta(issue)
                  const fieldStr  = String(issue.field)
                  const chipLabel = meta && FIELD_LEVEL_IDS.has(meta.id)
                    ? (ALLOCATION_LIST_LABEL_MAP[fieldStr]?.ja ?? fieldStr)
                    : (meta?.chipLabel ?? issue.message.slice(0, 8))
                  const colorCls = issue.level === 'error'
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : 'bg-amber-100 text-amber-700 border-amber-200'
                  return (
                    <span
                      key={idx}
                      className={`text-[10px] px-1.5 py-0.5 rounded border leading-none font-medium flex-shrink-0 ${colorCls}`}
                      title={issue.message}
                    >
                      {issue.level === 'error' ? '⚠ ' : '! '}{chipLabel}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 操作ボタン群 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {SECTIONS.map((section, sectionIdx) => {
          // ── 全項目を直接編集（常に有効）──────────────────────────────────
          if ('directEdit' in section) {
            return (
              <div key="directEdit">
                <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  全項目を直接編集
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() => onSelect('directEdit')}
                    className="px-1 py-0.5 min-h-[1.75rem] rounded text-[10px] font-medium text-center leading-tight bg-gray-100 text-gray-500 hover:brightness-95 active:scale-95 transition-all"
                  >
                    直接編集
                  </button>
                </div>
              </div>
            )
          }

          // ── 通常セクション ────────────────────────────────────────────────
          const { label, ops } = section
          const items = ops.flatMap((entry): { key: string; shortLabel: string; cancel: boolean; available: boolean; unavailableReason?: string; onPress: () => void; badgeColor?: string }[] => {
            // ── chooser エントリ（本務出向ルーティング）──────────────────────
            if ('chooser' in entry) {
              return [{
                key:        `chooser-${entry.chooser}`,
                shortLabel: entry.shortLabel,
                cancel:     false,
                available:  true,
                onPress:    () => onSelect({ chooser: entry.chooser, rowId: row.rowId }),
                badgeColor: OPERATION_BADGE_COLORS['secondment'],
              }]
            }

            const cancel = !!entry.cancel

            if ('multiRowId' in entry) {
              // MultiRowOperationDef
              const def = multiRowById.get(entry.multiRowId)
              if (!def) return []
              const available = def.availableFor(row, masters, allocationList)
              if (!available && unavailableDisplay === 'hide') return []
              return [{
                key:        def.id,
                shortLabel: entry.shortLabel,
                cancel,
                available,
                onPress:    () => onSelect({ multiRowDef: def, rowId: row.rowId }),
                badgeColor: def.badge ? OPERATION_BADGE_COLORS[def.badge] : undefined,
              }]
            }

            // EditOperation
            const def = editOpById.get(entry.id)
            if (!def) return []
            const result = resolveAvailability(def, row, masters)
            const available = result.available
            const unavailableReason = result.available ? undefined : result.reason
            if (!available && unavailableDisplay === 'hide') return []
            return [{
              key:        def.id,
              shortLabel: entry.shortLabel,
              cancel,
              available,
              unavailableReason,
              onPress:    () => onSelect({ def, rowId: row.rowId }),
              badgeColor: OPERATION_BADGE_COLORS[def.badge],
            }]
          })

          if (items.length === 0) return null

          return (
            <div key={`${label}-${sectionIdx}`}>
              <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                {label}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1">
                {items.map(({ key, shortLabel, cancel, available, unavailableReason, onPress, badgeColor }) => {
                  const disabled = !available && unavailableDisplay === 'show-disabled'
                  const color = available
                    ? (badgeColor ?? (cancel ? COLOR_CANCEL : COLOR_AVAILABLE))
                    : COLOR_UNAVAILABLE
                  return (
                    <button
                      key={key}
                      onClick={disabled ? undefined : onPress}
                      disabled={disabled}
                      className={[
                        'px-1 py-0.5 min-h-[1.75rem] rounded text-[10px] font-medium text-center leading-tight whitespace-pre-line',
                        disabled
                          ? 'cursor-not-allowed opacity-50'
                          : 'transition-all hover:brightness-95 active:scale-95',
                        color,
                      ].join(' ')}
                      title={available ? undefined : (unavailableReason ?? `${shortLabel}（この行では使用できません）`)}
                    >
                      {shortLabel}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
