import { useMemo, useState } from 'react';
import { TOOL_NAMES } from '../lib/tools.js';
import { DEFAULT_MODELS } from '../lib/models.js';

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export const DEFAULT_AGENT = {
  id: '',
  name: 'Agent nou',
  system: 'Ești un asistent util care folosește instrumentele puse la dispoziție când este cazul.',
  model: 'openai/gpt-oss-120b',
  temperature: 0.7,
  tools: ['calculator', 'current_datetime'],
};

export default function AgentsPanel({ agents, setAgents, activeId, onSelect, models }) {
  const [editing, setEditing] = useState(null); // agent in curs de editare (sau 'new')
  const [form, setForm] = useState(DEFAULT_AGENT);

  const modelOptions = useMemo(() => {
    const ids = models?.length ? models.map((m) => m.id) : DEFAULT_MODELS.map((m) => m.id);
    if (form.model && !ids.includes(form.model)) ids.unshift(form.model);
    return ids;
  }, [models, form.model]);

  function startNew() {
    setForm({ ...DEFAULT_AGENT, id: uid() });
    setEditing('new');
  }

  function startEdit(a) {
    setForm({ ...a, tools: [...a.tools] });
    setEditing(a.id);
  }

  function save() {
    if (!form.name.trim()) return;
    setAgents((prev) => {
      const exists = prev.some((a) => a.id === form.id);
      return exists ? prev.map((a) => (a.id === form.id ? form : a)) : [...prev, form];
    });
    setEditing(null);
  }

  function remove(id) {
    if (!confirm('Ștergi acest agent?')) return;
    setAgents((prev) => prev.filter((a) => a.id !== id));
  }

  function toggleTool(name) {
    setForm((f) => ({
      ...f,
      tools: f.tools.includes(name) ? f.tools.filter((t) => t !== name) : [...f.tools, name],
    }));
  }

  if (editing) {
    return (
      <div className="panel">
        <h2>{editing === 'new' ? 'Agent nou' : 'Editează agentul'}</h2>

        <label>Nume</label>
        <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

        <label>System prompt (rolul agentului)</label>
        <textarea value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} />

        <label>Model OpenRouter</label>
        <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
          {modelOptions.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>

        <label>Temperature: {form.temperature}</label>
        <input
          type="range" min="0" max="2" step="0.1"
          value={form.temperature}
          onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
        />

        <label>Tool-uri disponibile</label>
        <div className="checks">
          {TOOL_NAMES.map((t) => (
            <label key={t}>
              <input type="checkbox" checked={form.tools.includes(t)} onChange={() => toggleTool(t)} />
              {t}
            </label>
          ))}
        </div>

        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn" onClick={save}>Salvează</button>
          <button className="btn ghost" onClick={() => setEditing(null)}>Anulează</button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row-between">
        <h2>Agentii mei</h2>
        <button className="btn" onClick={startNew}>+ Agent nou</button>
      </div>
      <p className="hint">
        Fiecare agent = system prompt + model + temperatură + tool-uri. Alege-l apoi din bara laterală ca să conversezi cu el.
      </p>

      {agents.map((a) => (
        <div className="card" key={a.id}>
          <div className="row">
            <div>
              <b>{a.name}</b> {a.id === activeId && <span className="badge">activ</span>}
              <div className="hint" style={{ marginTop: 4 }}>
                <span className="badge">{a.model}</span>
                {a.tools.length ? a.tools.map((t) => <span className="badge" key={t}>{t}</span>) : <span className="badge">fără tool-uri</span>}
              </div>
              <div className="hint" style={{ marginTop: 6 }}>{a.system}</div>
            </div>
            <div className="spacer" />
            <button className="btn ghost small" onClick={() => startEdit(a)}>Editează</button>
            <button className="btn ghost small" onClick={() => onSelect(a.id)}>Deschide</button>
            <button className="btn ghost small" style={{ color: 'var(--err)' }} onClick={() => remove(a.id)}>Șterge</button>
          </div>
        </div>
      ))}
    </div>
  );
}
