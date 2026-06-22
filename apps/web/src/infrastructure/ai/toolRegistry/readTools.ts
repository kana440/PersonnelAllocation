// toolRegistry/readTools.ts — read ツール群
//
// オーナー: AI 開発者
// 変更方針: AI が参照・取得できる情報を追加・変更するときはこのファイルを編集する。
// 副作用なし・ドメインデータを変更しない純粋な read ツールのみここに置く。
// UI 表示専用の read（ui_get_form_state）は navigateTools.ts を参照。
//
// 新しい read ツールを追加するときの手順:
//   1. aiTools/read.ts に実装を追加（HRApplicationService に委譲）
//   2. このファイルに ReadEntry を追加
//   3. index.ts の READ_TOOLS は自動的に反映される

import type { ReadEntry } from './types'
import { aiTools }        from '../../../application/aiTools'
import { useFormStateStore } from '../../../store/formStateStore'

export const READ_TOOLS: ReadEntry[] = [

  // ── findPersons ────────────────────────────────────────────────────────────
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

  // ── findOrgs ───────────────────────────────────────────────────────────────
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

  // ── getPersonsDetail ───────────────────────────────────────────────────────
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

  // ── getReviewSummary ───────────────────────────────────────────────────────
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

  // ── getChangedRows ─────────────────────────────────────────────────────────
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

  // ── getValidationIssues ────────────────────────────────────────────────────
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

  // ── findVacantPositions ────────────────────────────────────────────────────
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

  // ── getOperationStatus ─────────────────────────────────────────────────────
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

  // ── getValidationDiagnosis ─────────────────────────────────────────────────
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

  // ── getFieldOptions ────────────────────────────────────────────────────────
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

  // ── getPromotionBandInfo ───────────────────────────────────────────────────
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

  // ── computePromotionStepDiff ───────────────────────────────────────────────
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
            rowId:           { type: 'number', description: '対象行の rowId' },
            newPositionBand: { type: 'string', description: '新しいポジションバンド' },
          },
        },
      },
    },
    execute: args => ({
      stepDiff: aiTools.computePromotionStepDiff(args.rowId as number, args.newPositionBand as string),
    }),
  },

  // ── getUnassignedPositions ─────────────────────────────────────────────────
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
]
