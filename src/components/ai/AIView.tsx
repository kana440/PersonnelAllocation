import { useMemo, useCallback } from 'react'
import { useStore } from '../../store/useStore'
import { useChatStore } from '../../store/useChatStore'
import { aiTools } from '../../application/aiTools'
import { appService } from '../../application/HRApplicationService'
import { ChatSession } from '../../application/chatSession'
import { DirectEditOperation } from '../../domain/operation/handlers/directEdit'
import { mockApiService }             from '../../infrastructure/ai/mockApiService'
import { importExcelScenario }        from '../../infrastructure/ai/scenarios/importExcel'
import { excelHelpScenario }          from '../../infrastructure/ai/scenarios/excelHelp'
import { checkOrgMembersScenario }    from '../../infrastructure/ai/scenarios/checkOrgMembers'
import { checkDepartmentScenario, buildOrgTree } from '../../infrastructure/ai/scenarios/checkDepartment'
import { reportLineScenario, buildReportLineMembers } from '../../infrastructure/ai/scenarios/reportLine'
import { promotePersonsScenario }     from '../../infrastructure/ai/scenarios/promotePersons'
import { checkImpactScenario, buildImpactGroups } from '../../infrastructure/ai/scenarios/checkImpact'
import { exportExcelScenario, buildExportChangeSummary } from '../../infrastructure/ai/scenarios/exportExcel'
import type { ChatWidget, PersonDiff, WidgetCallbacks } from './types'
import { AIWelcomeScreen }   from './AIWelcomeScreen'
import { AIMessageThread }   from './AIMessageThread'
import { AIInput }           from './AIInput'

// ── Widget → Phase mapping ─────────────────────────────────────────────────────
import type { ChatPhase } from '../../store/useChatStore'

const WIDGET_PHASE_MAP: Partial<Record<ChatPhase, ChatWidget['type']>> = {
  'awaiting-file':            'file-picker',
  'awaiting-org-name':        'org-input',
  'awaiting-dept-select':     'org-input',
  'awaiting-person-names':    'person-input',
  'awaiting-report-target':   'person-input',
  'awaiting-promote-confirm': 'diff-preview',
  'awaiting-impact-org':      'org-input',
  'awaiting-export-confirm':  'export-confirm',
}

interface Props {
  onOpenEditor: () => void
  onDataLoaded?: () => void
}

