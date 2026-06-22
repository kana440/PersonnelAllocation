// Fast Path → Structured Path の切り替えを担う疑似ツール定義。
//
// Fast Path: read/render ツールのみ公開。高速・安全。
// Structured Path: LLMが request_structured_planning を呼んだときに移行。
//   → ActionFrame（意図の構造化抽出）を受け取り、スキルを選択してから実行。

import type { ToolDefinition } from '../../ports'

/** Fast Path 時に LLM が構造化パスへの移行を要求する疑似ツール。 */
export const REQUEST_STRUCTURED_PLANNING: ToolDefinition = {
  type: 'function',
  function: {
    name: 'request_structured_planning',
    description: [
      '現在の依頼が読み取り・表示操作だけでは処理できない場合に呼ぶ。',
      '以下のいずれかに該当する場合に使用する:',
      '- 従業員・組織の情報を変更・作成・削除する操作が必要',
      '- 複数の手順を順番に実行する必要がある（玉突き人事・昇格処理・出向操作など）',
      '- 意図が曖昧で確認が必要',
      '読み取り・検索・表示のみで完結する場合は使わない。',
    ].join(' '),
    parameters: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: {
          type: 'string',
          description: '構造化パスが必要な理由（例: 「異動操作が必要」「複数人の昇格処理が必要」）',
        },
        suspectedOperation: {
          type: 'string',
          description: '想定される操作の種別（transfer / promotion / field_edit / bulk_transfer / leave_of_absence / concurrent_add 等）',
        },
        missingInformation: {
          type: 'array',
          items: { type: 'string' },
          description: '不足している情報のリスト（例: ["移動先組織名", "対象者のuserId"]）',
        },
        skillCandidates: {
          type: 'array',
          items: { type: 'string' },
          description: '使うと思われるスキルの slug（例: ["cascading-transfer", "promotion-workflow"]）',
        },
      },
    },
  },
}

/** Fast Path のシステムプロンプトに追加するサフィックス。 */
export const FAST_PATH_SYSTEM_SUFFIX = `

## 実行モード: Fast Path

現在は以下の操作が実行できます:
- **情報の読み取り・検索・表示**（findPersons, getReviewSummary, getFieldOptions 等）
- **UIナビゲーション**（ui_* プレフィックスのツール。画面フォーカス・フォームを開く・フォーム値を入力補助）

UIナビゲーションツールの用途:
- ui_show_person: 「〇〇さんを見せて」→ 画面上で人物にフォーカス（検索+表示を1ステップ）
- ui_focus_row: rowId が既知のときにキャンバス上でフォーカス
- ui_open_operation: 「昇格フォームを開いて」→ 操作フォームを開いて値を事前入力
- ui_get_form_state: 現在開いているフォームの入力状態を読む
- ui_suggest_form_field: 開いているフォームのフィールドに値を設定

以下の場合は必ず request_structured_planning を呼んでください:
- 従業員・組織の情報を変更・更新・削除する（異動・昇格・兼務・出向・休職 等）
- 複数の手順を順番に実行する必要がある
- 意図が曖昧で確認が必要

情報の参照・検索・表示・UIナビゲーションだけで答えられる場合は、そのままツールを使って回答してください。
`

/** LLMが request_structured_planning を呼んだときに返す構造体。 */
export interface ActionFrame {
  reason: string
  suspectedOperation?: string
  missingInformation?: string[]
  skillCandidates?: string[]
}
