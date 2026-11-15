import { useEffect, useMemo, useState } from 'react';
import Chat from './components/Chat.jsx';
import AgentsPanel, { DEFAULT_AGENT, uid } from './components/AgentsPanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import { useLocalStorage } from './hooks/useLocalStorage.js';
import { loadModels } from './lib/models.js';
import { apiAuth } from './lib/openrouter.js';

const FIRST_AGENT = {
  ...DEFAULT_AGENT,
  id: uid(),
  name: 'Cercetător',
  system:
    'Ești un agent de cercetare. Răspunde concis, în limba utilizatorului. ' +
    'Folosește search_wikipedia pentru fapte și calculator pentru calcule, înainte de a răspunde.',
  tools: ['calculator', 'current_datetime', 'search_wikipedia', 'fetch_url'],
};

export default function App() {
  const [tab, setTab] = useState('chat');
  const [apiKey, setApiKey] = useLocalStorage('ors.apiKey', '');
  const [backendUrl, setBackendUrl] = useLocalStorage('ors.backendUrl', '');
  const [agents, setAgents] = useLocalStorage('ors.agents', [FIRST_AGENT]);
  const [activeId, setActiveId] = useLocalStorage('ors.activeAgent', agents[0]?.id);
  const [chats, setChats] = useLocalStorage('ors.chats', {});
  const [models, setModels] = useState([]);
  const [user, setUser] = useState(null);

  const settings = useMemo(
    () => ({ baseUrl: backendUrl, apiKey }),
    [backendUrl, apiKey],
  );

  useEffect(() => {
    loadModels(settings).then(setModels);
  }, [settings]);

  // verifică sesiunea când e configurat backend
  useEffect(() => {
    if (!backendUrl?.trim()) {
      setUser(null);
      return;
    }
    apiAuth(backendUrl, '/auth/me')
      .then((r) => setUser(r.ok ? r.data.email : null))
      .catch(() => setUser(null));
  }, [backendUrl]);

  const agent = useMemo(
    () => agents.find((a) => a.id === activeId) || agents[0],
    [agents, activeId],
  );

  const messages = chats[agent?.id] || [];
  const setMessages = (updater) =>
    setChats((prev) => ({ ...prev, [agent.id]: typeof updater === 'function' ? updater(prev[agent.id] || []) : updater }));

  function selectAgent(id) {
    setActiveId(id);
    setTab('chat');
  }

  const hasAuth = Boolean(apiKey || backendUrl);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="dot" /> Agent Studio</div>
        <nav className="nav">
          <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>💬 Chat</button>
          <button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}>🤖 Agenți</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>⚙️ Setări</button>
        </nav>

        {tab === 'chat' && (
          <div className="nav" style={{ gap: 2 }}>
            {agents.map((a) => (
              <button
                key={a.id}
                className={a.id === agent?.id ? 'active' : ''}
                onClick={() => selectAgent(a.id)}
                title={a.model}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}

        <div className="sidebar-footer">
          <div className={`key-status ${hasAuth ? 'on' : ''}`}>
            <span className="led" />
            {backendUrl ? (user ? `Conectat: ${user}` : 'Neautentificat') : hasAuth ? 'Cheie API setată' : 'Fără cheie API'}
          </div>
          <div style={{ marginTop: 6 }}>OpenRouter · tool-calling · streaming</div>
        </div>
      </aside>

      <main className="main">
        {tab === 'chat' && agent && (
          <Chat key={agent.id} agent={agent} settings={settings} messages={messages} setMessages={setMessages} />
        )}
        {tab === 'agents' && (
          <AgentsPanel
            agents={agents}
            setAgents={setAgents}
            activeId={agent?.id}
            onSelect={selectAgent}
            models={models}
          />
        )}
        {tab === 'settings' && (
          <SettingsPanel
            apiKey={apiKey}
            setApiKey={setApiKey}
            backendUrl={backendUrl}
            setBackendUrl={setBackendUrl}
            settings={settings}
            onTested={() => loadModels(settings).then(setModels)}
            user={user}
            setUser={setUser}
          />
        )}
      </main>
    </div>
  );
}
