// proposalBuilders — confirm ツールの buildProposal（確認ウィジェット組み立て）実装。
//
// 設計思想: specs/G4-ai/00-design-philosophy.md §5b
//
// 責務: appService.getSnapshot() で現在状態を読み取り、ユーザーに見せる
//       diff-preview ウィジェットデータ（PersonDiff[]）を組み立てる。
//       読み取り専用（副作用なし）。書き込みは toolRegistry の executeOnApprove
//       が aiTools メソッドを呼ぶことで行う。

import type { ChatWidget, PersonDiff, WizardStep } from '../../application/aiTypes'
import { appService } from '../../application/HRApplicationService'
import { reDeriveManagerNamesForList, reDeriveOrgSubFieldsForList } from '@personnel/domain/commands/orgHelpers'
import { buildFlatOrgView } from '@personnel/domain/choices/orgTree'
import { computeBandStepDiff } from '@personnel/domain/derivation'

type ProposalResult = { widget: ChatWidget } | { error: string }

// ── 一括異動 ─────────────────────────────────────────────────────────────────

export function buildBulkTransferProposal(
  sourceOrgCode: string,
  targetOrgCode: string,
  options?: { includeSubtree?: boolean },
): ProposalResult {
  const { allocationList, afterOrganizations } = appService.getSnapshot()
  const targetOrg = afterOrganizations.find(o => o.externalCode === targetOrgCode || o.id === targetOrgCode)

  let sourceCodes: Set<string>
  if (options?.includeSubtree) {
    const view = buildFlatOrgView(afterOrganizations)
    const root = view.find(e => e.orgCode === sourceOrgCode)
    if (!root) return { error: '移動元組織が見つかりません' }
    sourceCodes = new Set([root.orgCode, ...root.descendantCodes])
  } else {
    sourceCodes = new Set([sourceOrgCode])
  }

  const persons: PersonDiff[] = allocationList
    .filter(r => r.userId && sourceCodes.has(r.departmentCode ?? ''))
    .map(r => {
      const org = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.departmentCode)
      return {
        userId:  r.userId!,
        name:    [r.lastName, r.firstName].filter(Boolean).join(' '),
        orgName: org?.name ?? r.departmentCode ?? '',
        rowId:   r.rowId,
        before:  { orgName: org?.name ?? r.departmentCode ?? '' },
        after:   { orgName: targetOrg?.name ?? targetOrgCode },
      }
    })
  const label = options?.includeSubtree ? '一括異動（配下含む）の確認' : '一括異動の確認'
  return { widget: { type: 'diff-preview', persons, label } }
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

export function buildTransferProposal(opts: {
  rowIds?:         number[]
  name?:           string
  subtreeOrgCode?: string
  targetOrgCode:   string
  transferReason?: string
}): ProposalResult {
  const { allocationList, afterOrganizations } = appService.getSnapshot()
  const { targetOrgCode, transferReason } = opts

  // filter → rowIds の解決
  let targetRowIds = opts.rowIds ?? []
  if (targetRowIds.length === 0) {
    let subtreeCodes: Set<string> | null = null
    if (opts.subtreeOrgCode) {
      const view = buildFlatOrgView(afterOrganizations)
      const root = view.find(e => e.orgCode === opts.subtreeOrgCode)
      if (root) subtreeCodes = new Set([root.orgCode, ...root.descendantCodes])
    }
    targetRowIds = allocationList
      .filter(row => {
        if (!row.userId && !row.lastName && !row.firstName) return false
        if (opts.name) {
          const name = [row.lastName, row.firstName].filter(Boolean).join(' ')
          if (!name.includes(opts.name)) return false
        }
        if (subtreeCodes && !subtreeCodes.has(row.departmentCode ?? '')) return false
        return true
      })
      .map(r => r.rowId)
  }

  if (targetRowIds.length === 0) return { error: '対象者が見つかりません' }

  const targetOrg = afterOrganizations.find(o => o.externalCode === targetOrgCode || o.id === targetOrgCode)
  const persons: PersonDiff[] = targetRowIds.flatMap(rowId => {
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return []
    const currentOrg = afterOrganizations.find(
      o => o.externalCode === row.departmentCode || o.id === row.departmentCode
    )
    return [{
      userId:  row.userId ?? '',
      name:    [row.lastName, row.firstName].filter(Boolean).join(' '),
      orgName: currentOrg?.name ?? row.departmentCode ?? '',
      rowId,
      before:  { orgName: currentOrg?.name ?? row.departmentCode ?? '' },
      after:   { orgName: targetOrg?.name ?? targetOrgCode },
    }]
  })

  return {
    widget: {
      type: 'org-transfer-confirm',
      persons,
      targetOrgName: targetOrg?.name ?? targetOrgCode,
      transferReason,
      label: '組織異動の確認',
    },
  }
}

