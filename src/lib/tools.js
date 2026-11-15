// Registry de tool-uri locale. Fiecare tool are:
//  - schema: format JSON Schema compatibil OpenAI (trimis catre model)
//  - handler: functia JS executata local cand modelul o apeleaza

const isSafeExpr = (expr) =>
  typeof expr === 'string' &&
  expr.length <= 200 &&
  /^[0-9+\-*/%().\s^,a-zA-Z]+$/.test(expr);

const ALLOWED_WORDS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'abs', 'pow',
  'round', 'floor', 'ceil', 'log', 'log2', 'log10', 'exp', 'min', 'max',
  'pi', 'e', 'PI', 'E', 'Math',
]);

function safeEval(expr) {
  const cleaned = expr.replace(/\^/g, '**');
  const tokens = cleaned.match(/[a-zA-Z_]+|\d+\.?\d*|./g) || [];
  for (const t of tokens) {
    if (/[a-zA-Z_]/.test(t) && !ALLOWED_WORDS.has(t)) {
      throw new Error('Caractere nepermise în expresie');
    }
  }
  const val = Function(
    `"use strict";
     const { sin, cos, tan, asin, acos, atan, sqrt, abs, pow, round, floor, ceil, log, log2, log10, exp, min, max, PI, E } = Math;
     return (${cleaned});`,
  )();
  if (typeof val !== 'number' || !Number.isFinite(val)) throw new Error('Rezultat invalid');
  return val;
}

async function searchWikipedia({ query, limit = 5 }) {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&list=search` +
    `&srsearch=${encodeURIComponent(query)}&srlimit=${Math.min(limit, 10)}&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikipedia: HTTP ${res.status}`);
  const data = await res.json();
  return (data.query?.search ?? []).map((r) => ({
    title: r.title,
    snippet: r.snippet.replace(/<[^>]+>/g, ''),
  }));
}

async function fetchUrl({ url, maxChars = 2000 }) {
  if (!/^https?:\/\//i.test(url)) throw new Error('URL-ul trebuie sa inceapa cu http(s)://');
  let text = null;
  try {
    const res = await fetch(url);
    text = await res.text();
  } catch {
    // multe site-uri blocheaza CORS din browser; incercam un proxy public
    const proxied = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
    text = await proxied.text();
  }
  const clean = text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.slice(0, maxChars);
}

export const TOOLS = {
  calculator: {
    schema: {
      type: 'function',
      function: {
        name: 'calculator',
        description: 'Calculeaza o expresie matematica. Ex: (2+3)*4, sqrt(16), 2^10',
        parameters: {
          type: 'object',
          properties: { expression: { type: 'string', description: 'Expresia de calculat' } },
          required: ['expression'],
        },
      },
    },
    handler: async ({ expression }) => safeEval(expression),
  },
  current_datetime: {
    schema: {
      type: 'function',
      function: {
        name: 'current_datetime',
        description: 'Intoarce data si ora curenta (locala) sub forma de text.',
        parameters: { type: 'object', properties: {} },
      },
    },
    handler: async () => new Date().toString(),
  },
  search_wikipedia: {
    schema: {
      type: 'function',
      function: {
        name: 'search_wikipedia',
        description: 'Cauta in Wikipedia (en) dupa un termen si intoarce titluri + fragmente.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Termenul de cautat' },
            limit: { type: 'number', description: 'Numar maxim de rezultate (implicit 5)' },
          },
          required: ['query'],
        },
      },
    },
    handler: searchWikipedia,
  },
  fetch_url: {
    schema: {
      type: 'function',
      function: {
        name: 'fetch_url',
        description: 'Descarca textul unei pagini web (fara scripturi/stiluri) si il trunchiaza.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL-ul paginii' },
            maxChars: { type: 'number', description: 'Lungime maxima a raspunsului (implicit 2000)' },
          },
          required: ['url'],
        },
      },
    },
    handler: fetchUrl,
  },
};

export const TOOL_NAMES = Object.keys(TOOLS);

export function schemasFor(names) {
  return names.map((n) => TOOLS[n]?.schema).filter(Boolean);
}

export async function executeTool(name, args) {
  const tool = TOOLS[name];
  if (!tool) return JSON.stringify({ error: `Tool necunoscut: ${name}` });
  try {
    const out = await tool.handler(args ?? {});
    return typeof out === 'string' ? out : JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ error: String(e?.message || e) });
  }
}
