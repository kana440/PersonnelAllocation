// F系（雇用タイプ・申請区分による値制約）シナリオ
// バリデーション（エラー検出）とオプション絞り込み（選択肢）を同時検証する
// 仕様: specs/G2-domain/02-validation-rules.md
import { runScenarios } from '../helpers/runner'

// ══════════════════════════════════════════════════════════════════════════════
// F1: 出向受入タイプのとき band・payGrade は出向受入対応のものに限定
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('F1: 出向受入タイプのとき band・payGrade は出向受入対応のもののみ', [
  {
    id: 'F1-1', desc: '出向受入 + 社員バンド(M4) → band エラー',
    row: { employmentType: '出向受入社員', band: 'M4' },
    expect: { errorFields: ['band'] },
  },
  {
    id: 'F1-2', desc: '出向受入 + 出向受入バンド(OM3) → エラーなし',
    row: { employmentType: '出向受入社員', band: 'OM3' },
    expect: { noErrorFields: ['band'] },
  },
  {
    id: 'F1-3', desc: '出向受入 + 社員給与等級(G4) → payGrade エラー',
    row: { employmentType: '出向受入社員', payGrade: 'G4' },
    expect: { errorFields: ['payGrade'] },
  },
  {
    id: 'F1-4', desc: '出向受入 + 出向受入給与等級(OG3) → エラーなし',
    row: { employmentType: '出向受入社員', payGrade: 'OG3' },
    expect: { noErrorFields: ['payGrade'] },
  },
  {
    id: 'F1-5', desc: '出向受入タイプのとき band の選択肢は出向受入のみ・社員は除外',
    row: { employmentType: '出向受入社員' },
    expect: {
      options: [{ field: 'band', includes: ['OM3'], excludes: ['M4', 'M3', 'E1'] }],
    },
  },
  {
    id: 'F1-6', desc: '出向受入タイプのとき payGrade の選択肢は出向受入のみ・社員は除外',
    row: { employmentType: '出向受入社員' },
    expect: {
      options: [{ field: 'payGrade', includes: ['OG3'], excludes: ['G4', 'G3', 'EG1'] }],
    },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// F2: 社員タイプ + userId === groupEmployeeId のとき band・payGrade は社員対応のものに限定
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('F2: 社員タイプ + 本人行のとき band・payGrade は社員対応のもののみ', [
  {
    id: 'F2-1', desc: '社員 + 本人行 + 出向受入バンド(OM3) → エラー',
    row: { employmentType: '社員', userId: '111', groupEmployeeId: '111', band: 'OM3' },
    expect: { errorFields: ['band'] },
  },
  {
    id: 'F2-2', desc: '社員 + 本人行 + 社員バンド(M4) → エラーなし',
    row: { employmentType: '社員', userId: '111', groupEmployeeId: '111', band: 'M4' },
    expect: { noErrorFields: ['band'] },
  },
  {
    id: 'F2-3', desc: '社員だが userId !== groupEmployeeId（兼務行）→ F2 は非適用',
    row: { employmentType: '社員', userId: '111', groupEmployeeId: '999', band: 'OM3' },
    expect: { noErrorFields: ['band'] },
  },
  {
    id: 'F2-4', desc: '社員 + 本人行のとき band の選択肢は社員のみ・出向受入は除外',
    row: { employmentType: '社員', userId: '111', groupEmployeeId: '111' },
    expect: {
      options: [{ field: 'band', includes: ['M3', 'M4', 'M6'], excludes: ['OM3', 'E1'] }],
    },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// F3: 雇用延長タイプのとき band・payGrade は雇用延長対応のものに限定
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('F3: 雇用延長タイプのとき band・payGrade は雇用延長対応のもののみ', [
  {
    id: 'F3-1', desc: '雇用延長 + 社員バンド(M4) → エラー',
    row: { employmentType: '雇用延長社員', band: 'M4' },
    expect: { errorFields: ['band'] },
  },
  {
    id: 'F3-2', desc: '雇用延長 + 雇用延長バンド(E1) → エラーなし',
    row: { employmentType: '雇用延長社員', band: 'E1' },
    expect: { noErrorFields: ['band'] },
  },
  {
    id: 'F3-3', desc: '雇用延長タイプのとき band の選択肢は雇用延長のみ',
    row: { employmentType: '雇用延長社員' },
    expect: {
      options: [{ field: 'band', includes: ['E1'], excludes: ['M4', 'OM3'] }],
    },
  },
  {
    id: 'F3-4', desc: '雇用延長 + 社員給与等級(G4) → payGrade エラー',
    row: { employmentType: '雇用延長社員', payGrade: 'G4' },
    expect: { errorFields: ['payGrade'] },
  },
  {
    id: 'F3-5', desc: '雇用延長 + 雇用延長給与等級(EG1) → エラーなし',
    row: { employmentType: '雇用延長社員', payGrade: 'EG1' },
    expect: { noErrorFields: ['payGrade'] },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// F4: 兼務チェックサイン → payGrade は兼務対応のものに限定、leaveFlag は設定不可
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('F4: 兼務申請区分のとき payGrade は兼務対応のもの・leaveFlag は設定不可', [
  {
    id: 'F4-1', desc: '兼務 transferReason + 社員給与等級(G4) → payGrade エラー',
    row: { transferReason: '兼務', payGrade: 'G4' },
    expect: { errorFields: ['payGrade'] },
  },
  {
    id: 'F4-2', desc: '兼務 transferReason + 兼務給与等級(CG1) → エラーなし',
    row: { transferReason: '兼務', payGrade: 'CG1' },
    expect: { noErrorFields: ['payGrade'] },
  },
  {
    id: 'F4-3', desc: '兼務 transferReason + leaveFlag 設定あり → エラー',
    row: { transferReason: '兼務', leaveFlag: '1' },
    expect: { errorFields: ['leaveFlag'] },
  },
  {
    id: 'F4-4', desc: '兼務 transferReason + leaveFlag=0 → エラーなし',
    row: { transferReason: '兼務', leaveFlag: '0' },
    expect: { noErrorFields: ['leaveFlag'] },
  },
  {
    id: 'F4-5', desc: '通常 transferReason + 社員給与等級 → payGrade エラーなし（F4 非適用）',
    row: { transferReason: '通常異動', payGrade: 'G4' },
    expect: { noErrorFields: ['payGrade'] },
  },
  {
    id: 'F4-6', desc: '兼務のとき payGrade の選択肢は兼務のみ・社員は除外',
    row: { transferReason: '兼務' },
    expect: {
      options: [{ field: 'payGrade', includes: ['CG1'], excludes: ['G3', 'G4'] }],
    },
  },
])

// ══════════════════════════════════════════════════════════════════════════════
// F系 vs 雇用タイプ「その他」: どの条件にも当てはまらない場合は F系 非適用
// ══════════════════════════════════════════════════════════════════════════════
runScenarios('F系: その他タイプは F1〜F3 非適用（band の制約なし）', [
  {
    id: 'F-other-1', desc: 'その他タイプは社員バンドも出向バンドも選択肢に含まれる',
    row: { employmentType: 'その他' },
    expect: {
      options: [{ field: 'band', includes: ['M4', 'OM3', 'E1'] }],
    },
  },
])
