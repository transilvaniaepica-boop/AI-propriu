import { useEffect, useState } from 'react';
import { listModels, apiAuth } from '../lib/openrouter.js';

export default function SettingsPanel({
  apiKey, setApiKey,
  backendUrl, setBackendUrl,
  settings, onTested,
  user, setUser,
}) {
  const [tmpKey, setTmpKey] = useState(apiKey);
  const [tmpUrl, setTmpUrl] = useState(backendUrl);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState(null);

  // --- auth ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authMsg, setAuthMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // --- utilizatori ---
  const [users, setUsers] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newPass, setNewPass] = useState('');

  const backendMode = Boolean(backendUrl?.trim());

  useEffect(() => {
    if (backendMode && user) refreshUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendMode, user]);

  async function refreshUsers() {
    const r = await apiAuth(tmpUrl, '/auth/users');
    if (r.ok) setUsers(r.data.users || []);
  }

  async function doAuth(e) {
    e.preventDefault();
    setBusy(true);
    setAuthMsg(null);
    const path = authMode === 'login' ? '/auth/login' : '/auth/register';
    const r = await apiAuth(tmpUrl, path, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (r.ok) {
      setUser(r.data.email);
      setAuthMsg({ ok: true, text: `Bine ai venit, ${r.data.email}!` });
    } else {
      setAuthMsg({ ok: false, text: r.data?.detail || `Eroare ${r.status}` });
    }
  }

  async function logout() {
    await apiAuth(tmpUrl, '/auth/logout', { method: 'POST' });
    setUser(null);
    setUsers([]);
  }

  async function addUser(e) {
    e.preventDefault();
    const r = await apiAuth(tmpUrl, '/auth/users', {
      method: 'POST',
      body: JSON.stringify({ email: newEmail, password: newPass }),
    });
    if (r.ok) {
      setNewEmail('');
      setNewPass('');
      refreshUsers();
    } else {
      alert(r.data?.detail || `Eroare ${r.status}`);
    }
  }

  function save() {
    setApiKey(tmpKey);
    setBackendUrl(tmpUrl.trim());
    setMsg({ ok: true, text: 'Setări salvate.' });
  }

  async function test() {
    setTesting(true);
    setMsg(null);
    const s = { baseUrl: tmpUrl.trim(), apiKey: tmpKey };
    try {
      const list = await listModels(s);
      const n = Array.isArray(list) ? list.length : 0;
      setMsg({ ok: true, text: `Conexiune OK — ${n} modele disponibile${s.baseUrl ? ' (prin backend)' : ' (direct)'}.` });
      onTested?.();
    } catch (e) {
      setMsg({ ok: false, text: `Eroare: ${e.message}` });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="panel">
      <h2>Setări</h2>

      <h3>Modul de conectare</h3>
      <p className="hint">
        Fără <b>Backend URL</b>: aplicația vorbește direct cu OpenRouter, cheia stă în browser (doar demo personal).
        Cu <b>Backend URL</b>: cererile trec prin serverul tău, cheia nu pleacă de acolo, iar accesul e controlat
        prin conturi de utilizator.
      </p>

      <label>Backend URL (opțional, ex. https://agent-studio-xyz.onrender.com)</label>
      <input type="text" placeholder="https://..." value={tmpUrl} onChange={(e) => setTmpUrl(e.target.value)} />

      <label>Cheie API OpenRouter (doar dacă NU folosești backend)</label>
      <input type="password" placeholder="sk-or-v1-..." value={tmpKey} onChange={(e) => setTmpKey(e.target.value)} />
      <p className="hint">
        Cheia o obții de pe <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>.
        Se salvează doar în localStorage-ul browserului.
      </p>

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={save}>Salvează setările</button>
        <button className="btn ghost" onClick={test} disabled={testing}>
          {testing ? 'Testez…' : 'Testează conexiunea'}
        </button>
      </div>

      {msg && (
        <p className="hint" style={{ color: msg.ok ? 'var(--ok)' : 'var(--err)', marginTop: 12 }}>
          {msg.text}
        </p>
      )}

      {backendMode && (
        <>
          <h3 style={{ marginTop: 32 }}>Cont utilizator</h3>
          {!user ? (
            <form onSubmit={doAuth} className="card">
              <label>Email</label>
              <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <label>Parolă</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn" type="submit" disabled={busy}>
                  {authMode === 'login' ? 'Autentificare' : 'Cont nou'}
                </button>
                <button type="button" className="btn ghost" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
                  {authMode === 'login' ? 'Vreau cont nou' : 'Am deja cont'}
                </button>
              </div>
              {authMsg && (
                <p className="hint" style={{ color: authMsg.ok ? 'var(--ok)' : 'var(--err)', marginTop: 10 }}>
                  {authMsg.text}
                </p>
              )}
              <p className="hint" style={{ marginTop: 8 }}>
                „Cont nou” funcționează doar pentru primul cont (devine admin). Apoi, conturile se cresc de aici, după login.
              </p>
            </form>
          ) : (
            <div className="card">
              <div className="row-between">
                <div>Autentificat ca <b>{user}</b></div>
                <button className="btn ghost small" onClick={logout}>Delogare</button>
              </div>

              <h4 style={{ margin: '14px 0 6px' }}>Utilizatori</h4>
              <div className="hint">
                {users.length ? users.map((u) => <span className="badge" key={u}>{u}</span>) : 'încarc…'}
              </div>

              <form onSubmit={addUser} className="row" style={{ marginTop: 12 }}>
                <input type="text" placeholder="email@nou" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
                <input type="password" placeholder="parolă (min 6)" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={6} />
                <button className="btn small" type="submit">Adaugă utilizator</button>
              </form>
            </div>
          )}
        </>
      )}

      <h3 style={{ marginTop: 28 }}>Cum funcționează</h3>
      <p className="hint">
        Aplicația vorbește cu <code>https://openrouter.ai/api/v1/chat/completions</code> — direct din browser
        (cheia ta, demo personal) sau prin backend-ul tău FastAPI (cheia pe server, conturi de utilizator, streaming SSE passthrough).
        Când modelul cere un tool, aplicația îl execută local și întoarce rezultatul în istoric — bucla continuă automat
        până la răspunsul final.
      </p>
    </div>
  );
}
