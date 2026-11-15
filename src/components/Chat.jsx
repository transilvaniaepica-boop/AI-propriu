import { useEffect, useRef, useState } from 'react';
import { runAgentTurn } from '../lib/agentLoop.js';
import Markdown from './Markdown.jsx';

export default function Chat({ agent, settings, messages, setMessages }) {
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  if (!settings.apiKey && !settings.baseUrl) {
    return (
      <div className="empty">
        <div className="big">🔑</div>
        <p>Configurază mai întâi conexiunea în <b>Setări</b> (cheie API sau backend URL).</p>
        <p className="hint">Recomandat: backend FastAPI, ca să nu expui cheia în browser.</p>
      </div>
    );
  }

  async function send(text) {
    const content = text.trim();
    if (!content || streaming) return;
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content }]);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const sys = [{ role: 'system', content: agent.system || 'Esti un asistent util.' }];
    const history = sys.concat(messages, [{ role: 'user', content }]);

    try {
      const { history: finalHistory } = await runAgentTurn({
        settings,
        model: agent.model,
        messages: history,
        toolNames: agent.tools,
        temperature: agent.temperature,
        maxSteps: 8,
        signal: ctrl.signal,
        onEvent: (ev) => {
          if (ev.type === 'delta') {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant' && last.streaming) {
                return [...prev.slice(0, -1), { ...last, content: last.content + ev.text }];
              }
              return [...prev, { role: 'assistant', content: ev.text, streaming: true }];
            });
          } else if (ev.type === 'toolCall') {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              const callMsg = {
                id: ev.call.id,
                type: 'function',
                function: { name: ev.call.function.name, arguments: ev.call.function.arguments },
              };
              if (last && last.role === 'assistant' && last.streaming) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, streaming: false, done: true, toolCalls: [...(last.toolCalls || []), callMsg] },
                ];
              }
              return [...prev, { role: 'assistant', content: '', toolCalls: [callMsg], done: true }];
            });
          } else if (ev.type === 'toolResult') {
            setMessages((prev) => [
              ...prev,
              { role: 'tool', name: ev.call.function.name, tool_call_id: ev.call.id, content: ev.result },
            ]);
          } else if (ev.type === 'error') {
            setError(ev.error?.message || String(ev.error));
          } else if (ev.type === 'done' || ev.type === 'maxSteps') {
            // istoricul final vine fara sistem; normalizam tool_calls -> toolCalls
            setMessages(
              ev.history
                .filter((m) => m.role !== 'system')
                .map((m) => (m.tool_calls ? { ...m, toolCalls: m.tool_calls } : m)),
            );
          }
        },
      });
      void finalHistory;
    } catch (e) {
      if (e?.name !== 'AbortError') setError(e?.message || String(e));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m, i) =>
        i === prev.length - 1 && m.streaming ? { ...m, streaming: false, done: true } : m,
      ),
    );
  }

  function reset() {
    if (streaming) stop();
    setMessages([]);
  }

  return (
    <>
      <div className="topbar">
        <h1>{agent.name}</h1>
        <span className="badge">{agent.model}</span>
        {agent.tools.map((t) => (
          <span className="badge" key={t}>{t}</span>
        ))}
        <div className="spacer" />
        <button className="btn ghost small" onClick={reset} disabled={streaming && !messages.length}>
          Chat nou
        </button>
      </div>

      <div className="chat" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty">
            <div className="big">🤖</div>
            <p>
              <b>{agent.name}</b> este gata. Are acces la: {agent.tools.join(', ') || 'niciun tool'}.
            </p>
            <p className="hint">Scrie ceva mai jos — modelul va apela tool-urile singur când are nevoie.</p>
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === 'tool') {
            return (
              <details className="toolcard" key={i} open>
                <summary>
                  <span className="status ok">✓ tool result</span> · <b>{m.name}</b>
                </summary>
                <div className="body">
                  <pre>{m.content}</pre>
                </div>
              </details>
            );
          }
          if (m.role === 'assistant' && m.toolCalls?.length) {
            return (
              <div key={i}>
                {m.content ? <div className="msg assistant" style={{ marginBottom: 8 }}>{m.content}</div> : null}
                {m.toolCalls.map((c, j) => (
                  <details className="toolcard" key={j}>
                    <summary>
                      <span className="status run">⚙ tool call</span> · <b>{c.function?.name}</b>
                    </summary>
                    <div className="body">
                      <div className="hint">Argumente:</div>
                      <pre>{c.function?.arguments || '{}'}</pre>
                    </div>
                  </details>
                ))}
              </div>
            );
          }
          return (
            <div className={`msg ${m.role}`} key={i}>
              {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
              {m.streaming && <span className="cursor">▍</span>}
            </div>
          );
        })}

        {error && (
          <div className="msg assistant" style={{ borderColor: 'var(--err)' }}>
            ⚠️ {error}
          </div>
        )}
        {streaming && <div className="typing">Agentul lucrează…</div>}
      </div>

      <div className="composer">
        <textarea
          placeholder="Scrie mesajul… (Enter = trimite, Shift+Enter = linie nouă)"
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        {streaming ? (
          <button className="btn danger" onClick={stop}>Stop</button>
        ) : (
          <button className="btn" onClick={() => send(draft)} disabled={!draft.trim()}>
            Trimite
          </button>
        )}
      </div>
    </>
  );
}
