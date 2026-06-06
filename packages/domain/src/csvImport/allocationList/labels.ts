import type { FieldDef } from '../types'

// Array order = Excel column order.
// key    = JS property name (schema field name)
// header = Excel column header (Japanese label as shown in the sheet)
// en     = English description
// ja     = Japanese description
export const ALLOCATION_LIST_FIELDS: FieldDef[] = [
  // ── Metadata ──────────────────────────────────────────────────────────────────────────────────────
  { key: 'no',                               header: '№',                          en: 'No.',                                    ja: 'No' },
  { key: 'userId',                           header: 'ユーザー／社員ID',              en: 'User/Employee ID',                       ja: 'ユーザー/社員ID' },
  { key: 'groupEmployeeId',                  header: 'グループ社員ID',               en: 'Group Employee ID',                      ja: 'グループ社員ID' },
  { key: 'employeeNumber',                   header: '社員番号',                     en: 'Employee Number',                        ja: '社員番号' },
  { key: 'lastName',                         header: '姓',                           en: 'Last Name',                              ja: '姓' },
  { key: 'firstName',                        header: '名',                           en: 'First Name',                             ja: '名' },
  { key: 'transferReason',                   header: '申請区分(異動事由)',            en: 'Transfer Reason',                        ja: '申請区分(異動事由)' },
  { key: 'memo',                             header: 'メモ',                         en: 'Memo',                                   ja: 'メモ' },
  { key: 'promotionSign',                    header: '昇降格サイン',                 en: 'Promotion/Demotion Sign',                ja: '昇降格サイン' },
  { key: 'demotionReason',                   header: '降格理由',                     en: 'Demotion Reason',                        ja: '降格理由' },
  { key: 'payGradeChangeSign',               header: '給与等級変更サイン',           en: 'Pay Grade Change Sign',                  ja: '給与等級変更サイン' },

  // ── After state (_新 → canonical field names without suffix) ──────────────────────────────────────
  { key: 'employmentType',                   header: '雇用タイプ_新',                en: 'Employment Type',                        ja: '雇用タイプ_新' },
  { key: 'concurrentType',                   header: '本務兼務区分_新',              en: 'Concurrent Type',                        ja: '本務兼務区分_新' },
  { key: 'concurrentReason',                 header: '兼務理由_新',                  en: 'Concurrent Reason',                      ja: '兼務理由_新' },
  { key: 'secondmentFromCompany',            header: '出向元会社_新',                en: 'Secondment From Company',                ja: '出向元会社_新' },
  { key: 'secondmentFromEmployeeNumber',     header: '出向元会社社員番号_新',        en: 'Secondment From Employee Number',        ja: '出向元会社社員番号_新' },
  { key: 'leaveOfAbsenceSign',                        header: '休職者サイン_新',              en: 'Leave of Absence Sign',                             ja: '休職者サイン_新' },
  { key: 'positionCode',                     header: 'ポジションコード_新',          en: 'Position Code',                          ja: 'ポジションコード_新' },
  { key: 'departmentCode',                   header: '組織コード_新',                en: 'Department Code',                        ja: '組織コード_新' },
  { key: 'businessUnit',                     header: 'ビジネスユニット_新',          en: 'Business Unit',                          ja: 'ビジネスユニット_新' },
  { key: 'division',                         header: '部門_新',                      en: 'Division',                               ja: '部門_新' },
  { key: 'subDivision',                      header: '統括部_新',                    en: 'Sub-Division',                           ja: '統括部_新' },
  { key: 'group',                            header: 'グループ_新',                  en: 'Group',                                  ja: 'グループ_新' },
  { key: 'team',                             header: 'チーム_新',                    en: 'Team',                                   ja: 'チーム_新' },
  { key: 'officialPositionCode',             header: '役職_新',                      en: 'Official Position Code',                 ja: '役職_新' },
  { key: 'localJobTitle',                    header: 'フリータイトル_新',            en: 'Local Job Title',                        ja: 'フリータイトル_新' },
  { key: 'secondmentToCompany',              header: '出向先会社_新',                en: 'Secondment To Company',                  ja: '出向先会社_新' },
  { key: 'location',                         header: '勤務場所_新',                  en: 'Location',                               ja: '勤務場所_新' },
  { key: 'costCenter',                       header: 'コストセンター_新',            en: 'Cost Center',                            ja: 'コストセンター_新' },
  { key: 'managerPositionCode',              header: '上司ポジションコード_新',      en: 'Manager Position Code',                  ja: '上司ポジションコード_新' },
  { key: 'managerName',                      header: '上司氏名_新',                  en: 'Manager Name',                           ja: '上司氏名_新' },
  { key: 'jobFamily',                        header: 'ジョブファミリー_新',          en: 'Job Family',                             ja: 'ジョブファミリー_新' },
  { key: 'jobType',                          header: 'ジョブタイプ_新',              en: 'Job Type',                               ja: 'ジョブタイプ_新' },
  { key: 'positionBand',                     header: 'ポジション_バンド_新',         en: 'Position Band',                          ja: 'ポジション_バンド_新' },
  { key: 'band',                             header: 'バンド_新',                    en: 'Band',                                   ja: 'バンド_新' },
  { key: 'payGrade',                         header: '給与等級_新',                  en: 'Pay Grade',                              ja: '給与等級_新' },
  { key: 'trainingPositionFlag',             header: '業務研修ポジション_新',        en: 'Training Position Flag',                 ja: '業務研修ポジション_新' },
  { key: 'nonUnionAgreementFlag',            header: '非組合協定対象者_新',          en: 'Non-Union Agreement Flag',               ja: '非組合協定対象者_新' },
  { key: 'positionUnionFlag',                header: 'ポジション_労働組合員_新',     en: 'Position Union Flag',                    ja: 'ポジション_労働組合員_新' },
  { key: 'unionFlag',                        header: '労働組合員_新',                en: 'Union Flag',                             ja: '労働組合員_新' },
  { key: 'positionDiscretionaryWorkFlag',    header: 'ポジション_裁量労働対象_新',   en: 'Position Discretionary Work Flag',       ja: 'ポジション_裁量労働対象_新' },
  { key: 'discretionaryWorkFlag',            header: '裁量労働対象_新',              en: 'Discretionary Work Flag',                ja: '裁量労働対象_新' },

  // ── Before state (prev prefix = fields without _新 suffix) ────────────────────────────────────────
  { key: 'prevEmploymentType',               header: '雇用タイプ',                   en: 'Prev Employment Type',                   ja: '雇用タイプ' },
  { key: 'prevConcurrentType',               header: '本務兼務区分',                 en: 'Prev Concurrent Type',                   ja: '本務兼務区分' },
  { key: 'prevConcurrentReason',             header: '兼務理由',                     en: 'Prev Concurrent Reason',                 ja: '兼務理由' },
  { key: 'prevSecondmentFromCompany',        header: '出向元会社',                   en: 'Prev Secondment From Company',           ja: '出向元会社' },
  { key: 'prevSecondmentFromEmployeeNumber', header: '出向元会社社員番号',           en: 'Prev Secondment From Employee Number',   ja: '出向元会社社員番号' },
  { key: 'prevLeaveOfAbsenceSign',                    header: '休職者サイン',                 en: 'Prev Leave of Absence Sign',                        ja: '休職者サイン' },
  { key: 'prevPositionCode',                 header: 'ポジションコード',             en: 'Prev Position Code',                     ja: 'ポジションコード' },
  { key: 'prevDepartmentCode',               header: '組織コード',                   en: 'Prev Department Code',                   ja: '組織コード' },
  { key: 'prevBusinessUnit',                 header: 'ビジネスユニット',             en: 'Prev Business Unit',                     ja: 'ビジネスユニット' },
  { key: 'prevDivision',                     header: '部門',                         en: 'Prev Division',                          ja: '部門' },
  { key: 'prevSubDivision',                  header: '統括部',                       en: 'Prev Sub-Division',                      ja: '統括部' },
  { key: 'prevGroup',                        header: 'グループ',                     en: 'Prev Group',                             ja: 'グループ' },
  { key: 'prevTeam',                         header: 'チーム',                       en: 'Prev Team',                              ja: 'チーム' },
  { key: 'prevOfficialPositionCode',         header: '役職',                         en: 'Prev Official Position Code',            ja: '役職' },
  { key: 'prevLocalJobTitle',                header: 'フリータイトル',               en: 'Prev Local Job Title',                   ja: 'フリータイトル' },
  { key: 'prevSecondmentToCompany',          header: '出向先会社',                   en: 'Prev Secondment To Company',             ja: '出向先会社' },
  { key: 'prevLocation',                     header: '勤務場所',                     en: 'Prev Location',                          ja: '勤務場所' },
  { key: 'prevCostCenter',                   header: 'コストセンター',               en: 'Prev Cost Center',                       ja: 'コストセンター' },
  { key: 'prevManagerPositionCode',          header: '上司ポジションコード',         en: 'Prev Manager Position Code',             ja: '上司ポジションコード' },
  { key: 'prevManagerName',                  header: '上司氏名',                     en: 'Prev Manager Name',                      ja: '上司氏名' },
  { key: 'prevJobFamily',                    header: 'ジョブファミリー',             en: 'Prev Job Family',                        ja: 'ジョブファミリー' },
  { key: 'prevJobType',                      header: 'ジョブタイプ',                 en: 'Prev Job Type',                          ja: 'ジョブタイプ' },
  { key: 'prevPositionBand',                 header: 'ポジション_バンド',            en: 'Prev Position Band',                     ja: 'ポジション_バンド' },
  { key: 'prevBand',                         header: 'バンド',                       en: 'Prev Band',                              ja: 'バンド' },
  { key: 'prevPayGrade',                     header: '給与等級',                     en: 'Prev Pay Grade',                         ja: '給与等級' },
  { key: 'prevTrainingPositionFlag',         header: '業務研修ポジション',           en: 'Prev Training Position Flag',            ja: '業務研修ポジション' },
  { key: 'prevNonUnionAgreementFlag',        header: '非組合協定対象者',             en: 'Prev Non-Union Agreement Flag',          ja: '非組合協定対象者' },
  { key: 'prevPositionUnionFlag',            header: 'ポジション_労働組合員',        en: 'Prev Position Union Flag',               ja: 'ポジション_労働組合員' },
  { key: 'prevUnionFlag',                    header: '労働組合員',                   en: 'Prev Union Flag',                        ja: '労働組合員' },
  { key: 'prevPositionDiscretionaryWorkFlag',header: 'ポジション_裁量労働対象',      en: 'Prev Position Discretionary Work Flag',  ja: 'ポジション_裁量労働対象' },
  { key: 'prevDiscretionaryWorkFlag',        header: '裁量労働対象',                 en: 'Prev Discretionary Work Flag',           ja: '裁量労働対象' },

  // ── Audit ─────────────────────────────────────────────────────────────────────────────────────────
  { key: 'exclusionReason',                  header: '除外理由',                     en: 'Exclusion Reason',                       ja: '除外理由' },
]

export const ALLOCATION_LIST_LABEL_MAP: Record<string, Omit<FieldDef, 'key'>> = Object.fromEntries(
  ALLOCATION_LIST_FIELDS.map(f => [f.key, { header: f.header, en: f.en, ja: f.ja }])
)
