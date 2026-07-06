// toolRegistry/navigateTools.ts — UI ナビゲーション専用ツール群
//
// オーナー: AI 開発者
// 変更方針: AI が画面操作・フォーム制御を行うツールを追加・変更するときはこのファイルを編集する。
// ドメインデータを変更しないため Fast Path でも安全に実行できる。
// ui_get_form_state は kind: 'read' だが UI 状態読み取り専用のためこのファイルに配置する。
//
// Web 開発者への注意: useStore / useUICommandStore / useFormStateStore の API が変わった場合は
// このファイルの execute 関数も更新が必要。変更前に AI 開発者に連絡すること。

import type { ReadEntry, NavigateEntry } from './types'
import { aiTools }                  from '../../../application/aiTools'
import { useStore }                 from '../../../store/useStore'
import { useUICommandStore }        from '../../../store/uiCommandStore'
import { useFormStateStore }        from '../../../store/formStateStore'
import { useCanvasLayoutStore }     from '../../../store/canvasLayoutStore'
import { useCanvasDisplayStore }    from '../../../store/canvasDisplayStore'
import { COMPACT_GROUP_DEFS }       from '../../../components/canvas/panel/compactGroupDefs'
import { ALL_EDIT_OPERATIONS }      from '@personnel/domain/commands/defs'
import type { EditOperation }       from '@personnel/domain/commands/defs'
import type { AllocationRow }       from '@personnel/domain/allocationRow'

// ── ui_open_operation の説明文を defs から自動生成 ────────────────────────────
// entryPoints に personMenu / dragIntent が含まれる操作 = AI から直接起動可能。
// orgAddButton のみの操作は組織パネルボタン専用で AI から直接起動不可。

const GROUP_LABEL: Record<string, string> = {
  jobClassification:    '職務情報系',
  position:             'ポジション系',
  person:               '在籍・退職系',
  secondmentMain:       '本務出向系',
  secondmentConcurrent: '兼務出向系',
}

const GROUP_ORDER = ['jobClassification', 'position', 'person', 'secondmentMain', 'secondmentConcurrent']

function isAiOpenable(op: EditOperation): boolean {
  if (!op.entryPoints || op.entryPoints.length === 0) return true
  return op.entryPoints.some(p => p === 'personMenu' || p === 'dragIntent')
}

function buildOpenOperationDesc(): string {
  const byGroup = new Map<string, EditOperation[]>()
  for (const op of ALL_EDIT_OPERATIONS) {
    if (!byGroup.has(op.group)) byGroup.set(op.group, [])
    byGroup.get(op.group)!.push(op)
  }

  const header =
    '指定した人物の操作フォームを開き、AIが把握している値を事前入力する。' +
    'UIの表示のみ変更・データは変更しない。ユーザーが残りを入力して送信する。' +
    '「昇格フォームを開いて」「異動画面を出して」のようなリクエストに使う。' +
    'findPersons で rowId と availableOps を確認した後に使うこと（availableOps にない ID はエラーになる）。\n'

  const orgOnlyIds: string[] = []
  let body = ''

  for (const g of GROUP_ORDER) {
    const ops = byGroup.get(g) ?? []
    const aiOps   = ops.filter(isAiOpenable)
    const blocked = ops.filter(op => !isAiOpenable(op))
    orgOnlyIds.push(...blocked.map(op => op.id))
    if (aiOps.length === 0) continue
    body += `\n${GROUP_LABEL[g] ?? g}:\n`
    for (const op of aiOps) {
      body += `  ${op.id}（${op.label}）`
      if (op.availabilityNote) body += `: ${op.availabilityNote}`
      body += '\n'
    }
  }

  const footer = orgOnlyIds.length > 0
    ? `\n※ 組織パネルボタン専用（直接開けない）: ${orgOnlyIds.join(' / ')}`
    : ''

  return header + body + footer
}

const OPEN_OPERATION_DESC = buildOpenOperationDesc()

