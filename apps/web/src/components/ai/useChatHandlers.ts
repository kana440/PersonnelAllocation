import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { useChatStore } from '../../store/useChatStore'
import { useSkillStore } from '../../store/skillStore'
import { aiTools } from '../../application/aiTools'
import { appService } from '../../application/HRApplicationService'
import { ChatSession, buildSystemPrompt, type SessionState } from '../../application/chatSession'
import { DirectEditOperation } from '@personnel/domain/commands/handlers/directEdit'
import { mockApiService } from '../../infrastructure/ai/chatServiceFactory'
import type { AgentRunner, SkillToolEntry } from '../../infrastructure/ai/agentRunner'
import type { InMemoryTraceObserver } from '../../infrastructure/ai/aiTrace'
import { importExcelScenario }        from '../../infrastructure/ai/scenarios/importExcel'
import { excelHelpScenario }          from '../../infrastructure/ai/scenarios/excelHelp'
import { checkOrgMembersScenario }    from '../../infrastructure/ai/scenarios/checkOrgMembers'
import { checkDepartmentScenario, buildOrgTree } from '../../infrastructure/ai/scenarios/checkDepartment'
import { reportLineScenario, buildReportLineMembers } from '../../infrastructure/ai/scenarios/reportLine'
import { promotePersonsScenario }     from '../../infrastructure/ai/scenarios/promotePersons'
import { checkImpactScenario, buildImpactGroups } from '../../infrastructure/ai/scenarios/checkImpact'
import { exportExcelScenario, buildExportChangeSummary } from '../../infrastructure/ai/scenarios/exportExcel'
import type { ChatWidget, ClassificationWidgetData, ConversationItem, ConfirmResult, PersonDiff, WidgetCallbacks } from '../../application/aiTypes'
import type { ChatPhase } from '../../store/useChatStore'
import { feedbackStore, CURRENT_SESSION_ID } from '../../infrastructure/ai/feedback/feedbackStore'
import { buildClassifierPrompt, parseClassifierOutput } from '../../infrastructure/ai/feedback/correctionClassifier'
import { toolRegistry } from '../../infrastructure/ai/toolRegistry'
import type { Skill } from '../../infrastructure/skills/types'

