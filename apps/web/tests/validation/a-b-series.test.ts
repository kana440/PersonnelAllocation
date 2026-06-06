// A系（必須チェック）・B系（形式チェック）シナリオ
// 仕様: specs/G2-domain/02-validation-rules.md
import { runScenarios } from '../helpers/runner'

// ══════════════════════════════════════════════════════════════════════════════
// A1-0: transferReason は常に必須
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('A1-0: 申請区分（異動事由）は常に必須', [
  {
    id: 'A1-0-1', desc: 'transferReason 未設定 → エラー',
    row: { transferReason: undefined },
    expect: { errorFields: ['transferReason'] },
  },
  {
    id: 'A1-0-2', desc: 'transferReason 設定済 → エラーなし',
    row: { transferReason: '通常異動' },
    expect: { noErrorFields: ['transferReason'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// A1-1: positionCode あり → ポジション属性フィールドは必須
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('A1-1: positionCode あり時の必須フィールド', [
  {
    id: 'A1-1-1', desc: 'positionCode あり・departmentCode なし → エラー',
    row: { positionCode: 'P12345678', departmentCode: undefined },
    expect: { errorFields: ['departmentCode'] },
  },
  {
    id: 'A1-1-2', desc: 'positionCode なし → departmentCode 不要',
    row: { positionCode: undefined, departmentCode: undefined },
    expect: { noErrorFields: ['departmentCode'] },
  },
  {
    id: 'A1-1-3', desc: 'positionCode あり・全必須フィールド設定済 → エラーなし',
    row: {
      positionCode: 'P12345678', departmentCode: 'ORG001', officialPositionCode: '一般職',
      location: '本社', costCenter: '12345-AB00001', managerPositionCode: 'P00000001',
      jobFamily: 'エンジニアリング', jobType: 'SE', positionBand: 'M4',
      trainingPositionFlag: '0', positionUnionFlag: '非組合員', positionDiscretionaryWorkFlag: '0',
    },
    expect: { noErrorFields: ['departmentCode', 'officialPositionCode', 'location'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// A1-2: userId あり → 人属性フィールドは必須
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('A1-2: userId あり時の必須フィールド', [
  {
    id: 'A1-2-1', desc: 'userId あり・band なし → エラー',
    row: { userId: '1234567', band: undefined },
    expect: { errorFields: ['band'] },
  },
  {
    id: 'A1-2-2', desc: 'userId なし → band 不要',
    row: { userId: undefined, band: undefined },
    expect: { noErrorFields: ['band'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// A2: 出向者用組織 → 出向先会社は必須
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('A2: 出向者用組織のとき出向先会社は必須', [
  {
    id: 'A2-1', desc: '出向者用組織 + 出向先会社なし → エラー',
    row: { departmentCode: 'ORG002', secondmentToCompany: undefined },
    expect: { errorFields: ['secondmentToCompany'] },
  },
  {
    id: 'A2-2', desc: '出向者用組織 + 出向先会社あり → エラーなし',
    row: { departmentCode: 'ORG002', secondmentToCompany: '出向先A' },
    expect: { noErrorFields: ['secondmentToCompany'] },
  },
  {
    id: 'A2-3', desc: '通常組織 → 出向先会社不要',
    row: { departmentCode: 'ORG001', secondmentToCompany: undefined },
    expect: { noErrorFields: ['secondmentToCompany'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// A3: 雇用タイプが出向受入 → 出向元会社・出向元社員番号は必須
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('A3: 出向受入の場合の必須フィールド', [
  {
    id: 'A3-1', desc: '出向受入タイプ + 出向元会社なし → エラー',
    row: { employmentType: '出向受入社員', secondmentFromCompany: undefined },
    expect: { errorFields: ['secondmentFromCompany', 'secondmentFromEmployeeNumber'] },
  },
  {
    id: 'A3-2', desc: '出向受入タイプ + 出向元情報あり → エラーなし',
    row: { employmentType: '出向受入社員', secondmentFromCompany: '出向元A', secondmentFromEmployeeNumber: '9876543' },
    expect: { noErrorFields: ['secondmentFromCompany', 'secondmentFromEmployeeNumber'] },
  },
  {
    id: 'A3-3', desc: '社員タイプ → 出向元情報不要',
    row: { employmentType: '社員', secondmentFromCompany: undefined },
    expect: { noErrorFields: ['secondmentFromCompany'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// A4: 兼務チェックサイン → 兼務理由は必須
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('A4: 兼務チェックサインがあるとき兼務理由は必須', [
  {
    id: 'A4-1', desc: '兼務 transferReason + 兼務理由なし → エラー',
    row: { transferReason: '兼務', concurrentReason: undefined },
    expect: { errorFields: ['concurrentReason'] },
  },
  {
    id: 'A4-2', desc: '兼務 transferReason + 兼務理由あり → エラーなし',
    row: { transferReason: '兼務', concurrentReason: '業務支援' },
    expect: { noErrorFields: ['concurrentReason'] },
  },
  {
    id: 'A4-3', desc: '通常 transferReason → 兼務理由不要',
    row: { transferReason: '通常異動', concurrentReason: undefined },
    expect: { noErrorFields: ['concurrentReason'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// A5: フリータイトル役職 → localJobTitle は必須
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('A5: フリータイトル役職のとき localJobTitle は必須', [
  {
    id: 'A5-1', desc: 'フリータイトル役職 + localJobTitle なし → エラー',
    row: { officialPositionCode: 'フリータイトル役職', localJobTitle: undefined },
    expect: { errorFields: ['localJobTitle'] },
  },
  {
    id: 'A5-2', desc: 'フリータイトル役職 + localJobTitle あり → エラーなし',
    row: { officialPositionCode: 'フリータイトル役職', localJobTitle: 'スペシャリスト' },
    expect: { noErrorFields: ['localJobTitle'] },
  },
  {
    id: 'A5-3', desc: '通常役職 → localJobTitle 不要',
    row: { officialPositionCode: '一般職', localJobTitle: undefined },
    expect: { noErrorFields: ['localJobTitle'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// B系: 形式チェック
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('B1: 社員番号は7桁半角数字', [
  { id: 'B1-1', desc: '8桁 → エラー', row: { employeeNumber: '12345678' }, expect: { errorFields: ['employeeNumber'] } },
  { id: 'B1-2', desc: '英字混入 → エラー', row: { employeeNumber: '123456A' }, expect: { errorFields: ['employeeNumber'] } },
  { id: 'B1-3', desc: '7桁数字 → OK',    row: { employeeNumber: '1234567' }, expect: { noErrorFields: ['employeeNumber'] } },
  { id: 'B1-4', desc: '未設定 → スキップ', row: { employeeNumber: undefined }, expect: { noErrorFields: ['employeeNumber'] } },
])

runScenarios('B2: ポジションコードは P + 8桁数字', [
  { id: 'B2-1', desc: '内部採番 (_pos_) → スキップ', row: { positionCode: '_pos_1' }, expect: { noErrorFields: ['positionCode'] } },
  { id: 'B2-2', desc: 'P + 7桁 → エラー', row: { positionCode: 'P1234567' }, expect: { errorFields: ['positionCode'] } },
  { id: 'B2-3', desc: 'P + 8桁 → OK',     row: { positionCode: 'P12345678' }, expect: { noErrorFields: ['positionCode'] } },
])

runScenarios('B3: コストセンターは 数字5桁-英数字7桁', [
  { id: 'B3-1', desc: '形式違反 → エラー', row: { costCenter: '1234-AB00001' }, expect: { errorFields: ['costCenter'] } },
  { id: 'B3-2', desc: '正しい形式 → OK',   row: { costCenter: '12345-AB00001' }, expect: { noErrorFields: ['costCenter'] } },
])

runScenarios('B4: ユーザーIDは半角数字のみ', [
  { id: 'B4-1', desc: '英字混入 → エラー', row: { userId: 'abc1234' }, expect: { errorFields: ['userId'] } },
  { id: 'B4-2', desc: '数字のみ → OK',     row: { userId: '1234567' }, expect: { noErrorFields: ['userId'] } },
])
