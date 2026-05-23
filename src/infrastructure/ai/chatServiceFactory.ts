// Chat service factory — wires up the correct backend based on env vars.
//
// Mock mode  : VITE_AI_BASE_URL is not set → MockApiService
// Real mode  : VITE_AI_BASE_URL is set     → OpenAICompatibleAdapter
//
// The {model} placeholder in VITE_AI_BASE_URL is replaced with the selected
// model name at the time createAdapter() is called.  This means a new adapter
// instance is created whenever the user changes the model in the UI.

import { MockApiService }           from './mockApiService'
import { OpenAICompatibleAdapter }  from './openAICompatibleAdapter'
import { AgentRunner }              from './agentRunner'

const RAW_BASE_URL   = import.meta.env.VITE_AI_BASE_URL
const API_KEY        = import.meta.env.VITE_AI_API_KEY        ?? ''
const API_KEY_SCHEME = import.meta.env.VITE_AI_API_KEY_SCHEME === 'api-key' ? 'api-key' as const : 'bearer' as const
const OMIT_MODEL     = import.meta.env.VITE_AI_OMIT_MODEL === 'true'
const RAW_MODELS     = import.meta.env.VITE_AI_MODELS

// ── Public constants ──────────────────────────────────────────────────────────

export const IS_MOCK_MODE = !RAW_BASE_URL

// Initial list of selectable models (editable at runtime in the UI)
export const DEFAULT_MODELS: string[] = RAW_MODELS
  ? RAW_MODELS.split(',').map(m => m.trim()).filter(Boolean)
  : ['default-model']

// ── Factory functions ─────────────────────────────────────────────────────────

/**
 * Create an adapter for the given model.
 * Returns null when running in mock mode (VITE_AI_BASE_URL not set).
 */
export function createAdapter(model: string): OpenAICompatibleAdapter | null {
  if (!RAW_BASE_URL) return null
  const baseUrl = RAW_BASE_URL.replace('{model}', encodeURIComponent(model))
  return new OpenAICompatibleAdapter({ baseUrl, model, apiKey: API_KEY, apiKeyScheme: API_KEY_SCHEME, omitModel: OMIT_MODEL })
}

/**
 * Create an AgentRunner for the given model.
 * Returns null when running in mock mode.
 */
export function createAgentRunner(model: string): AgentRunner | null {
  const adapter = createAdapter(model)
  return adapter ? new AgentRunner(adapter) : null
}

/** Singleton mock service used as the fallback for text-only queries. */
export const mockApiService = new MockApiService()
