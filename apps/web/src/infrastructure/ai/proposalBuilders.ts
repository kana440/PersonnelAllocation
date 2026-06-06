// proposalBuilders — confirm ツールの buildProposal（確認ウィジェット組み立て）実装。
//
// 設計思想: specs/G4-ai/00-design-philosophy.md §5b
//
// 責務: appService.getSnapshot() で現在状態を読み取り、ユーザーに見せる
//       diff-preview ウィジェットデータ（PersonDiff[]）を組み立てる。
//       読み取り専用（副作用なし）。書き込みは toolRegistry の executeOnApprove
//       が aiTools メソッドを呼ぶことで行う。

import type { ChatWidget, PersonDiff } from '../../application/aiTypes'
import { aiTools } from '../../application/aiTools'
import { appService } from '../../application/HRApplicationService'
import { reDeriveManagerNamesForList, reDeriveOrgSubFieldsForList } from '@personnel/domain/commands/orgHelpers'

type ProposalResult = { widget: ChatWidget }

// ── 一括異動 ─────────────────────────────────────────────────────────────────

export function buildBulkTransferProposal(
  sourceOrgCode: string,
  targetOrgCode: string,
): ProposalResult {
  const { allocationList, afterOrganizations } = appService.getSnapshot()
  const sourceOrg = afterOrganizations.find(o => o.externalCode === sourceOrgCode || o.id === sourceOrgCode)
  const targetOrg = afterOrganizations.find(o => o.externalCode === targetOrgCode || o.id === targetOrgCode)
  const persons: PersonDiff[] = allocationList
    .filter(r => r.departmentCode === sourceOrgCode && r.userId)
    .map(r => ({
      userId:  r.userId!,
      name:    [r.lastName, r.firstName].filter(Boolean).join(' '),
      orgName: sourceOrg?.name ?? sourceOrgCode,
      rowId:   r.rowId,
      before:  { orgName: sourceOrg?.name ?? sourceOrgCode },
      after:   { orgName: targetOrg?.name ?? targetOrgCode },
    }))
  return { widget: { type: 'diff-preview', persons, label: '一括異動の確認' } }
}

// ── フィールド編集 ────────────────────────────────────────────────────────────

export function buildFieldEditProposal(
  userId: string,
  field:  string,
  value:  string,
): ProposalResult {
  const LABELS: Record<string, string> = {
    localJobTitle: '役職名', band: 'バンド', payGrade: '給与等級',
    officialPositionCode: '役職コード', transferReason: '異動事由',
  }
  const { afterOrganizations } = appService.getSnapshot()
  const rows    = aiTools.getPersonRows(userId)
  const primary = rows.find(r => !r.concurrentType) ?? rows[0]
  if (!primary) return { widget: { type: 'diff-preview', persons: [] } }
  const org          = afterOrganizations.find(o => o.externalCode === primary.departmentCode || o.id === primary.departmentCode)
  const currentValue = String(primary[field as keyof typeof primary] ?? '')
  const isGrade      = field === 'band' || field === 'payGrade'
  const person: PersonDiff = {
    userId, rowId: primary.rowId,
    name:    [primary.lastName, primary.firstName].filter(Boolean).join(' '),
    orgName: org?.name ?? primary.departmentCode ?? '',
    before:  isGrade ? { grade: `${LABELS[field] ?? field}: ${currentValue || '（未設定）'}` } : { position: `${LABELS[field] ?? field}: ${currentValue || '（未設定）'}` },
    after:   isGrade ? { grade: value || '（削除）' }                                          : { position: value || '（削除）' },
  }
  return { widget: { type: 'diff-preview', persons: [person], label: 'フィールド変更の確認' } }
}

// ── 複数行一括フィールド設定 ──────────────────────────────────────────────────

export function buildBulkSetFieldProposal(
  rowIds: number[],
  field:  string,
  value:  string,
): ProposalResult {
  const { allocationList, afterOrganizations } = appService.getSnapshot()
  const persons: PersonDiff[] = rowIds.flatMap(rowId => {
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return []
    const org    = afterOrganizations.find(o => o.externalCode === row.departmentCode || o.id === row.departmentCode)
    const before = String(row[field as keyof typeof row] ?? '')
    return [{
      userId:  row.userId ?? '',
      name:    ([row.lastName, row.firstName].filter(Boolean).join(' ') || row.positionCode) ?? '',
      orgName: org?.name ?? row.departmentCode ?? '',
      rowId,
      before: { position: before || '（未設定）' },
      after:  { position: value  || '（クリア）' },
    }] satisfies PersonDiff[]
  })
  const label = `${field} を ${value || '（クリア）'} に一括設定（${persons.length}行）`
  return { widget: { type: 'diff-preview', persons, label } }
}

