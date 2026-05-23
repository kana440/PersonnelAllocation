import { useCallback, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { useChatStore } from '../../store/useChatStore'
import { aiTools } from '../../application/aiTools'
import { appService } from '../../application/HRApplicationService'
import { ChatSession } from '../../application/chatSession'
import { DirectEditOperation } from '../../domain/operation/handlers/directEdit'
import { mockApiService } from '../../infrastructure/ai/chatServiceFactory'
import type { AgentRunner } from '../../infrastructure/ai/agentRunner'
import { importExcelScenario }        from '../../infrastructure/ai/scenarios/importExcel'
import { excelHelpScenario }          from '../../infrastructure/ai/scenarios/excelHelp'
import { checkOrgMembersScenario }    from '../../infrastructure/ai/scenarios/checkOrgMembers'
import { checkDepartmentScenario, buildOrgTree } from '../../infrastructure/ai/scenarios/checkDepartment'
import { reportLineScenario, buildReportLineMembers } from '../../infrastructure/ai/scenarios/reportLine'
import { promotePersonsScenario }     from '../../infrastructure/ai/scenarios/promotePersons'
import { checkImpactScenario, buildImpactGroups } from '../../infrastructure/ai/scenarios/checkImpact'
import { exportExcelScenario, buildExportChangeSummary } from '../../infrastructure/ai/scenarios/exportExcel'
import type { ChatWidget, PersonDiff, WidgetCallbacks } from '../../application/aiTypes'
import type { ChatPhase } from '../../store/useChatStore'

export const WIDGET_PHASE_MAP: Partial<Record<ChatPhase, ChatWidget['type']>> = {
  'awaiting-file':            'file-picker',
  'awaiting-org-name':        'org-input',
  'awaiting-dept-select':     'org-input',
  'awaiting-person-names':    'person-input',
  'awaiting-report-target':   'person-input',
  'awaiting-promote-confirm': 'diff-preview',
  'awaiting-impact-org':      'org-input',
  'awaiting-export-confirm':  'export-confirm',
}

const BUSY_EXEMPT_PHASES: ChatPhase[] = [
  'idle', 'awaiting-file', 'awaiting-org-name', 'awaiting-dept-select',
  'awaiting-person-names', 'awaiting-report-target', 'awaiting-promote-confirm',
  'awaiting-impact-org', 'awaiting-export-confirm',
]

export function useChatHandlers({
  agentRunner,
  onDataLoaded,
}: {
  agentRunner: AgentRunner | null
  onDataLoaded?: () => void
}) {
  const store = useStore()
  const {
    messages, phase, pendingPersons,
    addMessage, updateMessage,
    setPhase, setPendingPersons,
  } = useChatStore()

  const chatSession = useMemo(() => new ChatSession(mockApiService), [])

  const isBusy = !BUSY_EXEMPT_PHASES.includes(phase)

  const activeWidgetType = WIDGET_PHASE_MAP[phase]
  let activeWidgetMsgId: string | null = null
  if (activeWidgetType) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].widget?.type === activeWidgetType) {
        activeWidgetMsgId = messages[i].id
        break
      }
    }
  }

  const addAILoading = useCallback((): string =>
    addMessage({ role: 'ai', text: '', isLoading: true })
  , [addMessage])

  // ── unknown query (free text) ─────────────────────────────────────────────────
  const handleUnknownQuery = useCallback(async (text: string) => {
    // Snapshot before adding the new message — chatSession.send / agentRunner.run
    // both append the user text themselves when building the API payload.
    const snapshot = useChatStore.getState().messages.filter(m => !m.isLoading)
    addMessage({ role: 'user', text })
    const id = addAILoading()
    try {
      let reply: string
      if (agentRunner) {
        reply = await agentRunner.run(snapshot, text, label => updateMessage(id, { text: label }))
      } else {
        reply = await chatSession.send(snapshot, text)
      }
      updateMessage(id, { isLoading: false, text: reply })
    } catch (err) {
      updateMessage(id, { isLoading: false, text: `エラーが発生しました: ${String(err)}` })
    }
  }, [addMessage, addAILoading, updateMessage, agentRunner, chatSession])

  // ── import Excel ──────────────────────────────────────────────────────────────
  const startImportExcel = useCallback(async () => {
    addMessage({ role: 'user', text: 'Excelをインポートして開始' })
    const id = addAILoading()
    const text = await importExcelScenario.initialMessage()
    updateMessage(id, { isLoading: false, text, widget: { type: 'file-picker' } })
    setPhase('awaiting-file')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  const handleImportCancel = useCallback(() => {
    setPhase('idle')
    addMessage({ role: 'user', text: 'キャンセル' })
    addMessage({ role: 'ai', text: 'インポートをキャンセルしました。' })
  }, [addMessage, setPhase])

  const handleFileSelected = useCallback(async (file: File) => {
    setPhase('importing')
    addMessage({ role: 'user', text: `📎 ${file.name}` })
    const id = addAILoading()
    try {
      const result = await importExcelScenario.loadFile(file, msg => updateMessage(id, { text: msg }))
      await store.loadExcelData(result)
      updateMessage(id, { isLoading: false, text: importExcelScenario.successMessage(result) })
      onDataLoaded?.()
    } catch (e) {
      updateMessage(id, { isLoading: false, text: importExcelScenario.errorMessage(e) })
    }
    setPhase('idle')
  }, [addMessage, addAILoading, updateMessage, setPhase, store, onDataLoaded])

  // ── excel help ────────────────────────────────────────────────────────────────
  const startExcelHelp = useCallback(async () => {
    addMessage({ role: 'user', text: 'Excelについて聞く' })
    const id = addAILoading()
    const text = await excelHelpScenario.message()
    updateMessage(id, { isLoading: false, text, widget: { type: 'excel-help' } })
    setPhase('idle')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // ── check org members (legacy) ────────────────────────────────────────────────
  const startCheckOrgMembers = useCallback(async () => {
    addMessage({ role: 'user', text: '組織のメンバーを確認する' })
    const id = addAILoading()
    const text = await checkOrgMembersScenario.promptMessage()
    updateMessage(id, { isLoading: false, text, widget: { type: 'org-input' } })
    setPhase('awaiting-org-name')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // ── check department (org tree) ───────────────────────────────────────────────
  const startCheckDepartment = useCallback(async () => {
    addMessage({ role: 'user', text: '担当部門を確認する' })
    const id = addAILoading()
    const text = await checkDepartmentScenario.promptMessage()
    updateMessage(id, { isLoading: false, text, widget: { type: 'org-input' } })
    setPhase('awaiting-dept-select')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // ── report line ───────────────────────────────────────────────────────────────
  const startReportLine = useCallback(async () => {
    addMessage({ role: 'user', text: 'レポートラインを確認する' })
    const id = addAILoading()
    const text = await reportLineScenario.promptMessage()
    updateMessage(id, { isLoading: false, text, widget: { type: 'person-input' } })
    setPhase('awaiting-report-target')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // ── org-input submit (dispatches by phase) ────────────────────────────────────
  const handleOrgNameSubmit = useCallback(async (orgName: string) => {
    if (phase === 'awaiting-org-name') {
      setPhase('searching-org')
      addMessage({ role: 'user', text: orgName })
      const id = addAILoading()
      const org   = aiTools.findOrgs({ name: orgName })[0] ?? null
      const found = org
        ? { orgName: org.name, members: aiTools.findPersons({ orgCode: org.externalCode ?? org.id }) }
        : null
      const reply = await checkOrgMembersScenario.searchMessage(orgName, found)
      if ('found' in reply) {
        updateMessage(id, {
          isLoading: false, text: reply.text,
          widget: { type: 'org-members', orgName: reply.found.orgName, members: reply.found.members },
        })
      } else {
        updateMessage(id, { isLoading: false, text: reply.text })
      }
      setPhase('idle')

    } else if (phase === 'awaiting-dept-select') {
      setPhase('searching-dept')
      addMessage({ role: 'user', text: orgName })
      const id = addAILoading()
      const org      = aiTools.findOrgs({ name: orgName })[0] ?? null
      const allOrgs  = aiTools.getOrgs()
      const allPersons = aiTools.findPersons({})
      const tree = org ? buildOrgTree(org, allOrgs, allPersons) : null
      const reply = await checkDepartmentScenario.searchMessage(orgName, org, tree)
      if ('tree' in reply) {
        updateMessage(id, {
          isLoading: false, text: reply.text,
          widget: { type: 'org-tree', orgName: reply.orgName, tree: reply.tree },
        })
      } else {
        updateMessage(id, { isLoading: false, text: reply.text })
      }
      setPhase('idle')

    } else if (phase === 'awaiting-impact-org') {
      setPhase('checking-impact')
      addMessage({ role: 'user', text: orgName })
      const id = addAILoading()
      const org     = aiTools.findOrgs({ name: orgName })[0] ?? null
      const allOrgs = aiTools.getOrgs()
      const groups  = org ? buildImpactGroups(org, allOrgs, store.allocationList) : []
      const reply   = await checkImpactScenario.scanMessage(orgName, org, groups)
      if ('targetOrgName' in reply) {
        updateMessage(id, {
          isLoading: false, text: reply.text,
          widget: { type: 'impact-check', targetOrgName: reply.targetOrgName, hasImpact: reply.hasImpact, groups: reply.groups },
        })
      } else {
        updateMessage(id, { isLoading: false, text: reply.text })
      }
      setPhase('idle')
    }
  }, [phase, addMessage, addAILoading, updateMessage, setPhase, store.allocationList])

  // ── person-input submit (dispatches by phase) ─────────────────────────────────
  const handlePersonNamesSubmit = useCallback(async (namesInput: string) => {
    addMessage({ role: 'user', text: namesInput })

    if (phase === 'awaiting-person-names') {
      setPhase('searching-persons')
      const id = addAILoading()
      const names = namesInput.split(/[,、，]/).map(n => n.trim()).filter(Boolean)
      const diffs: PersonDiff[] = []
      for (const name of names) {
        for (const r of aiTools.findPersons({ name })) {
          const row = aiTools.getRow(r.rowIds[0])
          diffs.push({
            userId: r.userId, name: r.name, orgName: r.orgName, rowId: r.rowIds[0],
            before: { grade: row?.prevPayGrade, position: row?.prevOfficialPositionCode },
            after:  { note: '昇格' },
          })
        }
      }
      const reply = await promotePersonsScenario.confirmMessage(diffs)
      if ('persons' in reply) {
        setPendingPersons(reply.persons.map(d => ({
          userId: d.userId, name: d.name, currentOrgName: d.orgName, rowId: d.rowId,
          currentGrade: d.before.grade, currentPosition: d.before.position,
        })))
        updateMessage(id, {
          isLoading: false, text: reply.text,
          widget: { type: 'diff-preview', persons: reply.persons },
        })
        setPhase('awaiting-promote-confirm')
      } else {
        updateMessage(id, { isLoading: false, text: reply.text })
        setPhase('idle')
      }

    } else if (phase === 'awaiting-report-target') {
      setPhase('searching-report')
      const id = addAILoading()
      const name  = namesInput.split(/[,、，]/)[0].trim()
      const found = aiTools.findPersons({ name })[0] ?? null
      const allOrgs = aiTools.getOrgs()
      let result: { managerName: string; managerOrgName: string; members: ReturnType<typeof buildReportLineMembers> } | null = null
      if (found) {
        const targetRows = aiTools.getPersonRows(found.userId)
        result = {
          managerName:    found.name,
          managerOrgName: found.orgName ?? '',
          members:        buildReportLineMembers(targetRows, store.allocationList, allOrgs),
        }
      }
      const reply = await reportLineScenario.searchMessage(namesInput, result)
      if ('managerName' in reply) {
        updateMessage(id, {
          isLoading: false, text: reply.text,
          widget: { type: 'report-line', managerName: reply.managerName, managerOrgName: reply.managerOrgName, members: reply.members },
        })
      } else {
        updateMessage(id, { isLoading: false, text: reply.text })
      }
      setPhase('idle')
    }
  }, [phase, addMessage, addAILoading, updateMessage, setPhase, setPendingPersons, store.allocationList])

  // ── promote confirm / cancel ──────────────────────────────────────────────────
  const handlePromoteConfirm = useCallback(async () => {
    setPhase('applying-promotion')
    const id = addAILoading()
    let applied = 0
    for (const p of pendingPersons) {
      const result = appService.executeOperation(
        new DirectEditOperation(p.rowId, { promotionSign: '昇格' }, `${p.name} 昇格`)
      )
      if (result.ok) applied++
    }
    const text = await promotePersonsScenario.applyMessage(applied)
    updateMessage(id, { isLoading: false, text })
    setPendingPersons([])
    setPhase('idle')
  }, [addAILoading, updateMessage, setPhase, setPendingPersons, pendingPersons])

  const handlePromoteCancel = useCallback(() => {
    setPhase('idle')
    setPendingPersons([])
    addMessage({ role: 'user', text: 'キャンセル' })
    addMessage({ role: 'ai', text: '昇進の操作をキャンセルしました。' })
  }, [addMessage, setPhase, setPendingPersons])

  // ── promote persons start ─────────────────────────────────────────────────────
  const startPromotePersons = useCallback(async () => {
    addMessage({ role: 'user', text: '昇進する人を選択' })
    const id = addAILoading()
    const text = await promotePersonsScenario.promptMessage()
    updateMessage(id, { isLoading: false, text, widget: { type: 'person-input' } })
    setPhase('awaiting-person-names')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // ── impact check ──────────────────────────────────────────────────────────────
  const startCheckImpact = useCallback(async () => {
    addMessage({ role: 'user', text: '担当外への影響をチェック' })
    const id = addAILoading()
    const text = await checkImpactScenario.promptMessage()
    updateMessage(id, { isLoading: false, text, widget: { type: 'org-input' } })
    setPhase('awaiting-impact-org')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // ── export Excel ──────────────────────────────────────────────────────────────
  const startExportExcel = useCallback(async () => {
    addMessage({ role: 'user', text: 'Excelをエクスポート' })
    const id = addAILoading()
    const allOrgs = [...store.organizations, ...store.afterOrganizations]
    const { changeCount, groups } = buildExportChangeSummary(store.allocationList, allOrgs)
    const text = await exportExcelScenario.confirmMessage()
    updateMessage(id, {
      isLoading: false, text,
      widget: { type: 'export-confirm', changeCount, groups },
    })
    setPhase('awaiting-export-confirm')
  }, [addMessage, addAILoading, updateMessage, setPhase, store])

  const handleExportConfirm = useCallback(async () => {
    setPhase('exporting')
    const id = addAILoading()
    updateMessage(id, { isLoading: true, text: '出力中です...' })
    try {
      const { buffer, fileName } = await exportExcelScenario.buildBuffer(
        store.allocationList, store.organizations, store.afterOrganizations, store.effectiveDate,
      )
      const ext      = fileName.endsWith('.xlsm') ? 'xlsm' : 'xlsx'
      const mimeType = ext === 'xlsm'
        ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      if ('showSaveFilePicker' in window) {
        const handle = await (window as Window & typeof globalThis & {
          showSaveFilePicker: (opts: object) => Promise<FileSystemFileHandle>
        }).showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'Excel ファイル', accept: { [mimeType]: [`.${ext}`] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(buffer)
        await writable.close()
      } else {
        const blob = new Blob([buffer], { type: mimeType })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href = url; a.download = fileName
        document.body.appendChild(a); a.click()
        document.body.removeChild(a); URL.revokeObjectURL(url)
      }
      updateMessage(id, { isLoading: false, text: exportExcelScenario.successMessage(fileName) })
    } catch (e) {
      const text = (e instanceof DOMException && e.name === 'AbortError')
        ? exportExcelScenario.abortMessage()
        : exportExcelScenario.errorMessage(e)
      updateMessage(id, { isLoading: false, text })
    }
    setPhase('idle')
  }, [addAILoading, updateMessage, setPhase, store])

  const handleExportCancel = useCallback(() => {
    setPhase('idle')
    addMessage({ role: 'user', text: 'キャンセル' })
    addMessage({ role: 'ai', text: 'エクスポートをキャンセルしました。' })
  }, [addMessage, setPhase])

  // ── assembled callbacks & routing ─────────────────────────────────────────────
  const widgetCallbacks: WidgetCallbacks = {
    onFileSelected:      handleFileSelected,
    onImportCancel:      handleImportCancel,
    onOrgNameSubmit:     handleOrgNameSubmit,
    onPersonNamesSubmit: handlePersonNamesSubmit,
    onPromoteConfirm:    handlePromoteConfirm,
    onPromoteCancel:     handlePromoteCancel,
    onExportConfirm:     handleExportConfirm,
    onExportCancel:      handleExportCancel,
  }

  const handlePromptClick = useCallback((id: string) => {
    if (isBusy) return
    switch (id) {
      case 'import-excel':  startImportExcel();     break
      case 'excel-help':    startExcelHelp();        break
      case 'check-org':     startCheckOrgMembers();  break
      case 'check-dept':    startCheckDepartment();  break
      case 'report-line':   startReportLine();       break
      case 'promote':       startPromotePersons();   break
      case 'check-impact':  startCheckImpact();      break
      case 'export-excel':  startExportExcel();      break
    }
  }, [isBusy, startImportExcel, startExcelHelp, startCheckOrgMembers, startCheckDepartment, startReportLine, startPromotePersons, startCheckImpact, startExportExcel])

  const handleTextSubmit = useCallback((text: string) => {
    if (!text.trim() || isBusy) return
    handleUnknownQuery(text)
  }, [isBusy, handleUnknownQuery])

  return {
    widgetCallbacks,
    handlePromptClick,
    handleTextSubmit,
    isBusy,
    activeWidgetMsgId,
  }
}