const AFFIRMATIONS = ['進めて', 'はい', 'yes', 'ok', 'やって', '適用', '確認して']
const isAffirmation = (text: string) =>
  AFFIRMATIONS.some(a => text.trim().toLowerCase().includes(a.toLowerCase()))

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
  traceObserver,
}: {
  agentRunner:    AgentRunner | null
  traceObserver?: InMemoryTraceObserver
}) {
  const store = useStore()
  const {
    messages, phase, pendingPersons,
    addMessage, updateMessage,
    setPhase, setPendingPersons,
  } = useChatStore()

  const buildCurrentSystemPrompt = useCallback(() => {
    const { scopeOrgId, afterOrganizations } = useStore.getState()
    const { chatContextRowIds } = useChatStore.getState()
    const { activeSkills } = useSkillStore.getState()
    const scopeOrg = scopeOrgId ? afterOrganizations.find(o => o.id === scopeOrgId) : null
    const rowCtxs  = chatContextRowIds
      .map(id => aiTools.getRowContext(id))
      .filter((c): c is NonNullable<typeof c> => c !== null)
    const reviewSummary = aiTools.getReviewSummary()
    const session: SessionState = {
      changedCount:  reviewSummary.changedRows,
      errorCount:    reviewSummary.errorCount,
      warningCount:  reviewSummary.warningCount,
    }
    const base = buildSystemPrompt(
      scopeOrg?.name,
      scopeOrg?.externalCode ?? undefined,
      rowCtxs.length > 0 ? rowCtxs : undefined,
      session,
    )
    // 学習済み業務ルールをシステムプロンプトに注入
    const learnedRules = feedbackStore.getAppliedRules()
      .filter(r => r.kind === 'learned_rule' && r.isActive)
      .map(r => `- ${r.newContent}`)
      .join('\n')
    const withRules = learnedRules
      ? `${base}\n\n【学習済み業務ルール】\n${learnedRules}`
      : base

    // スキルのメタデータだけをヒントとして注入（full instructions はツール呼び出し時に渡す）
    if (activeSkills.length === 0) return withRules
    const skillHint = [
      '# 利用可能なスキル',
      '以下のスキルに該当するタスクが来た場合は、テキストで回答する前に必ずスキルツールを呼び出してから作業を開始してください。',
      '',
      ...activeSkills.map(s =>
        `- **${s.name}** (\`skill_${s.slug.replace(/-/g, '_')}\`): ${s.description}`
      ),
    ].join('\n')
    return `${withRules}\n\n${skillHint}`
  }, [])

  const buildSkillEntries = useCallback((): SkillToolEntry[] => {
    const { activeSkills } = useSkillStore.getState()
    return activeSkills.map(s => ({
      slug:         s.slug,
      name:         s.name,
      instructions: s.instructions,
      allowedTools: s.allowedTools,  // SKILL.md の allowed-tools（スキル起動後のツール絞り込み用）
      definition: {
        type: 'function' as const,
        function: {
          name:        `skill_${s.slug.replace(/-/g, '_')}`,
          description: s.description || `スキル: ${s.name}`,
          parameters:  { type: 'object', properties: {} },
        },
      },
    }))
  }, [])

  const chatSession = useMemo(() => new ChatSession(mockApiService), [])

  const [isAgentRunning, setIsAgentRunning] = useState(false)

  const isBusy = isAgentRunning || !BUSY_EXEMPT_PHASES.includes(phase)

  // Pending confirm: most recent message with llmConfirm set (agent loop awaiting user approval)
  const pendingConfirmMsg = [...messages].reverse().find(m => !!m.llmConfirm) ?? null

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

    // confirm ツールが呼ばれたとき、ローディングバブルを確認ウィジェットに切り替え、
    // ユーザーが操作するまで agentRunner のループを Promise で停止する。
    const onConfirm = (widget: ChatWidget): Promise<ConfirmResult> =>
      new Promise(resolve => {
        updateMessage(id, {
          isLoading:  false,
          text:       '以下の内容を確認してください。',
          widget,
          llmConfirm: () => {
            updateMessage(id, { isLoading: true, text: '適用中...', widget: undefined, llmConfirm: undefined, llmCancel: undefined })
            resolve({ approved: true })
          },
          llmCancel: () => {
            updateMessage(id, { isLoading: true, text: 'キャンセル処理中...', widget: undefined, llmConfirm: undefined, llmCancel: undefined })
            resolve({ approved: false })
          },
        })
      })

    setIsAgentRunning(true)
    try {
      let replyText: string
      let replyWidget: ChatWidget | undefined
      if (agentRunner) {
        const result = await agentRunner.run(snapshot, text, {
          onProgress:   (label: string) => updateMessage(id, { text: label }),
          onConfirm,
          systemPrompt: buildCurrentSystemPrompt(),
          skillEntries: buildSkillEntries(),
        })
        replyText   = result.text
        replyWidget = result.widget
      } else {
        // Mock / fallback
        replyText = await chatSession.send(snapshot, text)
      }
      updateMessage(id, { isLoading: false, text: replyText, widget: replyWidget, llmConfirm: undefined, llmCancel: undefined })
    } catch (err) {
      updateMessage(id, { isLoading: false, text: `エラーが発生しました: ${String(err)}`, llmConfirm: undefined, llmCancel: undefined })
    } finally {
      setIsAgentRunning(false)
    }
  }, [addMessage, addAILoading, updateMessage, agentRunner, chatSession, setIsAgentRunning, traceObserver])

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
    } catch (e) {
      updateMessage(id, { isLoading: false, text: importExcelScenario.errorMessage(e) })
    }
    setPhase('idle')
  }, [addMessage, addAILoading, updateMessage, setPhase, store])

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
        new DirectEditOperation(p.rowId, { promotionSign: '1' }, `${p.name} 昇格`)
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

  // ── Teach AI (Phase 1 — STEP1 active learning) ────────────────────────────────

  // 起動時: 適用済みtool descriptionをlocalStorageから復元
  useEffect(() => {
    const activeDescriptions = Object.fromEntries(
      feedbackStore.getAppliedRules()
        .filter(r => r.kind === 'tool_description' && r.isActive)
        .map(r => [r.targetKey, r.newContent])
    )
    if (Object.keys(activeDescriptions).length > 0) {
      toolRegistry.applyDescriptionOverrides(activeDescriptions)
    }
  }, [])

  // 「AIに教える」ボタン → 訂正入力ウィジェットを追加
  const handleTeachAI = useCallback((messageId: string) => {
    const currentMessages = useChatStore.getState().messages
    const msgIndex = currentMessages.findIndex(m => m.id === messageId)
    const window: ConversationItem[] = currentMessages
      .slice(Math.max(0, msgIndex - 9), msgIndex + 1)
      .filter(m => !m.isLoading)
      .map(m => ({
        role:    m.role === 'user' ? 'user' : 'assistant' as const,
        content: m.text,
      }))
    addMessage({
      role:   'ai',
      text:   'どのように修正すべきかを説明してください。',
      widget: { type: 'teach-ai-input', conversationWindow: window },
    })
  }, [addMessage])

  const handleTeachAICancel = useCallback(() => {
    // 最後の teach-ai-input メッセージを削除（updatemessage で widget を外す）
    const msgs = useChatStore.getState().messages
    const last = [...msgs].reverse().find(m => m.widget?.type === 'teach-ai-input')
    if (last) updateMessage(last.id, { widget: undefined, text: 'キャンセルしました。' })
  }, [updateMessage])

  // 訂正送信 → 分類器を起動し結果をチャットに表示
  const handleTeachAISubmit = useCallback(async (
    correction: string,
    conversationWindow: ConversationItem[],
  ) => {
    if (!agentRunner) {
      addMessage({ role: 'ai', text: 'AI接続が設定されていないため、分類できません。' })
      return
    }

    // 訂正入力ウィジェットを「分類中...」に切り替え
    const msgs = useChatStore.getState().messages
    const inputMsg = [...msgs].reverse().find(m => m.widget?.type === 'teach-ai-input')
    const loadingId = inputMsg
      ? (updateMessage(inputMsg.id, { widget: undefined, text: '🔍 分類中...', isLoading: true }), inputMsg.id)
      : addAILoading()

    // CorrectionCapture を保存
    const captureId = `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    feedbackStore.saveCapture({
      id:                 captureId,
      sessionId:          CURRENT_SESSION_ID,
      trigger:            'explicit',
      conversationWindow,
      userCorrection:     correction,
      createdAt:          Date.now(),
    })

    try {
      // ツール説明文の一覧を取得（分類器への入力）
      const toolDescriptions = Object.fromEntries(
        toolRegistry.definitions.map(d => [
          d.function.name,
          d.function.description ?? '',
        ])
      )
      const prompt = buildClassifierPrompt(
        { id: captureId, sessionId: CURRENT_SESSION_ID, trigger: 'explicit', conversationWindow, userCorrection: correction, createdAt: Date.now() },
        toolDescriptions,
      )
      const raw = await agentRunner.runRaw([{ role: 'user', content: prompt }])
      const classified = raw ? parseClassifierOutput(captureId, raw) : null

      if (!classified) {
        updateMessage(loadingId, { isLoading: false, text: '分類に失敗しました。もう一度お試しください。' })
        return
      }

      feedbackStore.saveClassified(classified)
      updateMessage(loadingId, {
        isLoading: false,
        text:      '',
        widget:    { type: 'classification-result', classified: classified as unknown as ClassificationWidgetData },
      })
    } catch (err) {
      updateMessage(loadingId, { isLoading: false, text: `エラーが発生しました: ${String(err)}` })
    }
  }, [agentRunner, addMessage, addAILoading, updateMessage])

  // 分類結果を適用
  const handleClassificationApply = useCallback(async (classified: ClassificationWidgetData) => {
    const makeRuleId = () => `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    if (classified.kind === 'tool_description_issue' && classified.toolDescriptionDraft) {
      const { targetTool, currentDescription, proposedDescription } = classified.toolDescriptionDraft
      toolRegistry.applyDescriptionOverrides({ [targetTool]: proposedDescription })
      feedbackStore.saveAppliedRule({
        id:                makeRuleId(),
        kind:              'tool_description',
        targetKey:         targetTool,
        prevContent:       currentDescription,
        newContent:        proposedDescription,
        appliedAt:         Date.now(),
        isActive:          true,
        basedOnProposedId: classified.id,
      })

    } else if (classified.kind === 'business_rule_gap' && classified.businessRuleDraft) {
      const ruleKey = makeRuleId()
      feedbackStore.saveAppliedRule({
        id:                ruleKey,
        kind:              'learned_rule',
        targetKey:         ruleKey,
        newContent:        classified.businessRuleDraft.ruleText,
        appliedAt:         Date.now(),
        isActive:          true,
        basedOnProposedId: classified.id,
      })

    } else if (classified.kind === 'workflow_pattern' && classified.skillDraft) {
      const draft = classified.skillDraft
      const skill: Skill = {
        slug:         draft.slug,
        name:         draft.name,
        description:  draft.description,
        instructions: draft.instructions,
        allowedTools: draft.allowedTools,
        status:       'active',
        isBuiltin:    false,
        updatedAt:    new Date().toISOString(),
      }
      await useSkillStore.getState().save(skill)
      feedbackStore.saveAppliedRule({
        id:                makeRuleId(),
        kind:              'skill',
        targetKey:         draft.slug,
        newContent:        draft.name,
        appliedAt:         Date.now(),
        isActive:          true,
        basedOnProposedId: classified.id,
      })

    } else if ((classified.kind === 'tool_logic_bug' || classified.kind === 'missing_tool') && classified.codeFixDraft) {
      feedbackStore.saveCodeFix({
        id:               `fix-${Date.now().toString(36)}`,
        classification:   classified.kind,
        targetKey:        classified.codeFixDraft.targetTool,
        title:            classified.codeFixDraft.title,
        description:      classified.codeFixDraft.description,
        expectedBehavior: classified.codeFixDraft.expectedBehavior,
        exampleInputs:    [],
        status:           'pending',
        createdAt:        Date.now(),
      })
    }

    // 分類結果のステータスを更新
    const stored = feedbackStore.getClassified().find(c => c.id === classified.id)
    if (stored) feedbackStore.saveClassified({ ...stored, status: 'applied' })

    // ウィジェットのステータスを即時更新して「適用済み」と表示
    const msgs = useChatStore.getState().messages
    const target = msgs.find(m => m.widget?.type === 'classification-result' && (m.widget as { classified: ClassificationWidgetData }).classified.id === classified.id)
    if (target) {
      updateMessage(target.id, {
        widget: {
          type:       'classification-result',
          classified: { ...classified, status: 'applied' },
        },
      })
    }

    const kindMsg: Record<string, string> = {
      tool_description_issue: 'ツール説明を更新しました。次のメッセージから有効です。',
      business_rule_gap:      '業務ルールを追加しました。次のメッセージから有効です。',
      workflow_pattern:       'スキルを作成しました。次のメッセージから利用できます。',
      tool_logic_bug:         'Code Fix依頼として記録しました。',
      missing_tool:           'Code Fix依頼として記録しました。',
    }
    addMessage({ role: 'ai', text: kindMsg[classified.kind] ?? '適用しました。' })
  }, [addMessage, updateMessage])

  const handleClassificationReject = useCallback((classifiedId: string) => {
    const stored = feedbackStore.getClassified().find(c => c.id === classifiedId)
    if (stored) feedbackStore.saveClassified({ ...stored, status: 'rejected' })

    const msgs = useChatStore.getState().messages
    const target = msgs.find(m =>
      m.widget?.type === 'classification-result' &&
      (m.widget as { classified: ClassificationWidgetData }).classified.id === classifiedId
    )
    if (target) {
      updateMessage(target.id, {
        widget: {
          type:       'classification-result',
          classified: { ...(target.widget as { classified: ClassificationWidgetData }).classified, status: 'rejected' },
        },
      })
    }
  }, [updateMessage])

  // ── assembled callbacks & routing ─────────────────────────────────────────────
  const widgetCallbacks: WidgetCallbacks = {
    onFileSelected:          handleFileSelected,
    onImportCancel:          handleImportCancel,
    onOrgNameSubmit:         handleOrgNameSubmit,
    onPersonNamesSubmit:     handlePersonNamesSubmit,
    onPromoteConfirm:        handlePromoteConfirm,
    onPromoteCancel:         handlePromoteCancel,
    onExportConfirm:         handleExportConfirm,
    onExportCancel:          handleExportCancel,
    onTeachAI:               handleTeachAI,
    onTeachAICancel:         handleTeachAICancel,
    onTeachAISubmit:         handleTeachAISubmit,
    onClassificationApply:   handleClassificationApply,
    onClassificationReject:  handleClassificationReject,
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
    if (!text.trim()) return
    // Pending confirm widget: intercept affirmation words and auto-confirm instead of starting a new run
    if (pendingConfirmMsg?.llmConfirm && isAffirmation(text)) {
      addMessage({ role: 'user', text })
      pendingConfirmMsg.llmConfirm()
      return
    }
    if (isBusy) return
    handleUnknownQuery(text)
  }, [isBusy, handleUnknownQuery, pendingConfirmMsg, isAffirmation, addMessage])

  return {
    widgetCallbacks,
    handlePromptClick,
    handleTextSubmit,
    isBusy,
    activeWidgetMsgId,
  }
}
