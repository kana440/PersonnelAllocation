import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { useChatStore } from '../../store/useChatStore'
import { useSkillStore } from '../../store/skillStore'
import { aiTools } from '../../application/aiTools'
import { ChatSession, buildSystemPrompt, type SessionState } from '../../application/chatSession'
import { mockApiService } from '../../infrastructure/ai/chatServiceFactory'
import type { AgentRunner, SkillToolEntry } from '../../infrastructure/ai/agentRunner'
import type { InMemoryTraceObserver } from '../../infrastructure/ai/aiTrace'
import { importFromFile, buildExportBuffer } from '../../infrastructure/excel/engine'
import { toAllocationRows } from '../../infrastructure/allocationListMapper'
import { buildExportChangeSummary } from '../../infrastructure/excel/exportSummary'
import type { ChatWidget, ClassificationWidgetData, ConversationItem, ConfirmResult, WidgetCallbacks } from '../../application/aiTypes'
import type { ChatPhase } from '../../store/useChatStore'
import { feedbackStore, CURRENT_SESSION_ID } from '../../infrastructure/ai/feedback/feedbackStore'
import { buildClassifierPrompt, parseClassifierOutput } from '../../infrastructure/ai/feedback/correctionClassifier'
import { toolRegistry } from '../../infrastructure/ai/toolRegistry'
import type { Skill } from '../../infrastructure/skills/types'

const AFFIRMATIONS = ['進めて', 'はい', 'yes', 'ok', 'やって', '適用', '確認して']
const isAffirmation = (text: string) =>
  AFFIRMATIONS.some(a => text.trim().toLowerCase().includes(a.toLowerCase()))

export const WIDGET_PHASE_MAP: Partial<Record<ChatPhase, ChatWidget['type']>> = {
  'awaiting-file':           'file-picker',
  'awaiting-export-confirm': 'export-confirm',
}

const BUSY_EXEMPT_PHASES: ChatPhase[] = [
  'idle', 'awaiting-file', 'awaiting-export-confirm',
]

