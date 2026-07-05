import type { IdentityPort } from '../ports/IdentityPort'
import type { ContactSourcePort } from '../ports/ContactSourcePort'
import type { ContactStorePort } from '../ports/ContactStorePort'
import type {
  ContactRecord, ContactMessage, ContactStatus,
  CreateContactParams, SyncResult, ContactAnchor,
} from '../ports/contactTypes'

export type SubmitResult =
  | { status: 'ok';       record:    ContactRecord }
  | { status: 'conflict'; refreshed: ContactRecord }

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
}

function now(): string {
  return new Date().toISOString()
}

function statusRank(s: ContactStatus): number {
  return { draft: 0, sent: 1, answered: 2, applied: 3 }[s]
}

export class ContactService {
  constructor(
    private identity: IdentityPort,
    private store: ContactStorePort,
    private source: ContactSourcePort | null,
  ) {}

  // ── 起票 ────────────────────────────────────────────────────

  async create(params: CreateContactParams): Promise<ContactRecord> {
    const email = this.identity.getMyEmail()
    if (!email) throw new Error('メールアドレスが設定されていません（設定画面を確認してください）')

    const msgId = generateId()
    const record: ContactRecord = {
      id:             `CON-${generateId()}`,
      status:         'draft',
      createdAt:      now(),
      requesterEmail: email,
      requesterName:  this.identity.getMyDisplayName() ?? undefined,
      targetOrgId:    params.targetOrgId,
      targetOrgName:  params.targetOrgName,
      assigneeHint:   params.assigneeHint,
      anchorRowId:    params.anchorRowId,
      personName:     params.personName,
      fieldKey:       params.fieldKey,
      requestType:    params.requestType,
      thread: [{
        id:          msgId,
        createdAt:   now(),
        authorEmail: email,
        authorName:  this.identity.getMyDisplayName() ?? undefined,
        type:        'request',
        summary:     params.requestSummary,
        data: {
          fieldKey:    params.fieldKey,
          requestType: params.requestType,
        },
      }],
      archived: false,
    }

    await this.store.upsert(record)
    // 書き込み可能なら Excel にも即時追記
    if (this.source?.isWritable()) {
      await this.source.writeRecord(record).catch(console.error)
    }
    return record
  }

  // ── スレッドにメッセージを追加（ローカルのみ・後方互換）──────

  async addMessage(
    id: string,
    msg: Omit<ContactMessage, 'id' | 'createdAt' | 'authorEmail' | 'authorName'>
  ): Promise<ContactRecord> {
    const result = await this.submitMessage(id, msg)
    // conflict の場合でもローカル更新は済んでいるので refreshed を返す
    return result.status === 'ok' ? result.record : result.refreshed
  }

  // ── 送信前競合チェック付き addMessage ───────────────────────

  async submitMessage(
    id: string,
    msg: Omit<ContactMessage, 'id' | 'createdAt' | 'authorEmail' | 'authorName'>
  ): Promise<SubmitResult> {
    const email = this.identity.getMyEmail()
    if (!email) throw new Error('メールアドレスが設定されていません')

    const records = await this.store.load()
    const record  = records.find(r => r.id === id)
    if (!record) throw new Error(`連絡票が見つかりません: ${id}`)

    // ── Excel から最新を取得して競合チェック ──
    if (this.source?.isWritable()) {
      const sourceRecord = await this.source.readOne(id)
      if (sourceRecord && sourceRecord.thread.length > record.thread.length) {
        // Excel 側が進んでいる → ローカルを更新してコンフリクトを返す
        const merged: ContactRecord = { ...sourceRecord, archived: record.archived }
        await this.store.upsert(merged)
        return { status: 'conflict', refreshed: merged }
      }
    }

    // ── 競合なし：メッセージを追加してローカル + Excel に書き込む ──
    const newMsg: ContactMessage = {
      id:          generateId(),
      createdAt:   now(),
      authorEmail: email,
      authorName:  this.identity.getMyDisplayName() ?? undefined,
      ...msg,
    }

    const nextStatus: ContactStatus =
      msg.type === 'answer' || msg.type === 'unknown' ? 'answered' : record.status

    const updated: ContactRecord = {
      ...record,
      status: nextStatus,
      thread: [...record.thread, newMsg],
    }

    await this.store.upsert(updated)

    if (this.source?.isWritable()) {
      await this.source.writeRecord(updated).catch(console.error)
    }

    return { status: 'ok', record: updated }
  }

