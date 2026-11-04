import { useEffect, useState } from 'react';
import AgentPanel from './AgentPanel.jsx';
import ChatSidebar from './ChatSidebar.jsx';
import ModeSwitch from './ModeSwitch.jsx';
import ProfilePanel from './ProfilePanel.jsx';
import { SettingsIcon } from './Icons.jsx';

const TABS = [
  { id: 'agent', label: 'Agent' },
  { id: 'ask', label: 'Ask' },
];

export default function Sidebar({ mode, onModeChange, agent, profile, onSaveProfile, messages, isThinking, onSend }) {
  const [tab, setTab] = useState('agent');
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // A new escalation always brings the Agent tab forward: the stop button lives there.
  const activeEscalationId = agent.isEscalationActive ? agent.escalation?.id : null;
  useEffect(() => {
    if (activeEscalationId) setTab('agent');
  }, [activeEscalationId]);

  return (
    <aside className="sidebar" aria-label="OmniMind agent">
      <div className="sheet-handle" aria-hidden="true" />
      <header className="sidebar__header">
        <div>
          <h1>OmniMind</h1>
          <p>Your AI home-safety agent</p>
        </div>
        <div className="sidebar__actions">
          <ModeSwitch mode={mode} onChange={onModeChange} />
          <button
            type="button"
            className="icon-button"
            onClick={() => setIsProfileOpen(true)}
            aria-label="Home profile"
            title="Home profile"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Sidebar">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            className={`tabs__tab ${tab === id ? 'is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Both panels stay mounted so a recording or draft survives a tab switch. */}
      <div className="sidebar__panel" role="tabpanel" id="panel-agent" aria-labelledby="tab-agent" hidden={tab !== 'agent'}>
        <AgentPanel agent={agent} />
      </div>
      <div className="sidebar__panel" role="tabpanel" id="panel-ask" aria-labelledby="tab-ask" hidden={tab !== 'ask'}>
        <ChatSidebar messages={messages} isThinking={isThinking} onSend={onSend} isVisible={tab === 'ask'} />
      </div>

      {isProfileOpen && (
        <ProfilePanel profile={profile} onSave={onSaveProfile} onClose={() => setIsProfileOpen(false)} />
      )}
    </aside>
  );
}