// ── 個人異動 ─────────────────────────────────────────────────────────────────

export function buildTransferProposal(
  userIds:       string[],
  targetOrgCode: string,
): ProposalResult {
  const { afterOrganizations } = appService.getSnapshot()
  const targetOrg = afterOrganizations.find(o => o.externalCode === targetOrgCode || o.id === targetOrgCode)
  const persons: PersonDiff[] = userIds.flatMap(userId => {
    const rows    = aiTools.getPersonRows(userId)
    const primary = rows.find(r => !r.concurrentType) ?? rows[0]
    if (!primary) return []
    const currentOrg = afterOrganizations.find(
      o => o.externalCode === primary.departmentCode || o.id === primary.departmentCode
    )
    return [{
      userId,
      name:    [primary.lastName, primary.firstName].filter(Boolean).join(' '),
      orgName: currentOrg?.name ?? primary.departmentCode ?? '',
      rowId:   primary.rowId,
      before:  { orgName: currentOrg?.name ?? primary.departmentCode ?? '' },
      after:   { orgName: targetOrg?.name ?? targetOrgCode },
    }]
  })
  return { widget: { type: 'diff-preview', persons, label: '異動の確認' } }
}

// ── 昇格 ─────────────────────────────────────────────────────────────────────

export function buildPromotionProposal(userIds: string[]): ProposalResult {
  const { afterOrganizations } = appService.getSnapshot()
  const persons: PersonDiff[] = userIds.flatMap(userId => {
    const rows    = aiTools.getPersonRows(userId)
    const primary = rows.find(r => !r.concurrentType) ?? rows[0]
    if (!primary) return []
    const org = afterOrganizations.find(o => (o.externalCode ?? o.id) === primary.departmentCode)
    return [{
      userId,
      name:    [primary.lastName, primary.firstName].filter(Boolean).join(' '),
      orgName: org?.name ?? primary.departmentCode,
      rowId:   primary.rowId,
      before:  { grade: primary.prevPayGrade, position: primary.prevOfficialPositionCode },
      after:   { note: '昇格' },
    }]
  })
  return { widget: { type: 'diff-preview', persons, label: '昇格の確認' } }
}

// ── 空席ポジション作成 ────────────────────────────────────────────────────────

export function buildCreatePositionProposal(
  orgCode:       string,
  localJobTitle: string,
): ProposalResult {
  const { afterOrganizations } = appService.getSnapshot()
  const org = afterOrganizations.find(o => o.externalCode === orgCode || o.id === orgCode)
  const person: PersonDiff = {
    userId: '', name: `（空席）${localJobTitle}`, rowId: -1,
    orgName: org?.name ?? orgCode,
    before: { position: '（なし）' },
    after:  { position: localJobTitle },
  }
  return { widget: { type: 'diff-preview', persons: [person], label: '空席ポジション作成の確認' } }
}

// ── 人の配属 ─────────────────────────────────────────────────────────────────

export function buildAssignPersonProposal(
  vacantRowId: number,
  userId:      string,
): ProposalResult {
  const { allocationList, afterOrganizations } = appService.getSnapshot()
  const vacantRow  = allocationList.find(r => r.rowId === vacantRowId)
  const personRows = aiTools.getPersonRows(userId)
  const primary    = personRows.find(r => !r.concurrentType) ?? personRows[0]
  const org = afterOrganizations.find(o => o.externalCode === vacantRow?.departmentCode || o.id === vacantRow?.departmentCode)
  const person: PersonDiff = {
    userId, rowId: vacantRowId,
    name:    primary ? [primary.lastName, primary.firstName].filter(Boolean).join(' ') : userId,
    orgName: org?.name ?? vacantRow?.departmentCode ?? '',
    before:  { position: '未配属' },
    after:   { position: vacantRow?.localJobTitle ?? '（役職名なし）' },
  }
  return { widget: { type: 'diff-preview', persons: [person], label: '配属の確認' } }
}

// ── 役職名変更 ────────────────────────────────────────────────────────────────

export function buildChangePositionProposal(
  userId:      string,
  newJobTitle: string,
): ProposalResult {
  const rows    = aiTools.getPersonRows(userId)
  const primary = rows.find(r => !r.concurrentType) ?? rows[0]
  const { afterOrganizations } = appService.getSnapshot()
  const org = afterOrganizations.find(o => o.externalCode === primary?.departmentCode || o.id === primary?.departmentCode)
  const person: PersonDiff = {
    userId, rowId: primary?.rowId ?? -1,
    name:    primary ? [primary.lastName, primary.firstName].filter(Boolean).join(' ') : userId,
    orgName: org?.name ?? primary?.departmentCode ?? '',
    before:  { position: primary?.localJobTitle ?? primary?.officialPositionCode ?? '（未設定）' },
    after:   { position: newJobTitle },
  }
  return { widget: { type: 'diff-preview', persons: [person], label: '役職変更の確認' } }
}