  // ── ステータス変更 ───────────────────────────────────────────

  async markSent(id: string): Promise<ContactRecord> {
    return this.setStatus(id, 'sent')
  }

  async setAnchor(id: string, anchor: ContactAnchor): Promise<ContactRecord> {
    const records = await this.store.load()
    const record  = records.find(r => r.id === id)
    if (!record) throw new Error(`連絡票が見つかりません: ${id}`)
    const updated: ContactRecord = { ...record, anchor }
    await this.store.upsert(updated)
    if (this.source?.isWritable()) {
      await this.source.writeRecord(updated).catch(console.error)
    }
    return updated
  }

  async resolve(id: string, value: string): Promise<ContactRecord> {
    const records = await this.store.load()
    const record  = records.find(r => r.id === id)
    if (!record) throw new Error(`連絡票が見つかりません: ${id}`)
    const updated: ContactRecord = { ...record, resolvedValue: value, status: 'applied' }
    await this.store.upsert(updated)
    return updated
  }

  async archive(id: string): Promise<void> {
    const records = await this.store.load()
    const record  = records.find(r => r.id === id)
    if (!record) return
    await this.store.upsert({ ...record, archived: true })
  }

  // ── クエリ ───────────────────────────────────────────────────

  async getAll(): Promise<ContactRecord[]> {
    return this.store.load()
  }

  async getActive(): Promise<ContactRecord[]> {
    const all = await this.store.load()
    return all.filter(r => !r.archived)
  }

  async getMySent(): Promise<ContactRecord[]> {
    const email = this.identity.getMyEmail()
    if (!email) return []
    const all = await this.store.load()
    return all.filter(r => !r.archived && r.requesterEmail === email)
  }

  async getMyPending(): Promise<ContactRecord[]> {
    const email = this.identity.getMyEmail()
    if (!email) return []
    const all = await this.store.load()
    // 自分が関与した送信済み・未回答の連絡票（回答者として処理が必要なもの）
    return all.filter(r =>
      !r.archived &&
      r.status === 'sent' &&
      r.requesterEmail !== email
    )
  }

  // ── Excel 同期（STEP1 のみ）──────────────────────────────────

  async syncFromSource(): Promise<SyncResult> {
    if (!this.source?.isAvailable()) {
      return { added: 0, updated: 0, conflicts: [] }
    }

    const [sourceRecords, storedRecords] = await Promise.all([
      this.source.readAll(),
      this.store.load(),
    ])

    const storedById = new Map(storedRecords.map(r => [r.id, r]))
    const result: SyncResult = { added: 0, updated: 0, conflicts: [] }

    for (const src of sourceRecords) {
      const stored = storedById.get(src.id)
      if (!stored) {
        await this.store.upsert(src)
        result.added++
        continue
      }

      const srcRank    = statusRank(src.status)
      const storedRank = statusRank(stored.status)

      if (stored.thread.length > src.thread.length && storedRank >= srcRank) {
        // ローカルで回答追加済み → 分岐の可能性
        if (src.thread.length !== stored.thread.length) {
          result.conflicts.push(src)
        }
      } else if (srcRank > storedRank || src.thread.length > stored.thread.length) {
        // ソースが新しい → 更新（ただし archived フラグはローカルを維持）
        await this.store.upsert({ ...src, archived: stored.archived })
        result.updated++
      }
    }

    return result
  }

  // ── 内部 ─────────────────────────────────────────────────────

  private async setStatus(id: string, status: ContactStatus): Promise<ContactRecord> {
    const records = await this.store.load()
    const record  = records.find(r => r.id === id)
    if (!record) throw new Error(`連絡票が見つかりません: ${id}`)
    const updated = { ...record, status }
    await this.store.upsert(updated)
    return updated
  }
}