export function useChatHandlers({
  agentRunner,
}: {
  agentRunner:    AgentRunner | null
  traceObserver?: InMemoryTraceObserver
}) {
  const store = useStore()
  const {
    messages, phase,
    addMessage, updateMessage,
    setPhase,
  } = useChatStore()

  const buildCurrentSystemPrompt = useCallback((highlightSkills?: Skill[]) => {
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
    const learnedRules = feedbackStore.getAppliedRules()
      .filter(r => r.kind === 'learned_rule' && r.isActive)
      .map(r => `- ${r.newContent}`)
      .join('\n')
    const withRules = learnedRules
      ? `${base}\n\n【学習済み業務ルール】\n${learnedRules}`
      : base

    if (activeSkills.length === 0) return withRules
    const skillHint = [
      '# 利用可能なスキル',
      '以下のスキルに該当するタスクが来た場合は、テキストで回答する前に必ずスキルツールを呼び出してから作業を開始してください。',
      '',
      ...activeSkills.map(s =>
        `- **${s.name}** (\`skill_${s.slug.replace(/-/g, '_')}\`): ${s.description}`
      ),
    ].join('\n')

    const highlightNote = highlightSkills && highlightSkills.length > 0
      ? `\n\n【このリクエストに適用するスキル】\n${highlightSkills.map(s => `- ${s.name}`).join('\n')}\nまずこのスキルツールを呼び出してください。`
      : ''

    return `${withRules}\n\n${skillHint}${highlightNote}`
  }, [])

  /** 指定スキル（未指定時は全アクティブスキル）を SkillToolEntry に変換する。 */
  const buildSkillEntries = useCallback((skills?: Skill[]): SkillToolEntry[] => {
    const effectiveSkills = skills ?? useSkillStore.getState().activeSkills
    return effectiveSkills.map(s => ({
      slug:         s.slug,
      name:         s.name,
      instructions: s.instructions,
      allowedTools: s.allowedTools,
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
  /** 直前のターンで使われたパス（Fast / Structured）。透明性表示に使う。 */
  const [lastRunPath, setLastRunPath] = useState<'fast' | 'structured' | null>(null)
  /** 直前の Structured Path で選択されたスキル slug。フィードバック送信時に付与する。 */
  const [lastRunSkills, setLastRunSkills] = useState<string[]>([])

  const isBusy = isAgentRunning || !BUSY_EXEMPT_PHASES.includes(phase)

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
    const snapshot = useChatStore.getState().messages.filter(m => !m.isLoading)
    addMessage({ role: 'user', text })
    const id = addAILoading()

    const onConfirm = (proposal: { widget: ChatWidget; formInputs?: import('../../application/aiTypes').FormInput[] }): Promise<ConfirmResult> =>
      new Promise(resolve => {
        updateMessage(id, {
          isLoading:  false,
          text:       '以下の内容を確認してください。',
          widget:     proposal.widget,
          llmConfirm: () => {
            updateMessage(id, { isLoading: true, text: '適用中...', widget: undefined, llmConfirm: undefined, llmCancel: undefined })
            // formInputs の現在値を userInputs として収集（初期値をそのまま使用）
            const userInputs = proposal.formInputs?.reduce<Record<string, string>>((acc, f) => {
              if (f.value != null) acc[f.field] = f.value
              return acc
            }, {})
            resolve({ approved: true, userInputs })
          },
          llmCancel: () => {
            updateMessage(id, { isLoading: true, text: 'キャンセル処理中...', widget: undefined, llmConfirm: undefined, llmCancel: undefined })
            resolve({ approved: false })
          },
        })
      })

    setIsAgentRunning(true)
    try {
      let replyText   = ''
      let replyWidget: ChatWidget | undefined
      let runPath: 'fast' | 'structured' = 'fast'
      let runSkills: string[] = []
      let runToolCallNames: string[] = []

      if (agentRunner) {
        const systemPrompt = buildCurrentSystemPrompt()

        // ── Step 1: Fast Path ────────────────────────────────────────────────
        const fastResult = await agentRunner.runFastPath(snapshot, text, {
          onProgress: (label) => updateMessage(id, { text: label }),
          onConfirm,
          systemPrompt,
        })
        runToolCallNames = fastResult.toolCallNames

        if (fastResult.kind === 'final') {
          runPath     = 'fast'
          replyText   = fastResult.text
          replyWidget = fastResult.widget

        } else {
          // ── Step 2: Structured Path ───────────────────────────────────────
          runPath = 'structured'
          const frame = fastResult.frame

          const { activeSkills } = useSkillStore.getState()
          const candidateSlugs   = frame.skillCandidates ?? []
          const matchedSkills    = candidateSlugs.length > 0
            ? activeSkills.filter(s => candidateSlugs.includes(s.slug))
            : []
          runSkills = matchedSkills.map(s => s.slug)

          const structuredSystemPrompt = buildCurrentSystemPrompt(matchedSkills)
          const skillEntries           = buildSkillEntries(
            matchedSkills.length > 0 ? matchedSkills : undefined
          )

          updateMessage(id, { text: '詳細な手順で処理中...' })

          const structuredResult = await agentRunner.run(snapshot, text, {
            onProgress: (label) => updateMessage(id, { text: label }),
            onConfirm,
            systemPrompt: structuredSystemPrompt,
            skillEntries,
          })
          replyText        = structuredResult.text
          replyWidget      = structuredResult.widget
          runToolCallNames = [...runToolCallNames, ...structuredResult.toolCallNames]
        }

        setLastRunPath(runPath)
        setLastRunSkills(runSkills)

        feedbackStore.saveRunLog({
          id:          `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          sessionId:   CURRENT_SESSION_ID,
          userMessage: text,
          path:        runPath,
          selectedSkills:  runSkills.length > 0        ? runSkills        : undefined,
          toolCallNames:   runToolCallNames.length > 0 ? runToolCallNames : undefined,
          finalResponse:   replyText,
          createdAt:   Date.now(),
        })

      } else {
        replyText = await chatSession.send(snapshot, text)
      }

      updateMessage(id, { isLoading: false, text: replyText, widget: replyWidget, llmConfirm: undefined, llmCancel: undefined })
    } catch (err) {
      updateMessage(id, { isLoading: false, text: `エラーが発生しました: ${String(err)}`, llmConfirm: undefined, llmCancel: undefined })
    } finally {
      setIsAgentRunning(false)
    }
  }, [addMessage, addAILoading, updateMessage, agentRunner, chatSession, setIsAgentRunning, buildCurrentSystemPrompt, buildSkillEntries])

  // ── import Excel ──────────────────────────────────────────────────────────────
  const startImportExcel = useCallback(async () => {
    addMessage({ role: 'user', text: 'Excelをインポートして開始' })
    const id = addAILoading()
    updateMessage(id, {
      isLoading: false,
      text: 'Excelファイルを選択してください。要員配置リスト・組織CD一覧・各種TBLシートが含まれたファイルに対応しています。',
      widget: { type: 'file-picker' },
    })
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
      const result = await importFromFile(file, msg => updateMessage(id, { text: msg }))
      await store.loadExcelData(result)
      updateMessage(id, {
        isLoading: false,
        text: `読み込みが完了しました。\n\n• 要員データ: ${result.allocationRowCount.toLocaleString()} 件\n• 組織データ: ${result.orgEntries.length} 件\n\n続けて操作を選択してください。`,
      })
    } catch (e) {
      updateMessage(id, {
        isLoading: false,
        text: `読み込みエラーが発生しました: ${String(e)}\n別のファイルで試してください。`,
      })
    }
    setPhase('idle')
  }, [addMessage, addAILoading, updateMessage, setPhase, store])

  // ── excel help ────────────────────────────────────────────────────────────────
  const startExcelHelp = useCallback(async () => {
    addMessage({ role: 'user', text: 'Excelについて聞く' })
    const id = addAILoading()
    updateMessage(id, {
      isLoading: false,
      text: '対応しているExcelファイルの形式は以下の通りです。',
      widget: { type: 'excel-help' },
    })
    setPhase('idle')
  }, [addMessage, addAILoading, updateMessage, setPhase])

  // ── export Excel ──────────────────────────────────────────────────────────────
  const startExportExcel = useCallback(async () => {
    addMessage({ role: 'user', text: 'Excelをエクスポート' })
    const id = addAILoading()
    const allOrgs = [...store.organizations, ...store.afterOrganizations]
    const { changeCount, groups } = buildExportChangeSummary(store.allocationList, allOrgs)
    updateMessage(id, {
      isLoading: false,
      text: '変更内容を確認しました。出力内容を確認してください。',
      widget: { type: 'export-confirm', changeCount, groups },
    })
    setPhase('awaiting-export-confirm')
  }, [addMessage, addAILoading, updateMessage, setPhase, store])

  const handleExportConfirm = useCallback(async () => {
    setPhase('exporting')
    const id = addAILoading()
    updateMessage(id, { isLoading: true, text: '出力中です...' })
    try {
      const { organizations: beforeOrgs, afterOrganizations: afterOrgs, allocationList, effectiveDate } = store
      const allOrgs = [
        ...beforeOrgs,
        ...afterOrgs.filter(o => !beforeOrgs.find(b => b.id === o.id)),
      ]
      const rows = toAllocationRows(allocationList, allOrgs)
      const { buffer, fileName } = await buildExportBuffer(rows, effectiveDate)
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
      updateMessage(id, { isLoading: false, text: `「${fileName}」のエクスポートが完了しました。` })
    } catch (e) {
      const text = (e instanceof DOMException && e.name === 'AbortError')
        ? 'エクスポートをキャンセルしました。'
        : `エクスポートエラーが発生しました: ${String(e)}`
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
    const msgs = useChatStore.getState().messages
    const last = [...msgs].reverse().find(m => m.widget?.type === 'teach-ai-input')
    if (last) updateMessage(last.id, { widget: undefined, text: 'キャンセルしました。' })
  }, [updateMessage])

  const handleTeachAISubmit = useCallback(async (
    correction: string,
    conversationWindow: ConversationItem[],
  ) => {
    if (!agentRunner) {
      addMessage({ role: 'ai', text: 'AI接続が設定されていないため、分類できません。' })
      return
    }

    const msgs = useChatStore.getState().messages
    const inputMsg = [...msgs].reverse().find(m => m.widget?.type === 'teach-ai-input')
    const loadingId = inputMsg
      ? (updateMessage(inputMsg.id, { widget: undefined, text: '🔍 分類中...', isLoading: true }), inputMsg.id)
      : addAILoading()

    const captureId = `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    feedbackStore.saveCapture({
      id:             captureId,
      sessionId:      CURRENT_SESSION_ID,
      trigger:        'explicit',
      conversationWindow,
      userCorrection: correction,
      createdAt:      Date.now(),
      agentPath:      lastRunPath ?? undefined,
      selectedSkills: lastRunSkills.length > 0 ? lastRunSkills : undefined,
    })

    try {
      const toolDescriptions = Object.fromEntries(
        toolRegistry.definitions.map(d => [
          d.function.name,
          d.function.description ?? '',
        ])
      )
      const prompt = buildClassifierPrompt(
        {
          id: captureId, sessionId: CURRENT_SESSION_ID, trigger: 'explicit',
          conversationWindow, userCorrection: correction, createdAt: Date.now(),
          agentPath:      lastRunPath ?? undefined,
          selectedSkills: lastRunSkills.length > 0 ? lastRunSkills : undefined,
        },
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
  }, [agentRunner, addMessage, addAILoading, updateMessage, lastRunPath, lastRunSkills])

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

    const stored = feedbackStore.getClassified().find(c => c.id === classified.id)
    if (stored) feedbackStore.saveClassified({ ...stored, status: 'applied' })

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
    onFileSelected:         handleFileSelected,
    onImportCancel:         handleImportCancel,
    onExportConfirm:        handleExportConfirm,
    onExportCancel:         handleExportCancel,
    onTeachAI:              handleTeachAI,
    onTeachAICancel:        handleTeachAICancel,
    onTeachAISubmit:        handleTeachAISubmit,
    onClassificationApply:  handleClassificationApply,
    onClassificationReject: handleClassificationReject,
  }

  const handlePromptClick = useCallback((id: string) => {
    if (isBusy) return
    switch (id) {
      case 'import-excel': startImportExcel();  break
      case 'excel-help':   startExcelHelp();    break
      case 'export-excel': startExportExcel();  break
    }
  }, [isBusy, startImportExcel, startExcelHelp, startExportExcel])

  const handleTextSubmit = useCallback((text: string) => {
    if (!text.trim()) return
    if (pendingConfirmMsg?.llmConfirm && isAffirmation(text)) {
      addMessage({ role: 'user', text })
      pendingConfirmMsg.llmConfirm()
      return
    }
    if (isBusy) return
    handleUnknownQuery(text)
  }, [isBusy, handleUnknownQuery, pendingConfirmMsg, addMessage])

  return {
    widgetCallbacks,
    handlePromptClick,
    handleTextSubmit,
    isBusy,
    activeWidgetMsgId,
    /** 直前のターンで使われた実行パス（透明性表示用）。 */
    lastRunPath,
  }
}
