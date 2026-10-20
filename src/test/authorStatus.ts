/** Offline gateway fixture. Production model choices come from Leviathan's catalog. */
export const authorStatus = (configured = false) => ({ providers: [
  { id: 'openai', label: 'OpenAI', configured, credentialVariable: 'OPENAI_API_KEY', models: [
    { id: 'gpt-6-astra', label: 'GPT-6 Astra' }, { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }, { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
  ] },
  { id: 'anthropic', label: 'Claude', configured, credentialVariable: 'ANTHROPIC_API_KEY', models: [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' }, { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' }, { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  ] },
  { id: 'gemini', label: 'Gemini', configured, credentialVariable: 'GEMINI_API_KEY', models: [
    { id: 'gemini-4-argon', label: 'Gemini 4 Argon' }, { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  ] },
] });
