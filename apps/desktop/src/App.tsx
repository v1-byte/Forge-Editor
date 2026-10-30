import { useMemo, useState } from 'react';
import { ForgeMonaco, createWorkspaceFile, downloadWorkspaceFile, readBrowserFile, type WorkspaceFile } from '@forge/editor';
import { ChatPanel, ModelPicker, StatusBar } from '@forge/ui';
import { LlamaClient } from '@forge/core';

const sample = createWorkspaceFile('hello.ts', 'function greet(name: string) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("Forge"));\n');
export default function App() {
  const [file, setFile] = useState<WorkspaceFile>(sample);
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('forge.endpoint') || 'http://127.0.0.1:8080/v1');
  const [model, setModel] = useState('');
  const [connected, setConnected] = useState(false);
  const client = useMemo(() => new LlamaClient(baseUrl), [baseUrl]);

  async function openFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) setFile(await readBrowserFile(selected));
    event.target.value = '';
  }
  async function checkConnection() {
    localStorage.setItem('forge.endpoint', baseUrl);
    try { await client.listModels(); setConnected(true); }
    catch { setConnected(false); }
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">F</span><strong>Forge Editor</strong></div>
      <div className="toolbar"><label className="endpoint">llama-server <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} onBlur={checkConnection} aria-label="llama-server endpoint" /></label>
        <button onClick={checkConnection}>Connect</button><ModelPicker baseUrl={baseUrl} value={model} onChange={setModel} /></div>
    </header>
    <section className="workbench">
      <aside className="explorer"><div className="explorer-heading">EXPLORER</div><div className="workspace-name">FORGE WORKSPACE</div>
        <button className={`file-entry ${file.path ? 'active' : ''}`} onClick={() => document.getElementById('open-file')?.click()}>▸　{file.path}</button>
        <input id="open-file" type="file" hidden onChange={openFile} />
        <button className="open-file" onClick={() => document.getElementById('open-file')?.click()}>Open local file…</button>
      </aside>
      <section className="editor-column"><div className="tab"><span>{file.path}</span><button title="Download/save file" onClick={() => downloadWorkspaceFile(file)}>Save</button></div>
        <div className="editor"><ForgeMonaco value={file.content} language={file.language} onChange={(content) => setFile((current) => ({ ...current, content }))} /></div>
      </section>
      <aside className="assistant"><ChatPanel baseUrl={baseUrl} model={model || undefined} codeContext={file.content} /></aside>
    </section>
    <StatusBar file={file.path} language={file.language} connected={connected} />
  </main>;
}
