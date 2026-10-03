import { useEffect, useState } from 'react';
import { AgentList } from './components/AgentList.js';
import { Inspector } from './components/Inspector.js';
import { AdminPanel } from './components/AdminPanel.js';
import { EMPTY_MANIFEST, parseManifest, type AvatarManifest } from './office/manifest.js';
import { OfficeView } from './office/OfficeScene.js';
import { useAgentPoses } from './office/use-poses.js';
import { hasWebGL } from './office/webgl.js';
import { useOfficeStore, useOfficeStoreApi } from './runtime/RuntimeProvider.js';

export function App() {
  const agents = useOfficeStore((state) => state.agents);
  const departments = useOfficeStore((state) => state.departments);
  const tasks = useOfficeStore((state) => state.tasks);
  const sessions = useOfficeStore((state) => state.sessions);
  const output = useOfficeStore((state) => state.output);
  const outputChunks = useOfficeStore((state) => state.outputChunks);
  const communications = useOfficeStore((state) => state.communications);
  const profiles = useOfficeStore((state) => state.profiles);
  const capabilities = useOfficeStore((state) => state.capabilities);
  const selectedAgentId = useOfficeStore((state) => state.selectedAgentId);
  const view = useOfficeStore((state) => state.view);
  const status = useOfficeStore((state) => state.status);
  const busy = useOfficeStore((state) => state.busy);
  const notice = useOfficeStore((state) => state.notice);
  const lastError = useOfficeStore((state) => state.lastError);
  const store = useOfficeStoreApi();

  const [manifest, setManifest] = useState<AvatarManifest>(EMPTY_MANIFEST);
  const [webglAvailable] = useState(() => hasWebGL());
  const { poses, bounds, moveTo } = useAgentPoses(agents, departments);

  useEffect(() => {
    let cancelled = false;
    void fetch('/avatars/manifest.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((raw: unknown) => {
        if (!cancelled && raw !== null) setManifest(parseManifest(raw));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const capabilitiesForSelected = capabilities.harnessAdapters.find(
    (adapter) => adapter.id === selected?.harnessId,
  )?.capabilities;

  const list = (
    <AgentList
      agents={agents}
      tasks={tasks}
      selectedAgentId={selectedAgentId}
      onSelect={(agentId) => store.select(agentId)}
      departmentName={(departmentId) =>
        departments.find((department) => department.id === departmentId)?.name
      }
    />
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Office</h1>
        <span className={`badge connection-${status}`}>{status}</span>
        <nav>
          <button
            type="button"
            className={view === 'list' ? 'active' : undefined}
            onClick={() => store.setView('list')}
          >
            List
          </button>
          <button
            type="button"
            className={view === 'office' ? 'active' : undefined}
            onClick={() => store.setView('office')}
          >
            Office
          </button>
        </nav>
      </header>

      {lastError !== null ? (
        <div className="notice error" role="alert">
          <strong>{lastError.code}</strong> {lastError.message}
          <button type="button" className="link" onClick={() => store.dismissError()}>
            Dismiss
          </button>
        </div>
      ) : null}

      {notice !== null ? (
        <div className="notice" role="status">
          {notice}
          <button type="button" className="link" onClick={() => store.dismissNotice()}>
            Dismiss
          </button>
        </div>
      ) : null}

      <AdminPanel
        capabilities={capabilities}
        busy={busy}
        defaultWorkingDir=""
        onCreateDepartment={(name) => void store.createDepartment(name)}
        onCreateAgent={(input) => store.createAgent(input)}
      />

      <main className="layout">
        <div className="main-column">
          {view === 'office' ? (
            <OfficeView
              agents={agents}
              departments={departments}
              tasks={tasks}
              communications={communications}
              selectedAgentId={selectedAgentId}
              onSelect={(agentId) => store.select(agentId)}
              poses={poses}
              bounds={bounds}
              onMovePose={moveTo}
              manifest={manifest}
              webglAvailable={webglAvailable}
              listFallback={list}
              onToggleView={() => store.setView('list')}
            />
          ) : (
            <>
              <header className="subheader">
                <h2>Agents</h2>
                <button type="button" className="link" onClick={() => store.setView('office')}>
                  Switch to office
                </button>
              </header>
              {list}
            </>
          )}
        </div>

        {selected !== null ? (
          <Inspector
            agent={selected}
            agents={agents}
            tasks={tasks}
            sessions={sessions}
            communications={communications}
            output={output}
            outputChunks={outputChunks}
            profile={profiles[selected.id]}
            capabilities={capabilitiesForSelected}
            busy={busy}
            onClose={() => store.select(null)}
            onStart={() => void store.start(selected.id)}
            onCancel={() => void store.cancel(selected.id)}
            onPrompt={(text) => void store.prompt(selected.id, text)}
            onLoadProfile={() => void store.loadProfile(selected.id)}
            onSaveProfile={(profile) => store.saveProfile(selected.id, profile)}
            onCreateTask={(title, instruction) =>
              store.createTask({ agentId: selected.id, title, instruction })
            }
            onRerun={(taskId) => void store.rerun(selected.id, taskId)}
          />
        ) : null}
      </main>
    </div>
  );
}
