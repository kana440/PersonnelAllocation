// Tool registry — classifies tools into four kinds and exposes them to AgentRunner.
//
// read    : 即時実行し結果をLLMに返す（副作用なし）
// render  : ウィジェットをUIに表示しつつ要約をLLMに返す（副作用：Widget表示）
// execute : ユーザー確認なしで即時実行する（副作用：ドメイン変更）。LLMが変更内容を自然言語で報告。
// confirm : ユーザーの確認を待ってから操作を適用する（副作用：ドメイン変更）。複数入力が必要な操作に使う。
//
// confirm ツールの実際の実行は AgentRunner の onConfirm コールバック経由で行われ、
// ユーザーが承認した場合のみ executeOnApprove が呼ばれる。
//
// ツール名プレフィックス規約:
//   ui_*       : UIナビゲーション専用（表示位置の変更のみ・ドメインデータは変更しない）
//   propose_*  : ドメイン変更操作（execute / confirm）
//   find* / get* : 読み取り系（read / render）

// toolRegistry — LLMプロトコルアダプター。
//
// 責務: ToolDefinition（JSONスキーマ）の定義 + aiTools/proposalBuilders へのルーティングのみ。
// ビジネスロジックは aiTools/ に、確認ウィジェット組み立ては proposalBuilders.ts に置く。
// 設計思想: specs/G4-ai/00-design-philosophy.md

import type { ChatWidget, PersonDiff, PersonInfo } from '../../application/aiTypes'
import { aiTools } from '../../application/aiTools'
import { appService } from '../../application/HRApplicationService'
import { useStore } from '../../store/useStore'
import { useUICommandStore } from '../../store/uiCommandStore'
import { useFormStateStore } from '../../store/formStateStore'
import * as P from './proposalBuilders'
import {
  bindOperation,
  secondmentOutReleaseSFDef,
  concurrentSecondmentOutSFDef,
  employmentTransferDef,
  ALL_EDIT_OPERATIONS,
} from '@personnel/domain/commands/defs'
import { CompoundCommand } from '@personnel/domain/commands/handlers/compoundCommand'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { ToolDefinition, ToolCall } from '../../ports'
import { FIELD_DISPLAY_LABELS } from '@personnel/domain/csvImport/allocationList/labels'

// ── 連動変更ウィジェット構築ヘルパー ─────────────────────────────────────────
// execute 操作後に監視対象フィールドが意図せず変わっていた場合に diff-preview を返す。
// primaryField: 直接編集したフィールド（連動検出の対象外）

const CASCADE_LABELS: Partial<Record<keyof AllocationRow, string>> = {
  positionBand:         FIELD_DISPLAY_LABELS['positionBand']         ?? 'ポジションバンド',
  band:                 FIELD_DISPLAY_LABELS['band']                 ?? 'バンド',
  payGrade:             FIELD_DISPLAY_LABELS['payGrade']             ?? '給与等級',
  officialPositionCode: FIELD_DISPLAY_LABELS['officialPositionCode'] ?? '役職コード',
  localJobTitle:        FIELD_DISPLAY_LABELS['localJobTitle']        ?? '役職名',
  businessUnit:         FIELD_DISPLAY_LABELS['businessUnit']         ?? '関係部門',
  division:             FIELD_DISPLAY_LABELS['division']             ?? '部門',
  subDivision:          FIELD_DISPLAY_LABELS['subDivision']          ?? '統括部',
  group:                FIELD_DISPLAY_LABELS['group']                ?? 'グループ',
  team:                 FIELD_DISPLAY_LABELS['team']                 ?? 'チーム',
  managerName:          FIELD_DISPLAY_LABELS['managerName']          ?? '上司氏名',
  managerPositionCode:  FIELD_DISPLAY_LABELS['managerPositionCode']  ?? '上司ポジションコード',
  employmentType:       FIELD_DISPLAY_LABELS['employmentType']       ?? '雇用タイプ',
}

function detectCascadeWidget(
  beforeRow: AllocationRow,
  primaryField: string,
): ChatWidget | undefined {
  const snapshot = appService.getSnapshot()
  const afterRow  = snapshot.allocationList.find(r => r.rowId === beforeRow.rowId)
  if (!afterRow) return undefined

  const changed = (Object.entries(CASCADE_LABELS) as [keyof AllocationRow, string][])
    .filter(([k]) => k !== primaryField)
    .flatMap(([k, label]) => {
      const b = String(beforeRow[k] ?? '')
      const a = String(afterRow[k] ?? '')
      return b !== a ? [{ label, before: b || undefined, after: a || undefined }] : []
    })

  if (changed.length === 0) return undefined

  const name = [afterRow.lastName, afterRow.firstName].filter(Boolean).join(' ')
  const org  = snapshot.afterOrganizations.find(
    o => o.externalCode === afterRow.departmentCode || o.id === afterRow.departmentCode
  )
  const diff: PersonDiff = {
    userId:  afterRow.userId ?? '',
    name,
    orgName: org?.name ?? afterRow.departmentCode ?? '',
    rowId:   afterRow.rowId,
    before:  {},
    after:   {},
    fields:  changed,
  }
  return { type: 'diff-preview', persons: [diff], label: '変更結果（連動変更あり）' }
}

export interface ToolResult {
  toolCallId: string
  content:    string
}

// ── Entry types ───────────────────────────────────────────────────────────────

export interface ReadEntry {
  kind: 'read'
  definition: ToolDefinition
  execute(args: Record<string, unknown>): unknown
}

export interface RenderEntry {
  kind: 'render'
  definition: ToolDefinition
  /** summary はLLMへのツール結果として返す。widget はUIに表示する。 */
  execute(args: Record<string, unknown>): { summary: unknown; widget: ChatWidget }
}

export interface ConfirmEntry {
  kind: 'confirm'
  definition: ToolDefinition
  /**
   * ユーザーに見せる確認ウィジェットを構築する（副作用なし）。
   * 前提条件を満たさない場合は `{ error: string }` を返す。
   * formInputs が含まれる場合、確認UIに入力フォームを追加表示する。
   * AgentRunner はエラーをツール結果として LLM に返し、widget は表示しない。
   */
  buildProposal(args: Record<string, unknown>): { widget: ChatWidget } | { error: string }
  /** ユーザーが承認した後に呼ばれる。userInputs は formInputs をユーザーが確認/上書きした値。 */
  executeOnApprove(args: Record<string, unknown>, userInputs?: Record<string, string>): unknown
}

/**
 * execute kind: ユーザー確認なしで即時実行する。
 * read と違い副作用あり。execute() の戻り値が LLM へのツール結果になる。
 * LLM が戻り値（変更前後など）を見て自然言語で報告する。
 */
export interface ExecuteEntry {
  kind: 'execute'
  definition: ToolDefinition
  execute(args: Record<string, unknown>): unknown
}

/**
 * navigate kind: UIナビゲーション専用。
 * ドメインデータを変更しないため Fast Path でも安全に実行できる。
 * キャンバスのスクロール・フォーカス・ハイライトなど表示操作に使う。
 */
export interface NavigateEntry {
  kind: 'navigate'
  definition: ToolDefinition
  execute(args: Record<string, unknown>): unknown
}

export type ToolEntry = ReadEntry | RenderEntry | ConfirmEntry | ExecuteEntry | NavigateEntry

// ── Tool entries ──────────────────────────────────────────────────────────────

