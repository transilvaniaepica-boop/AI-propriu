// Lista de rezerva, folosita pana reuseste fetch-ul la /models (sau fara cheie).
export const DEFAULT_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-3.5-sonnet',
  'google/gemini-2.5-flash',
  'deepseek/deepseek-chat-v3.1',
  'qwen/qwen3-235b-a22b',
  'meta-llama/llama-3.3-70b-instruct',
].map((id) => ({ id, name: id }));

export async function loadModels(settings) {
  if (!settings.apiKey && !settings.baseUrl) return DEFAULT_MODELS;
  try {
    const { listModels } = await import('./openrouter.js');
    const list = await listModels(settings);
    if (!Array.isArray(list) || !list.length) return DEFAULT_MODELS;
    return list
      .map((m) => ({ id: m.id, name: m.name || m.id, context: m.context_length }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return DEFAULT_MODELS;
  }
}