// ── 昇格 ─────────────────────────────────────────────────────────────────────

export function buildPromotionProposal(opts: {
  rowId:                    number
  newPositionBand:          string
  newOfficialPositionCode?: string
  newLocalJobTitle?:        string
}): ProposalResult {
  const { allocationList, codeLists } = appService.getSnapshot()
  const row = allocationList.find(r => r.rowId === opts.rowId)
  if (!row) return { error: '対象行が見つかりません' }

  const stepDiff = computeBandStepDiff(row.positionBand as string | undefined, opts.newPositionBand, codeLists)
  const label = stepDiff !== undefined && stepDiff >= 2
    ? `昇格の確認（${stepDiff}段階変更）`
    : '昇格の確認'

  return {
    widget: {
      type: 'promotion-confirm',
      rowId: opts.rowId,
      proposedPositionBand: opts.newPositionBand,
      proposedOfficialPositionCode: opts.newOfficialPositionCode,
      proposedLocalJobTitle: opts.newLocalJobTitle,
      label,
    },
  }
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

// ── 降格 ─────────────────────────────────────────────────────────────────────

export function buildDemotionProposal(
  rowId:  number,
  fields: { officialPositionCode?: string; localJobTitle?: string; band?: string; payGrade?: string; demotionReason?: string },
): ProposalResult {
  const { allocationList } = appService.getSnapshot()
  const row = allocationList.find(r => r.rowId === rowId)
  return {
    widget: {
      type: 'demotion-confirm',
      rowId,
      proposedPositionBand: fields.band ?? (row?.positionBand as string | undefined) ?? '',
      proposedOfficialPositionCode: fields.officialPositionCode,
      proposedLocalJobTitle: fields.localJobTitle,
      demotionReason: fields.demotionReason,
      label: '降格の確認',
    },
  }
}

// ── 本務出向 → 兼務出向変換（Wizard 2ステップ） ───────────────────────────────

export function buildSecondmentToConcurrentProposal(
  rowId: number,
  concurrentReason?: string,
): ProposalResult {
  const { allocationList, afterOrganizations } = appService.getSnapshot()
  const row = allocationList.find(r => r.rowId === rowId)
  if (!row)                     return { error: `行が見つかりません (rowId: ${rowId})` }
  if (!row.userId)              return { error: 'この行に人が配属されていません' }
  if (!row.secondmentToCompany) return { error: `${[row.lastName, row.firstName].filter(Boolean).join(' ') || `行 ${rowId}`}さんは本務出向ではありません（secondmentToCompany が未設定）。出向中の人を指定してください。` }
  if (!row.prevDepartmentCode)  return { error: '元の所属組織が特定できません（prevDepartmentCode が未設定）。Excelインポート済みの出向データにのみ使用できます。' }

  const name          = [row.lastName, row.firstName].filter(Boolean).join(' ') || `行 ${rowId}`
  const secondmentCo  = row.secondmentToCompany
  const secondmentOrg = afterOrganizations.find(o => o.externalCode === row.departmentCode || o.id === row.departmentCode)
  const homeOrg       = afterOrganizations.find(o => o.externalCode === row.prevDepartmentCode || o.id === row.prevDepartmentCode)

  const steps: WizardStep[] = [
    {
      stepNumber:  1,
      title:       '本務出向を解除',
      description: `${name}さんの本務出向（${secondmentCo}）を解除し、元の所属組織へ戻します。`,
      diffs: [{
        userId:  row.userId, rowId, name,
        orgName: secondmentOrg?.name ?? row.departmentCode ?? '',
        before:  { orgName: secondmentOrg?.name ?? row.departmentCode ?? '', note: `本務出向中（${secondmentCo}）` },
        after:   { orgName: homeOrg?.name ?? row.prevDepartmentCode ?? '（元の組織）', note: '本務出向解除' },
      }],
    },
    {
      stepNumber:  2,
      title:       '兼務出向として再設定',
      description: `${secondmentCo} への出向を兼務出向（新規行）として追加します。`,
      diffs: [{
        userId:  row.userId, rowId: -2, name,
        orgName: homeOrg?.name ?? row.prevDepartmentCode ?? '',
        before:  { note: '兼務なし' },
        after:   { orgName: secondmentOrg?.name ?? row.departmentCode ?? '', note: `兼務出向（${secondmentCo}）${concurrentReason ? `（${concurrentReason}）` : ''}` },
      }],
    },
  ]

  return { widget: { type: 'wizard-steps', title: `本務出向 → 兼務出向変換: ${name}`, steps } }
}

// ── 出向先への転籍（Wizard 2ステップ） ──────────────────────────────────────

export function buildSecondmentTransferProposal(
  rowId:          number,
  transferReason: string,
): ProposalResult {
  const { allocationList, afterOrganizations } = appService.getSnapshot()
  const row = allocationList.find(r => r.rowId === rowId)
  if (!row)                     return { error: `行が見つかりません (rowId: ${rowId})` }
  if (!row.userId)              return { error: 'この行に人が配属されていません' }
  if (!row.secondmentToCompany) return { error: `${[row.lastName, row.firstName].filter(Boolean).join(' ') || `行 ${rowId}`}さんは本務出向ではありません（secondmentToCompany が未設定）。出向中の人を指定してください。` }
  if (!row.prevDepartmentCode)  return { error: '元の所属組織が特定できません（prevDepartmentCode が未設定）。Excelインポート済みの出向データにのみ使用できます。' }

  const name          = [row.lastName, row.firstName].filter(Boolean).join(' ') || `行 ${rowId}`
  const secondmentCo  = row.secondmentToCompany
  const secondmentOrg = afterOrganizations.find(o => o.externalCode === row.departmentCode || o.id === row.departmentCode)
  const homeOrg       = afterOrganizations.find(o => o.externalCode === row.prevDepartmentCode || o.id === row.prevDepartmentCode)

  const steps: WizardStep[] = [
    {
      stepNumber:  1,
      title:       '出向を解除して元の組織に戻す',
      description: `本務出向（${secondmentCo}）を解除し、${homeOrg?.name ?? '元の組織'}へ一時的に戻します。`,
      diffs: [{
        userId:  row.userId, rowId, name,
        orgName: secondmentOrg?.name ?? row.departmentCode ?? '',
        before:  { orgName: secondmentOrg?.name ?? row.departmentCode ?? '', note: `本務出向中（${secondmentCo}）` },
        after:   { orgName: homeOrg?.name ?? row.prevDepartmentCode ?? '（元の組織）', note: '出向解除' },
      }],
    },
    {
      stepNumber:  2,
      title:       '転籍処理（自社を離れる）',
      description: `${name}さんを ${secondmentCo} へ転籍させます。異動事由: ${transferReason}`,
      diffs: [{
        userId:  row.userId, rowId, name,
        orgName: homeOrg?.name ?? row.prevDepartmentCode ?? '',
        before:  { orgName: homeOrg?.name ?? row.prevDepartmentCode ?? '', note: '在籍中' },
        after:   { note: `転籍（出）→ ${secondmentCo}`, orgName: '（退職）' },
      }],
    },
  ]

  return { widget: { type: 'wizard-steps', title: `出向先への転籍: ${name} → ${secondmentCo}`, steps } }
}

// ── 本務出向受入 ──────────────────────────────────────────────────────────────

export function buildSecondmentInProposal(
  rowId:        number,
  sfIntegrated: boolean,
): ProposalResult {
  const { allocationList } = appService.getSnapshot()
  const row = allocationList.find(r => r.rowId === rowId)
  if (!row) return { error: `行が見つかりません (rowId: ${rowId})` }
  if (!row.userId) return { error: 'この行に人が配属されていません' }
  const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${rowId}`
  return {
    widget: {
      type: 'secondment-in-confirm',
      rowId,
      sfIntegrated,
      label: `本務出向受入: ${name}`,
    },
  }
}

// ── 兼務出向受入 ──────────────────────────────────────────────────────────────

export function buildConcurrentSecondmentInProposal(
  rowId:        number,
  sfIntegrated: boolean,
): ProposalResult {
  const { allocationList } = appService.getSnapshot()
  const row = allocationList.find(r => r.rowId === rowId)
  if (!row) return { error: `行が見つかりません (rowId: ${rowId})` }
  if (!row.userId) return { error: 'この行に人が配属されていません' }
  const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${rowId}`
  return {
    widget: {
      type: 'concurrent-secondment-in-confirm',
      rowId,
      sfIntegrated,
      label: `兼務出向受入: ${name}`,
    },
  }
}