export const NAVIGATE_TOOLS: Array<ReadEntry | NavigateEntry> = [

  // ── ui_open_operation ──────────────────────────────────────────────────────
  // 指定行の操作フォームを開き、既知の値を prefill する。
  // ユーザーが残りを入力して通常通り送信する（AI は送信しない）。
  {
    kind: 'navigate',
    definition: {
      type: 'function',
      function: {
        name: 'ui_open_operation',
        description: OPEN_OPERATION_DESC,
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

  // ── ui_get_form_state ──────────────────────────────────────────────────────
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

  // ── ui_suggest_form_field ──────────────────────────────────────────────────
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

  // ── ui_show_person ─────────────────────────────────────────────────────────
  // 「ユーザーが画面で確認したい」という意図専用のナビゲーションツール。
  // 内部で findPersons 相当の検索 + フォーカスを1ステップで行う。
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

  // ── ui_set_main_view ───────────────────────────────────────────────────────
  // 主画面を「組織図（canvas）」か「表形式（review）」に切り替える。
  {
    kind: 'navigate',
    definition: {
      type: 'function',
      function: {
        name: 'ui_set_main_view',
        description:
          '主画面を「組織図」か「表形式（比較形式/並列形式）」に切り替える。' +
          'UIの表示モードを変更するのみで、データは一切変更しない。' +
          '「組織図を見せて」「表形式で確認したい」「一覧表に切り替えて」のようなリクエストに使う。' +
          '組織図モード（canvas）では組織パネルとキャンバスが表示される。' +
          '表形式モード（review）ではBefore/After比較形式の一覧表が表示される。',
        parameters: {
          type: 'object',
          required: ['mode'],
          properties: {
            mode: {
              type: 'string',
              enum: ['canvas', 'review'],
              description: "'canvas'=組織図、'review'=表形式（比較形式/並列形式）",
            },
          },
        },
      },
    },
    execute: (args) => {
      const mode = args.mode as 'canvas' | 'review'
      useUICommandStore.getState().dispatch({ type: 'setMainViewMode', mode })
      const label = mode === 'canvas' ? '組織図' : '表形式'
      return { ok: true, message: `${label}に切り替えました` }
    },
  },

  // ── ui_set_canvas_display ─────────────────────────────────────────────────
  // 組織図の表示設定（パネルスタイル・コンパクトグループ・比較モード）を変更する。
  {
    kind: 'navigate',
    definition: {
      type: 'function',
      function: {
        name: 'ui_set_canvas_display',
        description:
          '組織図の表示設定を変更する。UIの表示のみ変更・データは変更しない。' +
          '変更したいパラメータだけ渡せばよい（省略したものは変更されない）。\n' +
          '\n' +
          'パネルスタイル（panelStyle）:\n' +
          "  'tree'    = ツリー表示（デフォルト）: 組織階層を展開したカード表示\n" +
          "  'band'    = コンパクト表示: バンド/役職/勤務場所などでグループ表示\n" +
          '\n' +
          'コンパクトグループ（compactGroupId、panelStyle=band のときのみ有効）:\n' +
          "  'positionBand'       = バンド別\n" +
          "  'location'           = 勤務場所別\n" +
          "  'officialPositionCode' = 役職別\n" +
          "  'jobType'            = ジョブタイプ別\n" +
          "  'concurrentType'     = 本務/兼務別\n" +
          '\n' +
          '旧体制との比較（comparisonMode）:\n' +
          '  true = 旧組織（before）パネルを並べて表示\n' +
          '  false = 新組織（after）のみ表示\n' +
          '\n' +
          '「バンド別で見せて」「旧体制との比較を有効にして」「ツリー表示に戻して」のリクエストに使う。',
        parameters: {
          type: 'object',
          properties: {
            panelStyle: {
              type: 'string',
              enum: ['tree', 'band'],
              description: "パネル表示スタイル。'tree'=ツリー、'band'=コンパクト",
            },
            compactGroupId: {
              type: 'string',
              enum: ['positionBand', 'location', 'officialPositionCode', 'jobType', 'concurrentType'],
              description: 'コンパクト表示のグループ単位（panelStyle=band のときのみ有効）',
            },
            comparisonMode: {
              type: 'boolean',
              description: '旧体制との比較表示を有効（true）または無効（false）にする',
            },
          },
        },
      },
    },
    execute: (args) => {
      const canvasStore  = useCanvasLayoutStore.getState()
      const displayStore = useCanvasDisplayStore.getState()
      const changed: string[] = []

      if (args.panelStyle !== undefined) {
        const style = args.panelStyle as 'tree' | 'band'
        canvasStore.setCanvasPanelStyle(style)
        changed.push(`パネルスタイル → ${style === 'tree' ? 'ツリー' : 'コンパクト'}`)
      }
      if (args.compactGroupId !== undefined) {
        const gid = args.compactGroupId as string
        const def = COMPACT_GROUP_DEFS.find(d => d.id === gid)
        displayStore.setCompactGroupById(gid)
        changed.push(`グループ単位 → ${def?.label ?? gid}別`)
      }
      if (args.comparisonMode !== undefined) {
        const want = args.comparisonMode as boolean
        if (canvasStore.comparisonMode !== want) canvasStore.toggleComparisonMode()
        changed.push(`旧体制比較 → ${want ? 'ON' : 'OFF'}`)
      }

      if (changed.length === 0) return { ok: false, message: '変更するパラメータがありません' }
      return { ok: true, message: changed.join('、') + ' に変更しました' }
    },
  },

  // ── ui_focus_row ───────────────────────────────────────────────────────────
  // rowId が既に分かっているときの低レベルフォーカス。
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
