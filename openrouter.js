// Client OpenRouter care poate lucra în două moduri:
//  - direct:  cheia e în browser (demo personal) → https://openrouter.ai/api/v1
//  - backend: cheia e pe server → cererile merg la URL-ul backend-ului tau,
//             autentificarea făcându-se automat prin cookie-ul de sesiune
//
// settings = { baseUrl, apiKey }
//   baseUrl  — lipsă sau '' = direct; altceva = backend (ex. https://agent-studio-xyz.onrender.com)
//   apiKey   — cheia OpenRouter (doar în modul direct)

const DIRECT_BASE = 'https://openrouter.ai/api/v1';
const TOKEN_KEY = 'ors.sessionToken';

// token-ul de sesiune (autentificare prin header, nu doar cookie —
// funcționează și în Safari, care blochează cookie-urile cross-site)
export function getSessionToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}
export function setSessionToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}
export function clearSessionToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function resolveBase(settings = {}) {
  return settings.baseUrl?.trim() ? settings.baseUrl.replace(/\/$/, '') : DIRECT_BASE;
}

export function isBackendMode(settings = {}) {
  return Boolean(settings.baseUrl?.trim());
}

function headersFor(settings, { withKey }) {
  const h = { 'Content-Type': 'application/json' };
  if (withKey && settings.apiKey) h.Authorization = `Bearer ${settings.apiKey}`;
  if (isBackendMode(settings) && getSessionToken()) h.Authorization = `Bearer ${getSessionToken()}`;
  return h;
}

export async function listModels(settings) {
  const base = resolveBase(settings);
  const res = await fetch(`${base}/models`, {
    headers: headersFor(settings, { withKey: !isBackendMode(settings) }),
    credentials: isBackendMode(settings) ? 'include' : 'omit',
  });
  if (!res.ok) throw new Error(`listModels: HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.data ?? [];
}

function extractError(text) {
  try {
    const j = JSON.parse(text);
    return j?.error?.message || text;
  } catch {
    return text;
  }
}

/**
 * Cerere chat cu streaming (SSE).
 * Intoarce mesajul assistant complet (content + tool_calls acumulate).
 */
export async function streamChat({
  settings = {},
  model,
  messages,
  tools,
  temperature = 0.7,
  maxTokens,
  signal,
  onDelta,
  onToolCallDelta,
}) {
  const base = resolveBase(settings);
  const backend = isBackendMode(settings);
  const body = { model, messages, temperature, stream: true };
  if (tools?.length) body.tools = tools;
  if (maxTokens) body.max_tokens = maxTokens;

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      ...headersFor(settings, { withKey: !backend }),
      // doar in modul direct, OpenRouter le foloseste pentru atribuire
      ...(backend ? {} : { 'HTTP-Referer': window.location.href, 'X-Title': 'Agent Studio' }),
    },
    body: JSON.stringify(body),
    signal,
    credentials: backend ? 'include' : 'omit',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractError(text) || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const assistant = { role: 'assistant', content: '', tool_calls: [] };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let j;
      try {
        j = JSON.parse(payload);
      } catch {
        continue;
      }
      const choice = j.choices?.[0];
      if (!choice) continue;

      if (choice.delta?.content) {
        assistant.content += choice.delta.content;
        onDelta?.(choice.delta.content);
      }

      if (choice.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const i = tc.index ?? 0;
          if (!assistant.tool_calls[i]) {
            assistant.tool_calls[i] = {
              id: tc.id || `call_${i}`,
              type: 'function',
              function: { name: '', arguments: '' },
            };
          }
          if (tc.id) assistant.tool_calls[i].id = tc.id;
          if (tc.function?.name) assistant.tool_calls[i].function.name += tc.function.name;
          if (tc.function?.arguments) assistant.tool_calls[i].function.arguments += tc.function.arguments;
          onToolCallDelta?.(assistant.tool_calls[i]);
        }
      }
    }
  }

  assistant.tool_calls = assistant.tool_calls.filter((c) => c.function.name);
  return assistant;
}

// ---------- helpers pentru auth (doar modul backend) ----------

export async function apiAuth(baseUrl, path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (getSessionToken()) headers.Authorization = `Bearer ${getSessionToken()}`;
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...headers, ...(options.headers || {}) },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* raspuns fara body */
  }
  return { ok: res.ok, status: res.status, data };
}
