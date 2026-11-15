# Agent Studio (OpenRouter)

Interfață web (React + Vite) pentru a **crea și folosi agenți AI** care vorbesc cu
[OpenRouter](https://openrouter.ai) (`https://openrouter.ai/api/v1`) și pot **apela tool-uri**
(buclă tool-calling clasică, cu streaming SSE).

## Ce face

- **Chat** cu orice model de pe OpenRouter, cu streaming de tokeni.
- **Tool-calling**: modelul decide singur când apelează instrumentele; aplicația execută local
  și returnează rezultatul în istoric (buclă automată, max 8 pași).
- Tool-uri incluse: `calculator`, `current_datetime`, `search_wikipedia`, `fetch_url`.
- **Agenti configurabili**: nume, system prompt, model, temperatură, tool-uri activate.
- Setări persistă în `localStorage` (cheia API rămâne în browserul tău).

## Rulezi local

```bash
npm install
npm run dev        # http://localhost:5173
```

Deschide **Setări**, lipește cheia ta de la https://openrouter.ai/keys și testează conexiunea.

## Publicare

### Varianta A — GitHub Pages

```bash
git init
git add .
git commit -m "init"
gh repo create agent-studio --public --source=. --remote=origin
npm run deploy:gh   # build + push pe branch-ul gh-pages
```

Apoi în repo → Settings → Pages → Source: **Deploy from a branch** → `gh-pages` / `/ (root)`.

### Varianta B — Vercel (recomandat, zero config)

```bash
npm i -g vercel
vercel --prod        # sau: importă repo-ul în dashboard.vercel.com
```

## Backend (cheia API pe server + utilizatori)

Ca să nu expui cheia OpenRouter în browser și ca mai mulți oameni să poată folosi aplicația, ai un
backend FastAPI în `backend/` cu autentificare încorporată:

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env        # completează OPENROUTER_API_KEY și ALLOWED_ORIGINS
uvicorn main:app --reload   # http://127.0.0.1:8000  →  /health
```

Apoi în aplicație, la **Setări**:
- **Backend URL** = `http://127.0.0.1:8000` (sau URL-ul deploy-ului)
- Cheia OpenRouter din browser rămâne goală

Cum funcționează autentificarea:
- `POST /auth/register` — funcționează DOAR cât timp nu există niciun cont; primul cont devine admin
- `POST /auth/login` / `POST /auth/logout` / `GET /auth/me` — sesiune prin cookie httpOnly (7 zile)
- `POST /auth/users` + `GET /auth/users` — orice utilizator autentificat poate crea/lista conturi
- Parolele sunt hash-uite cu PBKDF2 (stdlib), stocate în SQLite (`users.db`)
- `GET /models` și `POST /v1/chat/completions` cer sesiune validă; streaming SSE passthrough

Reguli importante:
- `ALLOWED_ORIGINS` trebuie să listeze originile explicit (fără `*`) — cookie-urile nu merg cu wildcard
- Cookie-ul de sesiune e mereu `Secure` + `SameSite=None`, deci funcționează când frontend și backend sunt pe domenii diferite (ambele trebuie HTTPS)

Deploy pe Render (gratuit, cu câteva limitări):
1. New → Web Service, conectează repo-ul, start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
2. Environment: `OPENROUTER_API_KEY`, `ALLOWED_ORIGINS=https://numele-tau.github.io`, `COOKIE_SECURE=1`
3. Copiază URL-ul serviciului în Setări → Backend URL din aplicație

## Securitate

- Mod direct (fără backend): cheia stă în `localStorage` — OK doar pentru demo personal.
- Cu backend: cheia e doar pe server; accesul e controlat prin conturi (email + parolă, cookie httpOnly).
- **Nu** comite `.env` cu chei. `users.db` e în `.gitignore`.

## Adaugi tool-uri noi

Editează `src/lib/tools.js`:

```js
export const TOOLS = {
  ...,
  my_tool: {
    schema: {
      type: 'function',
      function: {
        name: 'my_tool',
        description: 'Ce face tool-ul',
        parameters: { type: 'object', properties: { ... }, required: [...] },
      },
    },
    handler: async (args) => { /* ... */ return 'rezultat'; },
  },
};
```

Apoi bifează tool-ul în editorul de agenți.

## Structură

```
src/
  lib/openrouter.js   # client API + streaming SSE
  lib/tools.js        # registry de tool-uri (schema + handler)
  lib/agentLoop.js    # bucla tool-calling (multi-step)
  lib/models.js       # lista de modele (+ fallback)
  components/         # Chat, AgentsPanel, SettingsPanel, Markdown
  App.jsx             # state global + sidebar
```
