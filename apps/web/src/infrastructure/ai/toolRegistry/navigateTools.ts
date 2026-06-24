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
import { aiTools }            from '../../../application/aiTools'
import { useStore }           from '../../../store/useStore'
import { useUICommandStore }  from '../../../store/uiCommandStore'
import { useFormStateStore }  from '../../../store/formStateStore'
import { ALL_EDIT_OPERATIONS } from '@personnel/domain/commands/defs'
import type { AllocationRow }  from '@personnel/domain/allocationRow'

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
        description:
          '指定した人物の操作フォームを開き、AIが把握している値を事前入力する。' +
          'UIの表示のみ変更・データは変更しない。ユーザーが残りを入力して送信する。' +
          '「昇格フォームを開いて」「異動画面を出して」のようなリクエストに使う。' +
          'findPersons で rowId と availableOps を確認した後に使うこと（availableOps にない ID はエラーになる）。' +
          '\n' +
          '昇降格・役職変更: Promotion（昇格）/ Demotion（降格）/ TitleChange（役職変更）/ MpTrackSwitch（M職P職切替）\n' +
          '雇用形態: JobTypeChange（ジョブタイプ変更）/ EmploymentExtension（雇用延長）/ EmploymentTypeChange（雇用タイプ変更）\n' +
          '組織異動: OrgTransfer（社内異動）/ OrgRestructure（組織改変）/ ManagerChange（上司変更）\n' +
          '兼務: ConcurrentAdd（兼務追加コピー）/ ConcurrentRelease（兼務解除）/ ConcurrentAddCancel（兼務追加取消）\n' +
          '在籍・退職: LeaveOfAbsence（休職）/ LeaveOfAbsenceCancel（休職取消）/ ReturnFromLeave（復職）/ ReturnFromLeaveCancel（復職取消）/ EmploymentTransfer（移籍）/ EmploymentTransferCancel（移籍取消）/ NoChange（変更なし）/ NoChangeCancel（変更なし取消）\n' +
          '出向設定: SecondmentOutSF（本務出向・SF統合先）/ SecondmentOutNonSF（本務出向・SF外）/ ConcurrentSecondmentOutNonSF（兼務出向・SF外）\n' +
          '出向解除: SecondmentOutReleaseSF / SecondmentOutReleaseNonSF / SecondmentInReleaseSF / SecondmentInReleaseNonSF\n' +
          '出向解除（兼務）: ConcurrentSecondmentOutReleaseSF / ConcurrentSecondmentOutReleaseNonSF / ConcurrentSecondmentInReleaseSF / ConcurrentSecondmentInReleaseNonSF\n' +
          '出向受入取消: SecondmentInCancel / ConcurrentSecondmentInCancel\n' +
          '※ 組織パネルボタン専用（直接開けない）: ConcurrentAddNew / SecondmentInNew / ConcurrentSecondmentInNew / AddEmptyPosition',
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
