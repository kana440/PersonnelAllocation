// C系（関連チェック）・D系（存在チェック）シナリオ
// 仕様: specs/G2-domain/02-validation-rules.md
import { runScenarios, strict } from '../helpers/runner'
import { MOCK_ORG_ENTRIES } from '../helpers/fixtures'

// ══════════════════════════════════════════════════════════════════════════════
// C1: 組織サブフィールドがマスタと一致するか
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('C1: 組織サブフィールドはマスタ値と一致すること', [
  {
    id: 'C1-1', desc: '組織コードあり + businessUnit 不一致 → エラー',
    row: { departmentCode: 'ORG001', businessUnit: '違うBU' },
    expect: { errorFields: ['businessUnit'] },
  },
  {
    id: 'C1-2', desc: '組織コードあり + 全サブフィールド一致 → エラーなし',
    row: {
      departmentCode: 'ORG001',
      businessUnit: 'BU1', division: 'DIV1', subDivision: 'DEPT1',
      group: 'G1', team: 'T1',
    },
    expect: { noErrorFields: ['businessUnit', 'division', 'group'] },
  },
  {
    id: 'C1-3', desc: 'orgMasterEntries 未ロード（空）→ スキップ',
    row: { departmentCode: 'ORG001', businessUnit: '違うBU' },
    cl: { orgMasterEntries: [] },
    expect: { noErrorFields: ['businessUnit'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// C2: 勤務場所・コストセンターがマスタと一致するか
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('C2: 勤務場所・コストセンターはマスタ値と一致すること', [
  {
    id: 'C2-1', desc: '組織コードあり + location 不一致 → エラー',
    row: { departmentCode: 'ORG001', location: '大阪' },
    expect: { errorFields: ['location'] },
  },
  {
    id: 'C2-2', desc: '組織コードあり + location 一致 → エラーなし',
    row: { departmentCode: 'ORG001', location: '本社' },
    expect: { noErrorFields: ['location'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// C3: 非組合協定対象者は positionUnionFlag / unionFlag が「非組合員」であること
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('C3: 非組合協定対象者の組合員フラグ制約', [
  {
    id: 'C3-1', desc: 'nonUnionAgreementFlag=1 + 組合員 → エラー',
    row: { nonUnionAgreementFlag: '1', positionUnionFlag: '組合員', unionFlag: '組合員' },
    expect: { errorFields: ['positionUnionFlag', 'unionFlag'] },
  },
  {
    id: 'C3-2', desc: 'nonUnionAgreementFlag=1 + 非組合員 → エラーなし',
    row: { nonUnionAgreementFlag: '1', positionUnionFlag: '非組合員', unionFlag: '非組合員' },
    expect: { noErrorFields: ['positionUnionFlag', 'unionFlag'] },
  },
  {
    id: 'C3-3', desc: 'nonUnionAgreementFlag なし → チェックしない',
    row: { nonUnionAgreementFlag: undefined, positionUnionFlag: '組合員' },
    expect: { noErrorFields: ['positionUnionFlag'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// D2-1: 組織コードが Organization マスタに存在すること
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('D2-1: 組織コードは Organization マスタに存在すること', [
  {
    id: 'D2-1-1', desc: 'マスタに存在しない組織コード → エラー',
    row: { departmentCode: 'UNKNOWN' },
    expect: { errorFields: ['departmentCode'] },
  },
  {
    id: 'D2-1-2', desc: 'マスタに存在する組織コード → エラーなし',
    row: { departmentCode: 'ORG001' },
    expect: { noErrorFields: ['departmentCode'] },
  },
  {
    id: 'D2-1-3', desc: 'orgs 未ロード（空）→ スキップ',
    row: { departmentCode: 'UNKNOWN' },
    orgs: [],
    expect: { noErrorFields: ['departmentCode'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// D2-2〜D2-6: コードリストへの存在チェック
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('D2-2: 役職はマスタに存在すること', [
  {
    id: 'D2-2-1', desc: 'マスタ外の役職 → エラー',
    row: { officialPositionCode: '存在しない役職' },
    strictnessOverrides: strict('officialPositionCode'),
    expect: { errorFields: ['officialPositionCode'] },
  },
  {
    id: 'D2-2-2', desc: 'マスタ内の役職 → エラーなし',
    row: { officialPositionCode: '一般職' },
    expect: { noErrorFields: ['officialPositionCode'] },
  },
])

runScenarios('D2-5: 雇用タイプはマスタに存在すること', [
  {
    id: 'D2-5-1', desc: 'マスタ外の雇用タイプ → エラー',
    row: { employmentType: '存在しない雇用タイプ' },
    strictnessOverrides: strict('employmentType'),
    expect: { errorFields: ['employmentType'] },
  },
  {
    id: 'D2-5-2', desc: 'マスタ内の雇用タイプ（社員）→ エラーなし',
    row: { employmentType: '社員' },
    expect: { noErrorFields: ['employmentType'] },
  },
])

runScenarios('D2-8: バンドはマスタに存在すること', [
  {
    id: 'D2-8-1', desc: 'マスタ外のバンド → エラー',
    row: { band: '存在しないバンド' },
    strictnessOverrides: strict('band'),
    expect: { errorFields: ['band'] },
  },
  {
    id: 'D2-8-2', desc: 'マスタ内のバンド → エラーなし',
    row: { band: 'M4' },
    expect: { noErrorFields: ['band'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// ルーティング: transferReason の noCheckRequired === true → A/B/D/F 系スキップ
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('ルーティング: noCheckRequired=true のとき D系チェックをスキップ', [
  {
    id: 'ROUTE-1', desc: 'noCheckRequired=true → band マスタ外でもエラーなし',
    row: { transferReason: 'チェック不要', band: '存在しないバンド' },
    expect: { noErrorFields: ['band'] },
  },
  {
    id: 'ROUTE-2', desc: 'noCheckRequired=false → band マスタ外でエラーあり',
    row: { transferReason: '通常異動', band: '存在しないバンド' },
    strictnessOverrides: strict('band'),
    expect: { errorFields: ['band'] },
  },
])
