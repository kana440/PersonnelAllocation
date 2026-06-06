/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the OpenAI-compatible API.
  // Embed {model} where the model name should appear in the path.
  // Example: https://your-llm.example.com/v1/{model}
  // If omitted, the app runs in mock mode.
  readonly VITE_AI_BASE_URL?: string

  // Bearer token for the Authorization header.
  readonly VITE_AI_API_KEY?: string

  // Comma-separated initial list of selectable models.
  // Example: gpt-4o,gpt-4o-mini,custom-model-v2
  readonly VITE_AI_MODELS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
