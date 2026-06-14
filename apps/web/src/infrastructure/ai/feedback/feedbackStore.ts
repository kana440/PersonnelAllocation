import type { CorrectionCapture, ClassifiedCorrection, AiAppliedRule, AiCodeFixRequest } from './types'

// Module-level session ID (per page load, persists across tabs in same session)
export const CURRENT_SESSION_ID = `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const LS_KEYS = {
  corrections:  'ai_feedback:corrections',
  classified:   'ai_feedback:classified',
  codeFixes:    'ai_feedback:codefixes',
  appliedRules: 'ai_feedback:applied',
}

const MAX_CAPTURES = 100

function readJSON<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T[] : []
  } catch {
    return []
  }
}

function writeJSON<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // localStorage quota exceeded — silently skip
  }
}

export const feedbackStore = {
  // ── Correction captures ───────────────────────────────────────────────────────

  saveCapture(c: CorrectionCapture): void {
    const list = readJSON<CorrectionCapture>(LS_KEYS.corrections)
    list.push(c)
    writeJSON(LS_KEYS.corrections, list.length > MAX_CAPTURES ? list.slice(-MAX_CAPTURES) : list)
  },

  getCaptures(): CorrectionCapture[] {
    return readJSON<CorrectionCapture>(LS_KEYS.corrections)
  },

  // ── Classified corrections ────────────────────────────────────────────────────

  saveClassified(c: ClassifiedCorrection): void {
    const list = readJSON<ClassifiedCorrection>(LS_KEYS.classified)
    const idx = list.findIndex(x => x.id === c.id)
    if (idx >= 0) list[idx] = c
    else list.push(c)
    writeJSON(LS_KEYS.classified, list)
  },

  getClassified(): ClassifiedCorrection[] {
    return readJSON<ClassifiedCorrection>(LS_KEYS.classified)
  },

  // ── Applied rules (tool descriptions + learned business rules) ────────────────

  saveAppliedRule(r: AiAppliedRule): void {
    const list = readJSON<AiAppliedRule>(LS_KEYS.appliedRules)
    const idx = list.findIndex(x => x.id === r.id)
    if (idx >= 0) list[idx] = r
    else list.push(r)
    writeJSON(LS_KEYS.appliedRules, list)
  },

  getAppliedRules(): AiAppliedRule[] {
    return readJSON<AiAppliedRule>(LS_KEYS.appliedRules)
  },

  // ── Code fix requests ─────────────────────────────────────────────────────────

  saveCodeFix(f: AiCodeFixRequest): void {
    const list = readJSON<AiCodeFixRequest>(LS_KEYS.codeFixes)
    list.push(f)
    writeJSON(LS_KEYS.codeFixes, list)
  },

  getCodeFixes(): AiCodeFixRequest[] {
    return readJSON<AiCodeFixRequest>(LS_KEYS.codeFixes)
  },

  // ── Stats ─────────────────────────────────────────────────────────────────────

  getStats() {
    const applied   = this.getAppliedRules().filter(r => r.isActive)
    const pending   = this.getClassified().filter(c => c.status === 'pending')
    const codeFixes = this.getCodeFixes().filter(f => f.status === 'pending')
    return {
      captureCount:         this.getCaptures().length,
      toolDescriptionCount: applied.filter(r => r.kind === 'tool_description').length,
      learnedRuleCount:     applied.filter(r => r.kind === 'learned_rule').length,
      skillCount:           applied.filter(r => r.kind === 'skill').length,
      pendingCount:         pending.length,
      codeFixCount:         codeFixes.length,
    }
  },

  getAiSkillSlugs(): string[] {
    return this.getAppliedRules()
      .filter(r => r.kind === 'skill' && r.isActive)
      .map(r => r.targetKey)
  },

  // ── Clear / reset ─────────────────────────────────────────────────────────────

  clearHistory(): void {
    localStorage.removeItem(LS_KEYS.corrections)
    localStorage.removeItem(LS_KEYS.classified)
  },

  resetAll(): void {
    Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k))
  },
}