const TOOL_ENTRIES: ToolEntry[] = [

  // ── Read: findPersons ────────────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'findPersons',
        description: '従業員を検索し、各人のポジション情報（現在 + 変更前）を返す。氏名・各種IDは明示的パラメータで部分一致検索。subtreeOrgCode を指定するとその組織以下の全メンバーを一括取得できる（findOrgs で取得した orgCode を渡す）。その他の AllocationRow フィールドは filter に指定（完全一致）。兼務者は positions[] に複数エントリ。userId なし（新規メンバー等）も対象。詳細（全フィールド）が必要なら rowId を getPersonsDetail に渡す。',
        parameters: {
          type: 'object',
          properties: {
            name:             { type: 'string', description: '氏名（部分一致）' },
            userId:           { type: 'string', description: 'SF Person ID（部分一致）' },
            groupEmployeeId:  { type: 'string', description: 'グループ社員ID（部分一致）' },
            employeeNumber:   { type: 'string', description: '社員番号（部分一致）' },
            subtreeOrgCode:   { type: 'string', description: 'この組織コード以下の全メンバーを取得（配下の組織も含む）。findOrgs で取得した orgCode を渡す。' },
            filter: {
              type: 'object',
              description: 'AllocationRow フィールド名での絞り込み（完全一致）。例: { "departmentCode": "D001" } / { "prevDepartmentCode": "D001" } / { "concurrentType": "兼務" } / { "leaveOfAbsenceSign": "1" } / { "positionCode": "P001" }',
              additionalProperties: { type: 'string' },
            },
          },
        },
      },
    },
    execute: args => aiTools.findPersons(args as {
      name?: string; userId?: string; groupEmployeeId?: string; employeeNumber?: string
      subtreeOrgCode?: string; filter?: Record<string, string>
    }),
  },

  // ── Read: findOrgs ───────────────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'findOrgs',
        description: '組織を名前・コード・階層レベルで検索する。戻り値の descendantOrgCodes[] に配下の全 orgCode が含まれるため、「この組織とその配下全員」を findPersons で取得するときは subtreeOrgCode に渡すだけでよい。level: 1=会社、2=関係部門、3=部門、4=統括部、5=グループ、6=チーム（目安）。',
        parameters: {
          type: 'object',
          properties: {
            name:    { type: 'string',  description: '組織名（部分一致）' },
            code:    { type: 'string',  description: '組織コード（部分一致）' },
            level:   { type: 'number',  description: '階層レベルで絞り込む（1=会社、2=関係部門、3=部門、4=統括部、5=グループ、6=チーム）' },
            company: { type: 'string',  description: '会社ID で絞り込む（任意）' },
          },
        },
      },
    },
    execute: args => aiTools.findOrgs(args as { name?: string; code?: string; level?: number; company?: string }),
  },

  // ── Read: getPersonsDetail ───────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getPersonsDetail',
        description: '指定した rowId[] の行の詳細情報を全フィールド取得する。findPersons で取得した positions[].rowId を渡す。before（発令前 prevXxx）と after（発令後）を含む。promotionSign="1"→昇降格、leaveOfAbsenceSign="1"→休職、secondmentToCompany→出向先会社、secondmentFromCompany→出向元会社。',
        parameters: {
          type: 'object',
          required: ['rowIds'],
          properties: {
            rowIds: {
              type:  'array',
              items: { type: 'number' },
              description: '取得対象の rowId 配列（findPersons の positions[].rowId）',
            },
          },
        },
      },
    },
    execute: args => aiTools.getPersonsDetail(args.rowIds as number[]),
  },

  // ── Read: getReviewSummary ───────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getReviewSummary',
        description: '変更件数のサマリーを返す。totalRows（全行数）・changedRows（変更行数）・byKind（Array<{ code, label, count }> 変更種別ごとの件数・多い順）・errorCount・warningCount が含まれる。「今月の変更を教えて」「変更の概要は？」のような質問にはまずこれを呼ぶ。件数が多くてもこのツールは安全（集計値のみ返す）。',
        parameters: { type: 'object', properties: {} },
      },
    },
    execute: () => aiTools.getReviewSummary(),
  },



  // ── Render: getOrgTree ──────────────────────────────────────────────────
  {
    kind: 'render',
    definition: {
      type: 'function',
      function: {
        name:        'getOrgTree',
        description: '組織の階層ツリーをウィジェットで視覚表示する。「全体像を見せて」「組織図を確認したい」のように組織構造を把握したいときに使う。rootOrgCode を省略するとルート組織から表示する。',
        parameters: {
          type: 'object',
          properties: {
            rootOrgCode: { type: 'string', description: '起点となる組織コード（省略時はルート組織）' },
          },
        },
      },
    },
    execute: args => {
      const result = aiTools.getOrgTreeData(args.rootOrgCode as string | undefined)
      if (!result.ok) return {
        summary: { error: result.error },
        widget:  { type: 'org-members', orgName: '（不明）', members: [] } as ChatWidget,
      }
      const widget: ChatWidget = { type: 'org-tree', orgName: result.orgName, tree: result.tree }
      return { summary: { orgName: result.orgName, totalMembers: result.totalMembers }, widget }
    },
  },

  // ── Read: getChangedRows ─────────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getChangedRows',
        description: '変更のある行を一覧する。氏名・各種ID・組織・変更種別で絞り込めるので「この人の変更は？」「この組織の異動は？」を1発で取得できる。limit/offset でページングでき、totalCount と truncated で残件数が分かる。戻り値は行単位（兼務者は本務・兼務が別エントリ）。grade/position に変更前後が含まれる。kinds の EditPattern コード例: orgTransfer, orgRestructure, promotion, demotion, titleChange, jobTypeChange, employmentTypeChange, concurrentAdd, concurrentRelease, secondmentOut, secondmentIn, secondmentOutRelease, secondmentInRelease, leaveOfAbsence, returnFromLeave, newHire, termination。',
        parameters: {
          type: 'object',
          properties: {
            kinds:           { type: 'array', items: { type: 'string' }, description: '変更種別フィルタ（EditPattern コード）。省略時は全変更。' },
            name:            { type: 'string', description: '氏名で絞り込む（部分一致）' },
            userId:          { type: 'string', description: 'SF Person ID で絞り込む（部分一致）' },
            groupEmployeeId: { type: 'string', description: 'グループ社員ID で絞り込む（部分一致）' },
            employeeNumber:  { type: 'string', description: '社員番号で絞り込む（部分一致）' },
            subtreeOrgCode:  { type: 'string', description: '組織コード以下（配下含む）の行だけ対象にする' },
            rowFilter:       { type: 'object', description: 'AllocationRow フィールドで絞り込む（完全一致）', additionalProperties: { type: 'string' } },
            limit:           { type: 'number', description: '取得件数上限（省略時は全件）' },
            offset:          { type: 'number', description: 'ページング開始位置（デフォルト0）' },
          },
        },
      },
    },
    execute: args => aiTools.getChangedRows(args as {
      kinds?: string[]; name?: string; userId?: string
      groupEmployeeId?: string; employeeNumber?: string
      subtreeOrgCode?: string; rowFilter?: Record<string, string>
      limit?: number; offset?: number
    }),
  },

  // ── Read: getValidationIssues ─────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getValidationIssues',
        description: 'バリデーション問題を1件ずつ一覧する（rowId・field・message・currentValue）。氏名・各種ID・組織で絞り込めるので「この人のエラーは？」を1回の呼び出しで取得できる。getValidationDiagnosis がフィールド別集計なのに対し、こちらは個別の問題を確認・報告したいときに使う。',
        parameters: {
          type: 'object',
          properties: {
            level:           { type: 'string', enum: ['error', 'warning'], description: "'error' または 'warning' で絞り込む。省略時は全件。" },
            name:            { type: 'string', description: '氏名で絞り込む（部分一致）' },
            userId:          { type: 'string', description: 'SF Person ID で絞り込む（部分一致）' },
            groupEmployeeId: { type: 'string', description: 'グループ社員ID で絞り込む（部分一致）' },
            employeeNumber:  { type: 'string', description: '社員番号で絞り込む（部分一致）' },
            subtreeOrgCode:  { type: 'string', description: '組織コード以下（配下含む）の行だけ対象にする' },
            rowFilter: {
              type: 'object',
              description: 'AllocationRow フィールドで絞り込む（完全一致）',
              additionalProperties: { type: 'string' },
            },
          },
        },
      },
    },
    execute: args => aiTools.getValidationIssues(args as {
      level?: 'error' | 'warning'
      name?: string; userId?: string; groupEmployeeId?: string; employeeNumber?: string
      subtreeOrgCode?: string; rowFilter?: Record<string, string>
    }),
  },

  // ── Read: findVacantPositions ─────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'findVacantPositions',
        description: '空席ポジション（positionCode あり・userId なし）を一覧する。propose_assign_person で人をアサインするときに事前確認で使う。orgCode（1組織）か subtreeOrgCode（配下含む）を指定できる。',
        parameters: {
          type: 'object',
          properties: {
            orgCode:        { type: 'string', description: '組織コード（完全一致・1組織のみ）' },
            subtreeOrgCode: { type: 'string', description: '組織コード（配下組織も含む）。findOrgs で取得した orgCode を渡す。' },
          },
        },
      },
    },
    execute: args => aiTools.findVacantPositions(args as { orgCode?: string; subtreeOrgCode?: string }),
  },

  // ── Read: getOperationStatus ─────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getOperationStatus',
        description: '指定行に対するすべての操作の可否状態を返す。available（実行可）と unavailable（実行不可）に分類し、unavailable には reason（理由）を含む。「なぜ〇〇ができないか」「この行でできることは何か」といった確認に使う。',
        parameters: {
          type: 'object',
          properties: {
            rowId: { type: 'number', description: '対象行の rowId（findPersons で取得）' },
          },
          required: ['rowId'],
        },
      },
    },
    execute: args => aiTools.getOperationStatus(args.rowId as number),
  },

  // ── Read: getValidationDiagnosis ─────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getValidationDiagnosis',
        description: 'バリデーション問題をフィールド別に集計し、修正方法（suggestedTool/suggestedAction）と対象 rowIds を返す。操作後や「バリデーションを確認して」と言われたときに優先して使う。getValidationIssues の上位版。',
        parameters: { type: 'object', properties: {} },
      },
    },
    execute: () => aiTools.getValidationDiagnosis(),
  },

  // ── Read: getFieldOptions ────────────────────────────────────────────────
  // フォームが開いている場合は formStateStore のドラフト値をマージして選択肢を計算する。
  // これにより「フォームで employmentType を変えた直後の band 選択肢」が正しく返る。
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getFieldOptions',
        description: '指定した行・フィールドに入力できる有効な選択肢を返す。フィールドの値を変更する前に必ずこれで確認し、リスト外の値を設定しないこと。F1/F2/F3 の雇用タイプ制約も自動反映される。フォームが開いている場合は入力中の値を考慮した選択肢を返す。',
        parameters: {
          type: 'object',
          required: ['rowId', 'field'],
          properties: {
            rowId: { type: 'number', description: '対象行の rowId' },
            field: { type: 'string', description: 'フィールド名（例: band, payGrade, officialPositionCode, location）' },
          },
        },
      },
    },
    execute: args => {
      const rowId       = args.rowId as number
      const field       = args.field as string
      const formSnap    = useFormStateStore.getState().snapshot
      const draftValues = formSnap?.rowId === rowId ? formSnap.values : undefined
      const rawOptions  = aiTools.getFieldOptions(rowId, field, draftValues)

      // Promotion/Demotion フォームで positionBand を問い合わせた場合、
      // UI が1段階フィルタ（BandStepFilter デフォルト）している推奨値を付加する
      if (formSnap?.rowId === rowId && field === 'positionBand') {
        const opId = formSnap.operationId
        if (opId === 'Promotion' || opId === 'Demotion') {
          const info = aiTools.getPromotionBandInfo(rowId)
          if ('oneLevelUp' in info) {
            const recommended = opId === 'Promotion' ? info.oneLevelUp : info.oneLevelDown
            return {
              options:            rawOptions,
              recommendedOptions: recommended,
              currentBand:        info.currentPositionBand,
              note:               `${opId === 'Promotion' ? '昇格' : '降格'}フォームのUIデフォルトは1段階${opId === 'Promotion' ? '上' : '下'}。通常は recommendedOptions から選択する。`,
            }
          }
        }
      }

      return { options: rawOptions }
    },
  },

  // ── Read: getPromotionBandInfo ───────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name: 'getPromotionBandInfo',
        description:
          '指定行の現在ポジションバンドを基準に、昇格/降格の候補バンドをステップ数別に返す。' +
          '「1段上を提案する」場合は oneLevelUp を使い、「2段以上」の場合は twoLevelsUp を参照する。' +
          'propose_promotion を呼ぶ前にこのツールで newPositionBand を決定すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId: { type: 'number', description: '対象行の rowId（findPersons の positions[].rowId）' },
          },
        },
      },
    },
    execute: args => aiTools.getPromotionBandInfo(args.rowId as number),
  },

  // ── Read: computePromotionStepDiff ───────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name: 'computePromotionStepDiff',
        description:
          '現在ポジションバンドと指定バンドの昇降格ステップ差を返す（正=昇格、負=降格）。' +
          '2以上の場合は大きな昇格のため、propose_promotion を呼ぶ前にユーザーへ確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId', 'newPositionBand'],
          properties: {
            rowId:          { type: 'number', description: '対象行の rowId' },
            newPositionBand: { type: 'string', description: '新しいポジションバンド' },
          },
        },
      },
    },
    execute: args => ({
      stepDiff: aiTools.computePromotionStepDiff(args.rowId as number, args.newPositionBand as string),
    }),
  },

  // ── Execute: undo ────────────────────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'undo',
        description: '直前の操作を取り消す（即時実行）。ユーザーが「元に戻して」「undo して」と言った場合に使う。取り消せる操作がない場合はエラーを返す。',
        parameters: { type: 'object', properties: {} },
      },
    },
    execute: () => {
      if (!appService.getSnapshot().canUndo)
        return { ok: false, message: '取り消せる操作がありません' }
      aiTools.undo()
      return { ok: true, message: '操作を取り消しました' }
    },
  },

  // ── Render: show_org_members ─────────────────────────────────────────────
  {
    kind: 'render',
    definition: {
      type: 'function',
      function: {
        name:        'show_org_members',
        description: 'メンバー一覧をチャット内ウィジェットで視覚表示する。orgCode（直属メンバーのみ）か subtreeOrgCode（配下組織も含む）のどちらかを指定する。「この組織のメンバーを見せて」「配下全員を確認したい」のような表示リクエストに使う。',
        parameters: {
          type: 'object',
          properties: {
            orgCode:        { type: 'string', description: '組織コード（直属メンバーのみ）' },
            subtreeOrgCode: { type: 'string', description: '組織コード（配下組織も含む）。findOrgs で取得した orgCode を渡す。' },
          },
        },
      },
    },
    execute: args => {
      const orgCode        = args.orgCode        as string | undefined
      const subtreeOrgCode = args.subtreeOrgCode as string | undefined
      const targetCode     = subtreeOrgCode ?? orgCode ?? ''

      const org     = aiTools.findOrgs({ code: targetCode })[0]
      const persons = subtreeOrgCode
        ? aiTools.findPersons({ subtreeOrgCode })
        : aiTools.findPersons({ filter: { departmentCode: orgCode ?? '' } })

      const members: PersonInfo[] = persons.map(p => ({
        userId:  p.userId,
        name:    p.name,
        orgName: p.positions[0]?.orgName,
        rowIds:  p.positions.map(pos => pos.rowId),
      }))
      const widget: ChatWidget = {
        type:    'org-members',
        orgName: org?.orgName ?? targetCode,
        members,
      }
      return { summary: { memberCount: members.length }, widget }
    },
  },

  // ── Confirm: propose_bulk_transfer ───────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_bulk_transfer',
        description: '指定した組織の全メンバーを別の組織に一括異動させることをユーザーに提案し、確認を得てから実行する。組織統廃合・改編などで部署全体を移動させるときに使う。sourceOrgCode（直属のみ）か sourceSubtreeOrgCode（配下含む）のどちらかを指定する。実行前に findOrgs で組織コードを確認すること。',
        parameters: {
          type: 'object',
          required: ['targetOrgCode'],
          properties: {
            sourceOrgCode:        { type: 'string', description: '移動元の組織コード（直属メンバーのみ）' },
            sourceSubtreeOrgCode: { type: 'string', description: '移動元の組織コード（配下組織も含む）' },
            targetOrgCode:        { type: 'string', description: '移動先の組織コード（externalCode）' },
          },
        },
      },
    },
    buildProposal: args => {
      const code    = (args.sourceSubtreeOrgCode ?? args.sourceOrgCode) as string
      return P.buildBulkTransferProposal(code, args.targetOrgCode as string, { includeSubtree: !!args.sourceSubtreeOrgCode })
    },
    executeOnApprove: args => {
      const code = (args.sourceSubtreeOrgCode ?? args.sourceOrgCode) as string
      return aiTools.executeBulkTransfer(code, args.targetOrgCode as string, { includeSubtree: !!args.sourceSubtreeOrgCode })
    },
  },

  // ── Execute: propose_field_edit ───────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_field_edit',
        description: '指定した行の特定フィールドを変更する（即時実行）。値を変更する前に getFieldOptions で有効な選択肢を確認すること。実行前に findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId', 'field', 'value'],
          properties: {
            rowId: { type: 'number', description: '対象行の rowId（findPersons の positions[].rowId）' },
            field: {
              type: 'string',
              enum: [
                'employmentType', 'band', 'payGrade', 'officialPositionCode', 'localJobTitle',
                'jobFamily', 'jobType', 'location', 'costCenter',
                'secondmentToCompany', 'secondmentFromCompany', 'secondmentFromEmployeeNumber',
                'transferReason', 'concurrentReason', 'demotionReason', 'memo',
              ],
              description: '変更するフィールド名',
            },
            value: { type: 'string', description: '新しい値（空文字で削除）' },
          },
        },
      },
    },
    execute: args => {
      const beforeRow = appService.getSnapshot().allocationList.find(r => r.rowId === (args.rowId as number))
      const result    = aiTools.executeFieldEdit(args.rowId as number, args.field as string, args.value as string)
      if (!('applied' in result) || !beforeRow) return result
      const _widget = detectCascadeWidget(beforeRow, args.field as string)
      return _widget ? { ...result, _widget } : result
    },
  },

  // ── Confirm: propose_bulk_set_field ─────────────────────────────────────
  // getValidationDiagnosis の suggestedTool で案内される主要ツール。
  // propose_field_edit の複数行版。diff-preview を再利用。
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_bulk_set_field',
        description: '複数行の同一フィールドを一括で同じ値に設定することをユーザーに提案し、確認を得てから実行する。getValidationDiagnosis で取得した rowIds をそのまま使える。transferReason の一括設定、concurrentReason の一括クリアなどに使う。',
        parameters: {
          type: 'object',
          required: ['rowIds', 'field', 'value'],
          properties: {
            rowIds: {
              type: 'array',
              items: { type: 'number' },
              description: '対象行の rowId 配列（getValidationDiagnosis.byField[].rowIds をそのまま使用可）',
            },
            field: {
              type: 'string',
              description: '変更するフィールド名（例: transferReason, concurrentReason, demotionReason, memo）',
            },
            value: {
              type: 'string',
              description: '設定する値。空文字はフィールドをクリアする',
            },
          },
        },
      },
    },
    buildProposal: args => P.buildBulkSetFieldProposal(args.rowIds as number[], args.field as string, args.value as string),
    executeOnApprove: args => aiTools.executeBulkSetField(args.rowIds as number[], args.field as string, args.value as string),
  },

  // ── Confirm: propose_transfer ────────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_transfer',
        description: '指定した人物を別の組織に異動させることをユーザーに提案し、確認を得てから実行する。' +
          'rowIds か name/subtreeOrgCode のいずれかで対象を指定する（findPersons の事前呼び出し不要）。' +
          '確認UIに transferReason（異動事由）の入力フォームが表示される。' +
          '改組による異動は "分掌異動（改組）"、職務内容変更を伴う人事異動は "分掌異動" を transferReason に渡す。',
        parameters: {
          type: 'object',
          required: ['targetOrgCode'],
          properties: {
            rowIds: {
              type:        'array',
              items:       { type: 'number' },
              description: '異動対象の rowId 一覧（findPersons で取得済みの場合に指定）',
            },
            name: {
              type:        'string',
              description: '氏名で対象を絞り込む（rowIds 未指定時に使用）',
            },
            subtreeOrgCode: {
              type:        'string',
              description: '指定組織の配下全員を対象にする（rowIds 未指定時に使用）',
            },
            targetOrgCode: {
              type:        'string',
              description: '移動先組織の externalCode（findOrgs で取得した値）',
            },
            transferReason: {
              type:        'string',
              description: '異動事由の提案値。文脈から推測して渡す。確認UIでユーザーが変更可能',
            },
          },
        },
      },
    },
    buildProposal: args => P.buildTransferProposal({
      rowIds:         args.rowIds         as number[]  | undefined,
      name:           args.name           as string    | undefined,
      subtreeOrgCode: args.subtreeOrgCode as string    | undefined,
      targetOrgCode:  args.targetOrgCode  as string,
      transferReason: args.transferReason as string    | undefined,
    }),
    executeOnApprove: (args, userInputs) => {
      const rowIds = args.rowIds as number[] | undefined
      // rowIds が未指定なら proposal 時と同じ filter で再解決（proposal 側でキャッシュしない設計）
      const resolvedRowIds = rowIds ?? aiTools.resolveTransferRowIds({
        name:           args.name           as string | undefined,
        subtreeOrgCode: args.subtreeOrgCode as string | undefined,
      })
      return aiTools.executeTransferPersons(
        resolvedRowIds,
        args.targetOrgCode as string,
        userInputs?.['transferReason'] ?? args.transferReason as string | undefined,
      )
    },
  },

  // ── Confirm: propose_promotion ───────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_promotion',
        description: '昇格をユーザーに提案し、確認を得てから実行する。' +
          'positionBand を指定するだけで band / payGrade が自動導出される（DryRunで確認UI に表示）。' +
          'findPersons の事前呼び出し不要。rowId か name で対象を指定する。',
        parameters: {
          type: 'object',
          required: ['rowId', 'newPositionBand'],
          properties: {
            rowId: {
              type:        'number',
              description: '昇格対象の rowId（findPersons の positions[].rowId）',
            },
            newPositionBand: {
              type:        'string',
              description: '昇格後のポジションバンド（例: "M4"）。band / payGrade はここから自動導出される',
            },
            newOfficialPositionCode: {
              type:        'string',
              description: '昇格後の役職コード（変わる場合のみ指定）',
            },
            newLocalJobTitle: {
              type:        'string',
              description: '昇格後の役職名フリーテキスト（変わる場合のみ指定）',
            },
          },
        },
      },
    },
    buildProposal: args => P.buildPromotionProposal({
      rowId:                    args.rowId                    as number,
      newPositionBand:          args.newPositionBand          as string,
      newOfficialPositionCode:  args.newOfficialPositionCode  as string | undefined,
      newLocalJobTitle:         args.newLocalJobTitle         as string | undefined,
    }),
    executeOnApprove: (args, userInputs) => aiTools.executePromotion({
      rowId:                   args.rowId as number,
      newPositionBand:         userInputs?.positionBand          ?? args.newPositionBand          as string,
      newOfficialPositionCode: userInputs?.officialPositionCode  ?? args.newOfficialPositionCode  as string | undefined,
      newLocalJobTitle:        userInputs?.localJobTitle         ?? args.newLocalJobTitle         as string | undefined,
    }),
  },

  // ── Execute: propose_create_position ─────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_create_position',
        description: '空席ポジションを新規作成する（即時実行）。実行前に findOrgs で orgCode を確認すること。',
        parameters: {
          type: 'object',
          required: ['orgCode', 'localJobTitle'],
          properties: {
            orgCode:       { type: 'string', description: '組織コード（externalCode）' },
            localJobTitle: { type: 'string', description: 'ポジションの役職名' },
          },
        },
      },
    },
    execute: args => {
      const newRowId = aiTools.createVacantPosition(args.orgCode as string, args.localJobTitle as string)
      return { applied: true, localJobTitle: args.localJobTitle, orgCode: args.orgCode, newPositionRowId: newRowId }
    },
  },

  // ── Execute: propose_assign_person ────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_assign_person',
        description: '空席ポジションに従業員を配属する（即時実行）。実行前に findVacantPositions で vacantRowId を、findPersons で userId を確認すること。',
        parameters: {
          type: 'object',
          required: ['vacantRowId', 'userId'],
          properties: {
            vacantRowId: { type: 'number', description: '空席ポジション行の rowId（findVacantPositions で取得）' },
            userId:      { type: 'string', description: '配属する従業員のユーザー ID' },
          },
        },
      },
    },
    execute: args => {
      aiTools.assignPersonToVacantPosition(args.vacantRowId as number, args.userId as string)
      return { applied: true, vacantRowId: args.vacantRowId, userId: args.userId }
    },
  },

  // ── Execute: propose_change_position ─────────────────────────────────────
  // 同一組織内でポジションを作り直す（役職変更）。旧ポジションは削除。
  // TransferPersonOperation を同一組織・retireOriginal=true で呼ぶことで1回のUndoに収める。
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_change_position',
        description: '行のポジション（役職名）を変更する（即時実行）。新しいポジションを作成し、元のポジションを削除して1回のUndoで戻せる。「課長にして」「部長から課長へ」のような役職変更に使う。実行前に findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId', 'newJobTitle'],
          properties: {
            rowId:       { type: 'number', description: '対象行の rowId（findPersons の positions[].rowId）' },
            newJobTitle: { type: 'string', description: '新しい役職名（localJobTitle）' },
          },
        },
      },
    },
    execute: args => {
      const beforeRow = appService.getSnapshot().allocationList.find(r => r.rowId === (args.rowId as number))
      const result    = aiTools.executeChangePosition(args.rowId as number, args.newJobTitle as string)
      if (!('applied' in result) || !beforeRow) return result
      const _widget = detectCascadeWidget(beforeRow, 'localJobTitle')
      return _widget ? { ...result, _widget } : result
    },
  },

  // ── Execute: propose_set_manager_position ────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_set_manager_position',
        description: '上司ポジションコードを設定する（即時実行）。managerName も在席者の姓名から自動入力する。実行前に findPersons で対象者の rowId を、findPersons で上司の positionCode を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId', 'managerPositionCode'],
          properties: {
            rowId:               { type: 'number', description: '変更対象行の rowId' },
            managerPositionCode: { type: 'string', description: '上司のポジションコード' },
          },
        },
      },
    },
    execute: args => {
      const rowId               = args.rowId as number
      const managerPositionCode = args.managerPositionCode as string
      const result = aiTools.setManagerPosition(rowId, managerPositionCode)
      return result.ok
        ? { applied: true, rowId, managerPositionCode }
        : { ok: false, error: !result.ok && result.errors?.[0]?.message }
    },
  },

  // ── Confirm: propose_re_derive_manager_names ─────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name: 'propose_re_derive_manager_names',
        description: '全行の managerName を、現在各ポジションに在籍している人の姓名に合わせて一括更新することをユーザーに提案する。上司ポジションの担当者が変わった後などに使う。',
        parameters: { type: 'object', properties: {} },
      },
    },
    buildProposal: () => P.buildReDeriveManagerNamesProposal(),
    executeOnApprove: () => {
      const changed = aiTools.reDeriveManagerNames()
      return { applied: true, changedCount: changed }
    },
  },

  // ── Read: getUnassignedPositions ─────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getUnassignedPositions',
        description: '内部採番コード（_pos_…）のままになっているポジションの一覧を返す。propose_assign_position_codes と組み合わせて外部コードを割り当てるために使う。',
        parameters: { type: 'object', properties: {} },
      },
    },
    execute: () => aiTools.getUnassignedPositions(),
  },

  // ── Execute: propose_assign_position_codes ────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_assign_position_codes',
        description: '内部採番コード（_pos_…）のポジションに外部コード（P + 8桁数字）を割り当てる（即時実行）。managerPositionCode として参照している行も連動して更新される。実行前に getUnassignedPositions で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['assignments'],
          properties: {
            assignments: {
              type: 'array',
              description: '割り当てリスト。rowId と newPositionCode のペアを複数指定できる。',
              items: {
                type: 'object',
                required: ['rowId', 'newPositionCode'],
                properties: {
                  rowId:           { type: 'number', description: '対象行の rowId（getUnassignedPositions で取得）' },
                  newPositionCode: { type: 'string', description: '割り当てる外部コード（P + 8桁数字、例: P12345678）' },
                },
              },
            },
          },
        },
      },
    },
    execute: args => {
      const assignments = args.assignments as Array<{ rowId: number; newPositionCode: string }>
      const result = aiTools.assignPositionCodes(assignments)
      return result.ok
        ? { applied: true, count: assignments.length }
        : { ok: false, error: result.errors?.[0]?.message }
    },
  },

  // ── Confirm: propose_re_derive_org_sub_fields ─────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name: 'propose_re_derive_org_sub_fields',
        description: '全行の businessUnit/division/subDivision/group/team を、組織マスタから一括再導出することをユーザーに提案する。組織を移動した後などにサブフィールドがずれているときに使う。',
        parameters: { type: 'object', properties: {} },
      },
    },
    buildProposal: () => P.buildReDeriveOrgSubFieldsProposal(),
    executeOnApprove: () => {
      const changed = aiTools.reDeriveOrgSubFields()
      return { applied: true, changedCount: changed }
    },
  },

  // ── Execute: propose_leave_of_absence ─────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_leave_of_absence',
        description: '指定した行を休職させる（即時実行）。leaveOfAbsenceSign を "1" に設定する。実行前に findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId: { type: 'number', description: '休職対象の rowId（findPersons の positions[].rowId）' },
            memo:  { type: 'string', description: '休職事由（任意）' },
          },
        },
      },
    },
    execute: args => aiTools.executeLeaveOfAbsence(args.rowId as number, args.memo as string | undefined),
  },

  // ── Execute: propose_return_from_leave ────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_return_from_leave',
        description: '指定した行を復職させる（即時実行）。leaveOfAbsenceSign をクリアする。実行前に findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId: { type: 'number', description: '復職対象の rowId（findPersons の positions[].rowId）' },
          },
        },
      },
    },
    execute: args => aiTools.executeReturnFromLeave(args.rowId as number),
  },

  // ── Execute: propose_concurrent_add ──────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_concurrent_add',
        description: '指定した行（本務行）に社内兼務を追加する（即時実行）。兼務行を新規作成する。実行前に findPersons で rowId（本務行）を、findOrgs で targetOrgCode を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId', 'targetOrgCode'],
          properties: {
            rowId:            { type: 'number', description: '本務行の rowId（findPersons の positions[].rowId）' },
            targetOrgCode:    { type: 'string', description: '兼務先組織の externalCode' },
            concurrentReason: { type: 'string', description: '兼務理由（任意）' },
          },
        },
      },
    },
    execute: args => aiTools.executeConcurrentAdd(args.rowId as number, args.targetOrgCode as string, args.concurrentReason as string | undefined),
  },

  // ── Execute: propose_concurrent_release ──────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_concurrent_release',
        description: '指定した兼務行を解除する（即時実行）。兼務行を削除する。出向兼務は対象外（出向解除を使うこと）。実行前に findPersons の positions[] から兼務行（concurrentType="兼務"）の rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId: { type: 'number', description: '解除対象の兼務行の rowId（findPersons の positions[] から兼務行を選択）' },
          },
        },
      },
    },
    execute: args => aiTools.executeConcurrentRelease(args.rowId as number),
  },

  // ── Confirm: propose_secondment_to_concurrent ─────────────────────────────
  // Tier 3 wizard: 本務出向 → 兼務出向変換（2ステップ）
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name: 'propose_secondment_to_concurrent',
        description: '本務出向中の従業員を兼務出向に変換することをウィザード形式でユーザーに提案する。「出向解除 → 兼務出向追加」の2ステップを透過的に見せる。ピン留め行または findPersons で rowId を確認すること。prevDepartmentCode（元の所属）が設定されていない場合は失敗する。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId:            { type: 'number', description: '本務出向中の行の rowId' },
            concurrentReason: { type: 'string', description: '兼務理由（任意）' },
          },
        },
      },
    },
    buildProposal:    args => P.buildSecondmentToConcurrentProposal(args.rowId as number, args.concurrentReason as string | undefined),
    executeOnApprove: args => {
      const rowId = args.rowId as number
      const { allocationList } = appService.getSnapshot()
      const row = allocationList.find(r => r.rowId === rowId)
      if (!row?.secondmentToCompany) return { ok: false, error: '本務出向が設定されていません' }
      if (!row.prevDepartmentCode)   return { ok: false, error: '元の所属組織 (prevDepartmentCode) が特定できません' }

      const secondmentToCompany = row.secondmentToCompany
      const secondmentDeptCode  = row.departmentCode!
      const homeDeptCode        = row.prevDepartmentCode

      return aiTools.executeOperation(new CompoundCommand(
        [
          bindOperation(secondmentOutReleaseSFDef, rowId, { departmentCode: homeDeptCode }),
          bindOperation(concurrentSecondmentOutSFDef, rowId, {
            secondmentToCompany,
            departmentCode:   secondmentDeptCode,
            concurrentReason: args.concurrentReason as string | undefined,
          }),
        ],
        `本務出向→兼務出向: ${[row.lastName, row.firstName].filter(Boolean).join(' ')}`,
      ))
    },
  },

  // ── Confirm: propose_secondment_transfer ──────────────────────────────────
  // Tier 3 wizard: 出向先への転籍（2ステップ）
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name: 'propose_secondment_transfer',
        description: '本務出向中の従業員を出向先に転籍させることをウィザード形式でユーザーに提案する。「出向解除 → 転籍（出）」の2ステップを透過的に見せる。ピン留め行または findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId', 'transferReason'],
          properties: {
            rowId:          { type: 'number', description: '本務出向中の行の rowId' },
            transferReason: { type: 'string', description: '異動事由（例: グループ会社転籍）' },
          },
        },
      },
    },
    buildProposal:    args => P.buildSecondmentTransferProposal(args.rowId as number, args.transferReason as string),
    executeOnApprove: args => {
      const rowId         = args.rowId as number
      const transferReason = args.transferReason as string
      const { allocationList } = appService.getSnapshot()
      const row = allocationList.find(r => r.rowId === rowId)
      if (!row?.secondmentToCompany) return { ok: false, error: '本務出向が設定されていません' }
      if (!row.prevDepartmentCode)   return { ok: false, error: '元の所属組織 (prevDepartmentCode) が特定できません' }

      const homeDeptCode = row.prevDepartmentCode

      return aiTools.executeOperation(new CompoundCommand(
        [
          bindOperation(secondmentOutReleaseSFDef, rowId, { departmentCode: homeDeptCode }),
          bindOperation(employmentTransferDef, rowId, { transferReason }),
        ],
        `出向先転籍: ${[row.lastName, row.firstName].filter(Boolean).join(' ')}`,
      ))
    },
  },

  // ── Confirm: propose_demotion ─────────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_demotion',
        description: '指定した行の降格をユーザーに提案し、確認を得てから役職・バンド等を変更する。実行前に findPersons で rowId を、getFieldOptions で有効な値を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId:                { type: 'number', description: '降格対象の rowId（findPersons の positions[].rowId）' },
            officialPositionCode: { type: 'string', description: '新しい役職コード' },
            localJobTitle:        { type: 'string', description: '新しい役職名' },
            band:                 { type: 'string', description: '新しいバンド' },
            payGrade:             { type: 'string', description: '新しい給与等級' },
            demotionReason:       { type: 'string', description: '降格理由（必須）' },
          },
        },
      },
    },
    buildProposal: args => P.buildDemotionProposal(args.rowId as number, {
      officialPositionCode: args.officialPositionCode as string | undefined,
      localJobTitle:        args.localJobTitle        as string | undefined,
      band:                 args.band                 as string | undefined,
      payGrade:             args.payGrade              as string | undefined,
      demotionReason:       args.demotionReason        as string | undefined,
    }),
    executeOnApprove: (args, userInputs) => aiTools.executeDemotionForUser(args.rowId as number, {
      positionBand:         userInputs?.positionBand         ?? undefined,
      officialPositionCode: userInputs?.officialPositionCode ?? args.officialPositionCode as string | undefined,
      localJobTitle:        userInputs?.localJobTitle        ?? args.localJobTitle        as string | undefined,
      band:                 userInputs?.band                 ?? args.band                 as string | undefined,
      payGrade:             userInputs?.payGrade             ?? args.payGrade              as string | undefined,
      demotionReason:       userInputs?.demotionReason       ?? args.demotionReason        as string | undefined,
    }),
  },

  // ── Confirm: propose_secondment_in ────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_secondment_in',
        description: '指定した行に本務出向受入を設定することをユーザーに提案し、確認を得てから実行する。出向元会社・社員番号・受入先組織・雇用タイプを確認UIで入力させる。sfIntegrated=true の場合は社員番号が必須（SF統合先）。実行前に findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId:        { type: 'number',  description: '本務出向受入対象の rowId（findPersons の positions[].rowId）' },
            sfIntegrated: { type: 'boolean', description: 'SF統合先かどうか（デフォルト false）' },
          },
        },
      },
    },
    buildProposal: args => P.buildSecondmentInProposal(
      args.rowId as number,
      (args.sfIntegrated as boolean | undefined) ?? false,
    ),
    executeOnApprove: (args, userInputs) => {
      if (!userInputs?.secondmentFromCompany || !userInputs?.departmentCode || !userInputs?.employmentType)
        return { ok: false, errors: [{ message: '出向元会社・受入先組織・雇用タイプは必須です' }] }
      return aiTools.executeSecondmentIn(
        args.rowId as number,
        (args.sfIntegrated as boolean | undefined) ?? false,
        {
          secondmentFromCompany:        userInputs.secondmentFromCompany,
          secondmentFromEmployeeNumber: userInputs.secondmentFromEmployeeNumber,
          departmentCode:               userInputs.departmentCode,
          employmentType:               userInputs.employmentType,
        },
      )
    },
  },

  // ── Confirm: propose_concurrent_secondment_in ───────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_concurrent_secondment_in',
        description: '指定した行に兼務出向受入を設定することをユーザーに提案し、確認を得てから実行する。新規兼務行を作成する。出向元会社・社員番号・出向先組織・雇用タイプを確認UIで入力させる。実行前に findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId:        { type: 'number',  description: '兼務出向受入対象の rowId（本務行）（findPersons の positions[].rowId）' },
            sfIntegrated: { type: 'boolean', description: 'SF統合先かどうか（デフォルト false）' },
          },
        },
      },
    },
    buildProposal: args => P.buildConcurrentSecondmentInProposal(
      args.rowId as number,
      (args.sfIntegrated as boolean | undefined) ?? false,
    ),
    executeOnApprove: (args, userInputs) => {
      if (!userInputs?.secondmentFromCompany || !userInputs?.departmentCode || !userInputs?.employmentType)
        return { ok: false, errors: [{ message: '出向元会社・出向先組織・雇用タイプは必須です' }] }
      return aiTools.executeConcurrentSecondmentIn(
        args.rowId as number,
        (args.sfIntegrated as boolean | undefined) ?? false,
        {
          secondmentFromCompany:        userInputs.secondmentFromCompany,
          secondmentFromEmployeeNumber: userInputs.secondmentFromEmployeeNumber,
          departmentCode:               userInputs.departmentCode,
          employmentType:               userInputs.employmentType,
          concurrentReason:             userInputs.concurrentReason,
        },
      )
    },
  },

  // ── UI Navigate: ui_open_operation ───────────────────────────────────────
  // 指定行の操作フォームを開き、既知の値を prefill する。
  // ユーザーが残りを入力して通常通り送信する（AI は送信しない）。
  // getFieldOptions(rowId, field) で有効な選択肢を確認してから prefill するとよい。
  {
    kind: 'navigate',
    definition: {
      type: 'function',
      function: {
        name: 'ui_open_operation',
        description:
          '指定した人物の操作フォームを開き、AIが把握している値を事前入力する。' +
          'UIの表示のみ変更・データは変更しない。ユーザーが残りを入力して送信する。' +
          '「昇格フォームを開いて」「異動画面を出して」のようなリクエストに使う。' +
          'findPersons で rowId を確認した後に使うこと。' +
          'operationId の一覧: Promotion / Demotion / TitleChange / OrgTransfer / OrgRestructure / ' +
          'LeaveOfAbsence / LeaveOfAbsenceCancel / ReturnFromLeave / ' +
          'EmploymentTypeChange / JobTypeChange / ManagerChange / ' +
          'SecondmentOutSF / SecondmentOutNonSF / SecondmentInSF / SecondmentInNonSF / ' +
          'EmploymentTransfer / NoChange 等。',
        parameters: {
          type: 'object',
          required: ['rowId', 'operationId'],
          properties: {
            rowId: {
              type: 'number',
              description: '対象行の rowId（findPersons の positions[].rowId）',
            },
            operationId: {
              type: 'string',
              description: '開く操作の ID（上記一覧から選択）',
            },
            prefill: {
              type: 'object',
              description: '事前入力する AllocationRow フィールドと値のマップ。getFieldOptions で有効な値を確認してから渡すこと。',
              additionalProperties: { type: 'string' },
            },
          },
        },
      },
    },
    execute: (args) => {
      const rowId       = args.rowId       as number
      const operationId = args.operationId as string
      const prefill     = args.prefill     as Record<string, string> | undefined

      const def = ALL_EDIT_OPERATIONS.find(d => d.id === operationId)
      if (!def) {
        const ids = ALL_EDIT_OPERATIONS.map(d => d.id).join(', ')
        return { ok: false, message: `操作 '${operationId}' が見つかりません。有効な ID: ${ids}` }
      }

      const store = useStore.getState()
      if (store.operationPanelRowId !== rowId) store.enterOperationPanel(rowId)

      useUICommandStore.getState().dispatch({ type: 'openOperation', rowId, operationId, prefill })

      return {
        ok: true,
        message: `${def.label ?? operationId} フォームを開きました。ユーザーの入力と送信を待っています。`,
        operationId,
        rowId,
        prefillKeys: prefill ? Object.keys(prefill) : [],
      }
    },
  },

  // ── Read: ui_get_form_state ───────────────────────────────────────────────
  // 現在開いているフォームの状態を読む（AI → フォーム の逆方向）。
  // getFieldOptions(rowId, field) と組み合わせると「今フォームで選べる値」が分かる。
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name: 'ui_get_form_state',
        description:
          '現在開いている操作フォームの状態（操作種別・入力中の値）を返す。' +
          'フォームが開いていない場合は open: false を返す。' +
          '「今何が入力されていますか？」「どの操作フォームが開いていますか？」に使う。' +
          'フォームを開くには ui_open_operation を先に呼ぶこと。' +
          '入力中フィールドの有効な選択肢は getFieldOptions(rowId, field) で取得できる。',
        parameters: { type: 'object', properties: {} },
      },
    },
    execute: () => {
      const snapshot = useFormStateStore.getState().snapshot
      if (!snapshot) return { open: false }

      // Promotion/Demotion フォームの場合、フォームUIが提示する推奨バンドを付加する
      // （UIは BandStepFilter でデフォルト1段階フィルタをかけている）
      if (snapshot.operationId === 'Promotion' || snapshot.operationId === 'Demotion') {
        const info = aiTools.getPromotionBandInfo(snapshot.rowId)
        if ('oneLevelUp' in info) {
          const dir = snapshot.operationId === 'Promotion' ? 'up' : 'down'
          return {
            open: true,
            ...snapshot,
            bandRecommendations: {
              current:           info.currentPositionBand,
              oneStep:           dir === 'up' ? info.oneLevelUp   : info.oneLevelDown,
              twoStep:           dir === 'up' ? info.twoLevelsUp  : [],
              uiDefaultFilter:   'oneStep',
              note:              `UIのデフォルト表示は1段階${dir === 'up' ? '上' : '下'}（oneStep）。特段の理由がなければ oneStep から選ぶ。`,
            },
          }
        }
      }

      return { open: true, ...snapshot }
    },
  },

  // ── UI Navigate: ui_suggest_form_field ───────────────────────────────────
  // 開いているフォームに値をサジェストする。
  // フォーム内部の handleChange を通すため onFieldChange 連動導出が正しく動く。
  {
    kind: 'navigate',
    definition: {
      type: 'function',
      function: {
        name: 'ui_suggest_form_field',
        description:
          '開いている操作フォームの特定フィールドに値を設定する。' +
          'UIの表示のみ変更・データは変更しない。フォームの送信はユーザーが行う。' +
          '事前に ui_get_form_state でフォームが開いていることを確認し、' +
          'getFieldOptions(rowId, field) で有効な値を確認してから使うこと。' +
          '値を設定すると onFieldChange の連動導出（バンド→給与等級 など）も自動で走る。',
        parameters: {
          type: 'object',
          required: ['field', 'value'],
          properties: {
            field: {
              type: 'string',
              description: '設定するフィールド名（AllocationRow のキー）',
            },
            value: {
              type: 'string',
              description: '設定する値（空文字でフィールドをクリア）',
            },
          },
        },
      },
    },
    execute: (args) => {
      const snapshot = useFormStateStore.getState().snapshot
      if (!snapshot) return { ok: false, message: 'フォームが開いていません。先に ui_open_operation を呼んでください。' }

      const field = args.field as keyof AllocationRow
      const value = args.value as string
      useFormStateStore.getState().suggestField(field, value)
      return { ok: true, field, value, message: `${field} に "${value}" を設定しました` }
    },
  },

  // ── UI Navigate: ui_show_person ──────────────────────────────────────────
  // 「ユーザーが画面で確認したい」という意図専用のナビゲーションツール。
  // 内部で findPersons 相当の検索 + フォーカスを1ステップで行う。
  // findPersons はAIがデータを取得する用途（操作前の確認等）に残す。
  {
    kind: 'navigate',
    definition: {
      type: 'function',
      function: {
        name: 'ui_show_person',
        description:
          '人物を検索してキャンバス上にフォーカスする（検索+表示を1ステップで実行）。' +
          'UIの表示位置を移動するのみで、データは一切変更しない。' +
          '「〇〇さんを見せて」「〇〇さんの場所を画面で確認したい」のようなリクエストに使う。' +
          '人物データを取得したいだけなら findPersons を使うこと。' +
          '複数人ヒットした場合は最初の1件にフォーカスし、件数を返す。',
        parameters: {
          type: 'object',
          properties: {
            name:            { type: 'string', description: '氏名（部分一致）' },
            userId:          { type: 'string', description: 'SF Person ID（部分一致）' },
            groupEmployeeId: { type: 'string', description: 'グループ社員ID（部分一致）' },
            employeeNumber:  { type: 'string', description: '社員番号（部分一致）' },
          },
        },
      },
    },
    execute: (args) => {
      const results = aiTools.findPersons(args as {
        name?: string; userId?: string; groupEmployeeId?: string; employeeNumber?: string
      })
      if (results.length === 0) return { ok: false, message: '該当する人物が見つかりません' }

      const target  = results[0]
      const rowId   = target.positions[0]?.rowId
      if (rowId === undefined) return { ok: false, message: `${target.name} の行が特定できません` }

      const store   = useStore.getState()
      const person  = store.persons.find(p => p.sfPersonId === target.userId)
      if (person) {
        store.selectPersonAndFocusOrg(person.id)
      } else {
        store.selectCard(rowId)
      }

      const extra = results.length > 1 ? `（他 ${results.length - 1} 件ヒット）` : ''
      return { ok: true, message: `${target.name} にフォーカスしました${extra}`, rowId }
    },
  },

  // ── UI Navigate: ui_focus_row ─────────────────────────────────────────────
  // rowId が既に分かっているときの低レベルフォーカス。
  // 通常は ui_show_person を使う。他のツール結果から rowId を受け取った場合に使う。
  {
    kind: 'navigate',
    definition: {
      type: 'function',
      function: {
        name: 'ui_focus_row',
        description:
          'rowId を指定してキャンバス上の人物カードにフォーカスする。' +
          'UIの表示位置を移動するのみで、データは一切変更しない。' +
          'rowId が既に判明している場合に使う。名前で検索してフォーカスするなら ui_show_person を使うこと。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId: { type: 'number', description: 'フォーカス対象の rowId（findPersons の positions[].rowId）' },
          },
        },
      },
    },
    execute: (args) => {
      const rowId   = args.rowId as number
      const store   = useStore.getState()
      const row     = store.allocationList.find(r => r.rowId === rowId)
      if (!row) return { ok: false, message: `rowId ${rowId} が見つかりません` }

      const name    = [row.lastName, row.firstName].filter(Boolean).join(' ')
      const person  = store.persons.find(p => p.sfPersonId === row.userId)
      if (person) {
        store.selectPersonAndFocusOrg(person.id)
      } else {
        store.selectCard(rowId)
      }
      return { ok: true, message: `${name} にフォーカスしました` }
    },
  },
]

