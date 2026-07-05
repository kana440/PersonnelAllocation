import type { IdentityPort } from '../../ports/IdentityPort'

const KEY = 'personnel-identity'

interface Stored {
  email: string
  displayName?: string
}

export class LocalIdentityStore implements IdentityPort {
  getMyEmail(): string | null {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return null
      return (JSON.parse(raw) as Stored).email || null
    } catch { return null }
  }

  getMyDisplayName(): string | null {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return null
      return (JSON.parse(raw) as Stored).displayName ?? null
    } catch { return null }
  }

  save(email: string, displayName?: string): void {
    const stored: Stored = { email, displayName }
    localStorage.setItem(KEY, JSON.stringify(stored))
  }

  clear(): void {
    localStorage.removeItem(KEY)
  }
}