// ── 上司ポジション設定 ────────────────────────────────────────────────────────

export function buildSetManagerPositionProposal(
  rowId:               number,
  managerPositionCode: string,
): ProposalResult {
  const { allocationList, afterOrganizations } = appService.getSnapshot()
  const targetRow = allocationList.find(r => r.rowId === rowId)
  const mgrRow    = allocationList.find(r => r.positionCode === managerPositionCode)
  const mgrName   = mgrRow
    ? [mgrRow.lastName, mgrRow.firstName].filter(Boolean).join(', ')
    : managerPositionCode
  const org = afterOrganizations.find(
    o => o.externalCode === targetRow?.departmentCode || o.id === targetRow?.departmentCode
  )
  const person: PersonDiff = {
    userId:  targetRow?.userId ?? '',
    rowId,
    name:    targetRow ? [targetRow.lastName, targetRow.firstName].filter(Boolean).join(' ') : String(rowId),
    orgName: org?.name ?? targetRow?.departmentCode ?? '',
    before:  { position: targetRow?.managerPositionCode ?? '（未設定）' },
    after:   { position: managerPositionCode, orgName: mgrName },
  }
  return { widget: { type: 'diff-preview', persons: [person], label: '上司ポジション設定の確認' } }
}

// ── 上司姓名 一括再導出 ───────────────────────────────────────────────────────

export function buildReDeriveManagerNamesProposal(): ProposalResult {
  const { allocationList, afterOrganizations } = appService.getSnapshot()
  const updated = reDeriveManagerNamesForList(allocationList)
  const persons: PersonDiff[] = allocationList
    .map((r, i) => ({ r, u: updated[i] }))
    .filter(({ r, u }) => r !== u)
    .map(({ r, u }) => ({
      userId:  r.userId ?? '',
      name:    ([r.lastName, r.firstName].filter(Boolean).join(' ') || r.positionCode) ?? '',
      orgName: afterOrganizations.find(o => o.externalCode === r.departmentCode)?.name ?? r.departmentCode ?? '',
      rowId:   r.rowId,
      before:  { position: (r.managerName ?? '') || '（未設定）' },
      after:   { position: (u.managerName ?? '') || '（未設定）' },
    }))
  const label = persons.length > 0
    ? `上司姓名 一括再導出（${persons.length}行が対象）`
    : '変更対象の行はありません'
  return { widget: { type: 'diff-preview', persons, label } }
}

// ── ポジションコード割当 ──────────────────────────────────────────────────────

export function buildAssignPositionCodesProposal(
  assignments: Array<{ rowId: number; newPositionCode: string }>,
): ProposalResult {
  const positions = aiTools.getUnassignedPositions()
  const { afterOrganizations } = appService.getSnapshot()
  const persons: PersonDiff[] = assignments.flatMap(({ rowId, newPositionCode }) => {
    const pos = positions.find(p => p.rowId === rowId)
    if (!pos) return []
    const org = afterOrganizations.find(o => (o.externalCode ?? o.id) === pos.departmentCode)
    return [{
      userId:  '',
      name:    pos.localJobTitle || `（rowId: ${rowId}）`,
      orgName: org?.name ?? pos.orgName,
      rowId,
      before:  { position: pos.positionCode },
      after:   { position: newPositionCode },
    }] satisfies PersonDiff[]
  })
  const label = `ポジションコード割当（${persons.length}件）`
  return { widget: { type: 'diff-preview', persons, label } }
}

// ── 組織サブフィールド 一括再導出 ─────────────────────────────────────────────

export function buildReDeriveOrgSubFieldsProposal(): ProposalResult {
  const { allocationList, afterOrganizations, codeLists } = appService.getSnapshot()
  const updated = reDeriveOrgSubFieldsForList(allocationList, codeLists)
  const persons: PersonDiff[] = allocationList
    .map((r, i) => ({ r, u: updated[i] }))
    .filter(({ r, u }) => r !== u)
    .map(({ r, u }) => ({
      userId:  r.userId ?? '',
      name:    ([r.lastName, r.firstName].filter(Boolean).join(' ') || r.positionCode) ?? '',
      orgName: afterOrganizations.find(o => o.externalCode === r.departmentCode)?.name ?? r.departmentCode ?? '',
      rowId:   r.rowId,
      before:  { orgName: r.businessUnit ?? r.departmentCode ?? '' },
      after:   { orgName: u.businessUnit ?? u.departmentCode ?? '' },
    }))
  const label = persons.length > 0
    ? `組織サブフィールド 一括再導出（${persons.length}行が対象）`
    : '変更対象の行はありません'
  return { widget: { type: 'diff-preview', persons, label } }
}