// ── Public API ────────────────────────────────────────────────────────────────

const entryMap = new Map<string, ToolEntry>(
  TOOL_ENTRIES.map(e => [e.definition.function.name, e])
)

function parseArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown> }
  catch { return {} }
}

export const toolRegistry = {
  get definitions(): ToolDefinition[] {
    return TOOL_ENTRIES.map(e => e.definition)
  },

  /** Fast Path で公開する安全なツール定義（read / render / navigate）。 */
  getSafeDefinitions(): ToolDefinition[] {
    return TOOL_ENTRIES
      .filter(e => e.kind === 'read' || e.kind === 'render' || e.kind === 'navigate')
      .map(e => e.definition)
  },

  /** 指定したツール名のみに絞り込んだ定義リストを返す（Skill の allowed-tools 用）。 */
  getDefinitionsForNames(names: string[]): ToolDefinition[] {
    return TOOL_ENTRIES
      .filter(e => names.includes(e.definition.function.name))
      .map(e => e.definition)
  },

  getEntry(name: string): ToolEntry | undefined {
    return entryMap.get(name)
  },

  /**
   * DB から取得したスキル定義で tool description を上書きする。
   * active な skill_def がある toolName のみ反映。起動時に一度だけ呼ぶ。
   */
  applyDescriptionOverrides(overrides: Record<string, string>): void {
    for (const entry of TOOL_ENTRIES) {
      const desc = overrides[entry.definition.function.name]
      if (desc) entry.definition.function.description = desc
    }
  },

  /** read / execute / navigate ツール用の便利メソッド（AgentRunner が内部で使う）。 */
  execute(call: ToolCall): ToolResult {
    const entry = entryMap.get(call.function.name)
    const args  = parseArgs(call.function.arguments)
    let result: unknown
    try {
      if (entry?.kind === 'read' || entry?.kind === 'execute' || entry?.kind === 'navigate') {
        result = entry.execute(args)
      } else {
        result = { error: `'${call.function.name}' は read/execute/navigate ツールではありません` }
      }
    } catch (e) {
      result = { error: String(e) }
    }
    return { toolCallId: call.id, content: JSON.stringify(result) }
  },
}
