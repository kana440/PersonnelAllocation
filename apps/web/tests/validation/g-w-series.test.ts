// G系（データ整合性チェック）・W系（ワーニング）シナリオ
// 仕様: specs/G2-domain/02-validation-rules.md
import { runScenarios } from '../helpers/runner'
import type { RowChanges } from '@personnel/domain/patterns/changeDetection'

// ── RowChanges ヘルパー ───────────────────────────────────────────────────────
const changes = (kinds: RowChanges['kinds']): RowChanges =>
  ({ kinds, bandMismatch: false, diffCount: kinds.size })

// ══════════════════════════════════════════════════════════════════════════════
// G1: 昇格・降格でポジションコードが変わっていない場合はエラー
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('G1: 昇降格時はポジションコードの変更が必要', [
  {
    id: 'G1-1', desc: '昇格 + 異動なし + ポジション未変更 → エラー',
    row: { positionCode: 'P12345678', prevPositionCode: 'P12345678' },
    changes: changes(new Set(['promotion'])),
    expect: { errorFields: ['positionCode'] },
  },
  {
    id: 'G1-2', desc: '昇格 + ポジション変更あり → エラーなし',
    row: { positionCode: 'P99999999', prevPositionCode: 'P12345678' },
    changes: changes(new Set(['promotion'])),
    expect: { noErrorFields: ['positionCode'] },
  },
  {
    id: 'G1-3', desc: '昇格 + 組織異動あり → エラーなし（transfer 伴う場合は許容）',
    row: { positionCode: 'P12345678', prevPositionCode: 'P12345678' },
    changes: changes(new Set(['promotion', 'transfer'])),
    expect: { noErrorFields: ['positionCode'] },
  },
  {
    id: 'G1-4', desc: '降格 + ポジション未変更 → エラー',
    row: { positionCode: 'P12345678', prevPositionCode: 'P12345678' },
    changes: changes(new Set(['demotion'])),
    expect: { errorFields: ['positionCode'] },
  },
  {
    id: 'G1-5', desc: 'changes なし（validateRow に渡さない）→ G1 スキップ',
    row: { positionCode: 'P12345678', prevPositionCode: 'P12345678' },
    // changes 未設定
    expect: { noErrorFields: ['positionCode'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// W2: 社員 + 本人行で band の昇降格ワーニングレベル差が 2 以上ならワーニング
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('W2: 2段階昇降格のワーニング（社員・本人行）', [
  {
    id: 'W2-1', desc: '社員・本人行・M3→M6（WarningLevel 2→5, 差3）→ warning',
    row: {
      employmentType: '社員', userId: '111', groupEmployeeId: '111',
      band: 'M6', prevBand: 'M3',
    },
    expect: { errorFields: ['band'] },  // level:'warning' も issues に含まれる
  },
  {
    id: 'W2-2', desc: '社員・本人行・M3→M4（WarningLevel 2→3, 差1）→ ワーニングなし',
    row: {
      employmentType: '社員', userId: '111', groupEmployeeId: '111',
      band: 'M4', prevBand: 'M3',
    },
    expect: { noErrorFields: ['band'] },
  },
  {
    id: 'W2-3', desc: '出向受入タイプ（WarningLevel=0）→ ワーニング対象外',
    row: {
      employmentType: '出向受入社員', userId: '111', groupEmployeeId: '111',
      band: 'OM3', prevBand: 'OM3',
    },
    expect: { noErrorFields: ['band'] },
  },
  {
    id: 'W2-4', desc: '社員だが userId !== groupEmployeeId（兼務行）→ ワーニング対象外',
    row: {
      employmentType: '社員', userId: '111', groupEmployeeId: '999',
      band: 'M6', prevBand: 'M3',
    },
    expect: { noErrorFields: ['band'] },
  },
])