export function AIView({ onOpenEditor, onDataLoaded }: Props) {
  const store = useStore()
  const {
    messages, phase, pendingPersons,
    addMessage, updateMessage, clearMessages,
    setPhase, setPendingPersons,
  } = useChatStore()

  const chatSession = useMemo(() => new ChatSession(mockApiService), [])

  const isDataLoaded = store.allocationList.length > 0
  const isBusy = !['idle', 'awaiting-file', 'awaiting-org-name', 'awaiting-dept-select',
    'awaiting-person-names', 'awaiting-report-target', 'awaiting-promote-confirm',
    'awaiting-impact-org', 'awaiting-export-confirm'].includes(phase)

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const addAILoading = useCallback((): string =>
    addMessage({ role: 'ai', text: '', isLoading: true })
  , [addMessage])

  // Compute which message's widget should be interactive
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

  // ── Scenario: unknown query ───────────────────────────────────────────────────
  const handleUnknownQuery = useCallback(async (text: string) => {
    addMessage({ role: 'user', text })
    const id = addAILoading()
    try {
      const snapshot = useChatStore.getState().messages.filter(m => !m.isLoading)
      const reply = await chatSession.send(snapshot, text)
      updateMessage(id, { isLoading: false, text: reply })
    } catch {
      updateMessage(id, { isLoading: false, text: 'エラーが発生しました。' })
    }
  }, [addMessage, addAILoading, updateMessage, chatSession])

  // ── Scenario: import Excel ────────────────────────────────────────────────────
  const startImportExcel = useCallback(async () => {
    addMessage({ role: 'user', text: 'Excelをインポートして開始' })
    const id = addAILoading()
    const text = await importExcelScenario.initialMessage()
    updateMessage(id, { isLoading: false, text, widget: { type: 'file-picker' } })
    setPhase('awaiting-file')
  }, [addMessage, addAILoading, updateMessage, setPhase])

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

  // ── Scenario: excel help ──────────────────────────────────────────────────────
  const startExcelHelp = useCallback(async () => {
    addMessage({ role: 'user', text: 'Excelについて聞く' })
    const id = addAILoading()
    const text = await excelHelpScenario.message()
    updateMessage(id, { isLoading: false, text, widget: { type: 'excel-help' } })
    setPhase('idle')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // ── Scenario: check org members (legacy) ─────────────────────────────────────
  const startCheckOrgMembers = useCallback(async () => {
    addMessage({ role: 'user', text: '組織のメンバーを確認する' })
    const id = addAILoading()
    const text = await checkOrgMembersScenario.promptMessage()
    updateMessage(id, { isLoading: false, text, widget: { type: 'org-input' } })
    setPhase('awaiting-org-name')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // ── Scenario: check department (org tree) ────────────────────────────────────
  const startCheckDepartment = useCallback(async () => {
    addMessage({ role: 'user', text: '担当部門を確認する' })
    const id = addAILoading()
    const text = await checkDepartmentScenario.promptMessage()
    updateMessage(id, { isLoading: false, text, widget: { type: 'org-input' } })
    setPhase('awaiting-dept-select')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // ── Scenario: report line ─────────────────────────────────────────────────────
  const startReportLine = useCallback(async () => {
    addMessage({ role: 'user', text: 'レポートラインを確認する' })
    const id = addAILoading()
    const text = await reportLineScenario.promptMessage()
    updateMessage(id, { isLoading: false, text, widget: { type: 'person-input' } })
    setPhase('awaiting-report-target')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // Org-input submit — dispatches by current phase
  const handleOrgNameSubmit = useCallback(async (orgName: string) => {
    if (phase === 'awaiting-org-name') {
      // Legacy: simple member list
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
          isLoading: false,
          text: reply.text,
          widget: { type: 'org-members', orgName: reply.found.orgName, members: reply.found.members },
        })
      } else {
        updateMessage(id, { isLoading: false, text: reply.text })
      }
      setPhase('idle')

    } else if (phase === 'awaiting-dept-select') {
      // New: org tree view
      setPhase('searching-dept')
      addMessage({ role: 'user', text: orgName })
      const id = addAILoading()
      const org     = aiTools.findOrgs({ name: orgName })[0] ?? null
      const allOrgs = aiTools.getOrgs()
      const allPersons = aiTools.findPersons({})
      const tree = org ? buildOrgTree(org, allOrgs, allPersons) : null
      const reply = await checkDepartmentScenario.searchMessage(orgName, org, tree)
      if ('tree' in reply) {
        updateMessage(id, {
          isLoading: false,
          text: reply.text,
          widget: { type: 'org-tree', orgName: reply.orgName, tree: reply.tree },
        })
      } else {
        updateMessage(id, { isLoading: false, text: reply.text })
      }
      setPhase('idle')

    } else if (phase === 'awaiting-impact-org') {
      // Impact check
      setPhase('checking-impact')
      addMessage({ role: 'user', text: orgName })
      const id = addAILoading()
      const org     = aiTools.findOrgs({ name: orgName })[0] ?? null
      const allOrgs = aiTools.getOrgs()
      const groups  = org ? buildImpactGroups(org, allOrgs, store.allocationList) : []
      const reply = await checkImpactScenario.scanMessage(orgName, org, groups)
      if ('targetOrgName' in reply) {
        updateMessage(id, {
          isLoading: false,
          text: reply.text,
          widget: { type: 'impact-check', targetOrgName: reply.targetOrgName, hasImpact: reply.hasImpact, groups: reply.groups },
        })
      } else {
        updateMessage(id, { isLoading: false, text: reply.text })
      }
      setPhase('idle')
    }
  }, [phase, addMessage, addAILoading, updateMessage, setPhase, store.allocationList])

  // Person-input submit — dispatches by current phase
  const handlePersonNamesSubmit = useCallback(async (namesInput: string) => {
    addMessage({ role: 'user', text: namesInput })

    if (phase === 'awaiting-person-names') {
      // Promote
      setPhase('searching-persons')
      const id = addAILoading()
      const names = namesInput.split(/[,、，]/).map(n => n.trim()).filter(Boolean)
      const diffs: PersonDiff[] = []
      for (const name of names) {
        for (const r of aiTools.findPersons({ name })) {
          const row = aiTools.getRow(r.rowIds[0])
          diffs.push({
            userId:  r.userId,
            name:    r.name,
            orgName: r.orgName,
            rowId:   r.rowIds[0],
            before: { grade: row?.prevPayGrade, position: row?.prevOfficialPositionCode },
            after:  { note: '昇格' },
          })
        }
      }
      const reply = await promotePersonsScenario.confirmMessage(diffs)
      if ('persons' in reply) {
        // Store as PersonMatch for the apply step
        setPendingPersons(reply.persons.map(d => ({
          userId:          d.userId,
          name:            d.name,
          currentOrgName:  d.orgName,
          rowId:           d.rowId,
          currentGrade:    d.before.grade,
          currentPosition: d.before.position,
        })))
        updateMessage(id, {
          isLoading: false,
          text: reply.text,
          widget: { type: 'diff-preview', persons: reply.persons },
        })
        setPhase('awaiting-promote-confirm')
      } else {
        updateMessage(id, { isLoading: false, text: reply.text })
        setPhase('idle')
      }

    } else if (phase === 'awaiting-report-target') {
      // Report line
      setPhase('searching-report')
      const id = addAILoading()
      const name = namesInput.split(/[,、，]/)[0].trim()
      const found = aiTools.findPersons({ name })[0] ?? null
      const allOrgs = aiTools.getOrgs()

      let result: { managerName: string; managerOrgName: string; members: ReturnType<typeof buildReportLineMembers> } | null = null
      if (found) {
        const targetRows = aiTools.getPersonRows(found.userId)
        const members    = buildReportLineMembers(targetRows, store.allocationList, allOrgs)
        result = {
          managerName:    found.name,
          managerOrgName: found.orgName ?? '',
          members,
        }
      }
      const reply = await reportLineScenario.searchMessage(namesInput, result)
      if ('managerName' in reply) {
        updateMessage(id, {
          isLoading: false,
          text: reply.text,
          widget: { type: 'report-line', managerName: reply.managerName, managerOrgName: reply.managerOrgName, members: reply.members },
        })
      } else {
        updateMessage(id, { isLoading: false, text: reply.text })
      }
      setPhase('idle')
    }
  }, [phase, addMessage, addAILoading, updateMessage, setPhase, setPendingPersons, store.allocationList])

  // ── Scenario: promote confirm/cancel ────────────────────────────────────────
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

  // ── Scenario: promote persons ────────────────────────────────────────────────
  const startPromotePersons = useCallback(async () => {
    addMessage({ role: 'user', text: '昇進する人を選択' })
    const id = addAILoading()
    const text = await promotePersonsScenario.promptMessage()
    updateMessage(id, { isLoading: false, text, widget: { type: 'person-input' } })
    setPhase('awaiting-person-names')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // ── Scenario: impact check ────────────────────────────────────────────────────
  const startCheckImpact = useCallback(async () => {
    addMessage({ role: 'user', text: '担当外への影響をチェック' })
    const id = addAILoading()
    const text = await checkImpactScenario.promptMessage()
    updateMessage(id, { isLoading: false, text, widget: { type: 'org-input' } })
    setPhase('awaiting-impact-org')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // ── Scenario: export Excel (with confirm step) ───────────────────────────────
  const startExportExcel = useCallback(async () => {
    addMessage({ role: 'user', text: 'Excelをエクスポート' })
    const id = addAILoading()
    const allOrgs = [...store.organizations, ...store.afterOrganizations]
    const { changeCount, groups } = buildExportChangeSummary(store.allocationList, allOrgs)
    const text = await exportExcelScenario.confirmMessage()
    updateMessage(id, {
      isLoading: false,
      text,
      widget: { type: 'export-confirm', changeCount, groups },
    })
    setPhase('awaiting-export-confirm')
  }, [addMessage, addAILoading, updateMessage, setPhase, store])

  const handleExportConfirm = useCallback(async () => {
    setPhase('exporting')
    const id = addAILoading()
    const startText = '出力中です...'
    updateMessage(id, { isLoading: true, text: startText })

    try {
      const { buffer, fileName } = await exportExcelScenario.buildBuffer(
        store.allocationList,
        store.organizations,
        store.afterOrganizations,
        store.effectiveDate,
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

  // ── Routing ───────────────────────────────────────────────────────────────────
  const handlePromptClick = useCallback((id: string) => {
    if (isBusy) return
    switch (id) {
      case 'import-excel':   startImportExcel();      break
      case 'excel-help':     startExcelHelp();        break
      case 'check-org':      startCheckOrgMembers();  break
      case 'check-dept':     startCheckDepartment();  break
      case 'report-line':    startReportLine();       break
      case 'promote':        startPromotePersons();   break
      case 'check-impact':   startCheckImpact();      break
      case 'export-excel':   startExportExcel();      break
    }
  }, [isBusy, startImportExcel, startExcelHelp, startCheckOrgMembers, startCheckDepartment, startReportLine, startPromotePersons, startCheckImpact, startExportExcel])

  const handleTextSubmit = useCallback((text: string) => {
    if (!text.trim() || isBusy) return
    handleUnknownQuery(text)
  }, [isBusy, handleUnknownQuery])

  const widgetCallbacks: WidgetCallbacks = {
    onFileSelected:      handleFileSelected,
    onOrgNameSubmit:     handleOrgNameSubmit,
    onPersonNamesSubmit: handlePersonNamesSubmit,
    onPromoteConfirm:    handlePromoteConfirm,
    onPromoteCancel:     handlePromoteCancel,
    onExportConfirm:     handleExportConfirm,
    onExportCancel:      handleExportCancel,
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-white text-xs font-bold">AI</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">人事 AI アシスタント</h1>
            <p className="text-xs text-amber-600">モックモード</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              disabled={isBusy}
              className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              title="会話履歴をクリア"
            >
              ↺ クリア
            </button>
          )}
          <button
            onClick={onOpenEditor}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            エディターを開く →
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {messages.length === 0 ? (
          <AIWelcomeScreen
            isDataLoaded={isDataLoaded}
            onPromptClick={handlePromptClick}
          />
        ) : (
          <AIMessageThread
            messages={messages}
            activeWidgetMsgId={activeWidgetMsgId}
            callbacks={widgetCallbacks}
          />
        )}
      </div>

      {/* Suggested prompt chips */}
      {messages.length > 0 && isDataLoaded && phase === 'idle' && (
        <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 pt-2 pb-0">
          <div className="max-w-2xl mx-auto flex flex-wrap gap-2">
            {[
              { id: 'check-dept',   label: '🏢 担当部門を確認する' },
              { id: 'report-line',  label: '📋 レポートラインを確認する' },
              { id: 'promote',      label: '⬆️ 昇進する人を選択' },
              { id: 'check-impact', label: '🔍 担当外への影響をチェック' },
              { id: 'export-excel', label: '📤 Excelをエクスポート' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => handlePromptClick(p.id)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-full hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Text input */}
      {messages.length > 0 && (
        <div className="flex-shrink-0">
          <AIInput onSubmit={handleTextSubmit} disabled={isBusy || phase !== 'idle'} />
        </div>
      )}
    </div>
  )
}
