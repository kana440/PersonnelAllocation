/** 1件の警告確認記録 */
export interface WarningAcknowledgment {
  warningKey:     string  // `${rowId}:${issueMessage}`
  reason?:        string  // 将来: 確認理由テキスト
  acknowledgedAt: string  // ISO 8601
}

/**
 * 確認済みストアのポート。
 * 今は InMemory（セッション内のみ）、将来は STEP2 DB 実装に差し替える。
 */
export interface IAcknowledgmentStore {
  acknowledge(key: string, reason?: string): void
  unacknowledge(key: string): void
  isAcknowledged(key: string): boolean
  getAll(): WarningAcknowledgment[]
  clear(): void
}

/** `${rowId}:${issueMessage}` 形式のキーを生成するヘルパー */
export function makeWarningKey(rowId: number, issueMessage: string): string {
  return `${rowId}:${issueMessage}`
}
