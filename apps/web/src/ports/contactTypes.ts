export type RequestType = 'employee_id' | 'position_code' | 'band_grade' | 'other'

export type ContactStatus = 'draft' | 'sent' | 'answered' | 'applied'

/** 回答者が確定した対象行の識別子。回答時にセットされる */
export type ContactAnchor =
  | { kind: 'person';   groupEmployeeId: string; userId: string;  fieldValueAtAnchor?: string }
  | { kind: 'position'; positionCode: string;                     fieldValueAtAnchor?: string }

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  draft:    '下書き',
  sent:     '依頼中',
  answered: '回答済',
  applied:  '適用済',
}

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  employee_id:   '社員IDを教えてください',
  position_code: 'ポジションコードを教えてください',
  band_grade:    'バンド・グレードを教えてください',
  other:         'その他',
}

export interface ContactMessageData {
  answeredValue?: string  // '__unknown__' = 回答者も不明
  fieldKey?: string       // AllocationRow のフィールドキー
  requestType?: RequestType
}

export interface ContactMessage {
  id: string
  createdAt: string
  authorEmail: string
  authorName?: string
  type: 'request' | 'answer' | 'followup' | 'unknown'
  summary: string
  data?: ContactMessageData
}

export interface ContactRecord {
  id: string
  status: ContactStatus
  createdAt: string

  // 依頼者
  requesterEmail: string
  requesterName?: string

  // 宛先（組織ベース）
  targetOrgId: string
  targetOrgName: string
  assigneeHint?: string

  // 照会対象（セッション内参照。TSV 往復後は -1 になる）
  anchorRowId: number
  personName: string
  fieldKey: string
  requestType: RequestType

  // 起票時フィルタヒント（受信者が自分に関連するか判断するため）
  beforeOrgCodeHint?: string  // Before組織の externalCode

  // 回答者が確定した行の識別子（回答時に設定）
  anchor?: ContactAnchor

  // チャットスレッド（時系列。thread[0] が依頼本文）
  thread: ContactMessage[]

  // 適用値（複数回答から依頼者が選んで行に反映する）
  resolvedValue?: string

  // ローカル状態（TSV に含めない）
  archived: boolean
}

export interface SyncResult {
  added: number
  updated: number
  conflicts: ContactRecord[]  // スレッド分岐が検出されたもの
}

export interface CreateContactParams {
  targetOrgId: string
  targetOrgName: string
  assigneeHint?: string
  anchorRowId: number
  personName: string
  fieldKey: string
  requestType: RequestType
  requestSummary: string
  beforeOrgCodeHint?: string
  memo?: string
}
