import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { LlamaClient, type ChatMessage } from '@forge/core';

type StepId = 'import' | 'inspect' | 'metadata' | 'quantize' | 'chat' | 'api';
type EditorTab = 'Metadata' | 'Template' | 'Tokenizer' | 'Hex';
type Message = { id: number; role: 'user' | 'assistant' | 'system'; text: string; time: string };

const steps: Array<{ id: StepId; label: string; icon: string; group: string }> = [
  { id: 'import', label: 'Import GGUF', icon: '↥', group: 'MODEL' },
  { id: 'inspect', label: 'Inspect', icon: '⌕', group: 'MODEL' },
  { id: 'metadata', label: 'Metadata', icon: '▤', group: 'EDIT' },
  { id: 'quantize', label: 'Quantize', icon: '◈', group: 'EDIT' },
  { id: 'chat', label: 'Chat', icon: '◌', group: 'TOOLS' },
  { id: 'api', label: 'API Server', icon: '⌁', group: 'TOOLS' },
];
const initialMetadata = {
  general: { architecture: 'qwen2', name: 'Qwen2.5-7B-Instruct', file_type: 'Q4_K_M', parameter_count: '7.61B', quantized_by: 'Forge Editor' },
  qwen2: { context_length: 32768, embedding_length: 3584, block_count: 28, attention_head_count: 28, attention_head_count_kv: 4 },
  tokenizer: { model: 'gpt2', token_count: 151936, chat_template: 'jinja2' }
};
const initialTemplate = `{% for message in messages %}{% if message['role'] == 'user' %}<|im_start|>user\n{{ message['content'] }}<|im_end|>\n{% elif message['role'] == 'assistant' %}<|im_start|>assistant\n{{ message['content'] }}<|im_end|>\n{% endif %}{% endfor %}{% if add_generation_prompt %}<|im_start|>assistant\n{% endif %}`;
const quickPrompts = ['Jelaskan Q4_K_M', 'Edit chat_template', 'Cek quantization stats'];

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 2 : 1)} ${units[index]}`;
}

function downloadText(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [step, setStep] = useState<StepId>('metadata');
  const [tab, setTab] = useState<EditorTab>('Metadata');
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('forge.endpoint') || 'http://127.0.0.1:8080/v1');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [serverState, setServerState] = useState<'checking' | 'ready' | 'offline'>('checking');
  const [fileName, setFileName] = useState('Qwen2.5-7B-Instruct-Q4_K_M.gguf');
  const [fileSize, setFileSize] = useState(3.82 * 1024 ** 3);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [metadata, setMetadata] = useState(JSON.stringify(initialMetadata, null, 2));
  const [template, setTemplate] = useState(initialTemplate);
  const [hex, setHex] = useState('47 47 55 46 00 00 00 03 00 00 00 2F 67 65 6E 65 72 61 6C 2E 61 72 63 68 69 74 65 63 74 75 72 65 08 00 00 00 71 77 65 6E 32');
  const [quant, setQuant] = useState('Q4_K_M');
  const [chatInput, setChatInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [logs, setLogs] = useState<string[]>(['Forge Editor ready', 'No file changes yet.']);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: 'assistant', text: 'Model siap diperiksa. Tanyakan apa saja tentang GGUF, metadata, template, atau quantization.', time: 'now' }
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const client = useMemo(() => new LlamaClient(baseUrl), [baseUrl]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }
  function log(message: string) {
    setLogs((current) => [`> ${new Date().toLocaleTimeString()} ${message}`, ...current].slice(0, 5));
  }
  async function refreshModels() {
    localStorage.setItem('forge.endpoint', baseUrl);
    setServerState('checking');
    try {
      const found = await client.listModels();
      const ids = found.map((item) => item.id);
      setModels(ids);
      setModel((current) => current && ids.includes(current) ? current : ids[0] ?? '');
      setServerState('ready');
      log(`llama-server connected • ${ids.length} model(s)`);
      notify(ids.length ? `Connected • ${ids.length} model(s)` : 'Server connected • no model listed');
    } catch {
      setModels([]);
      setServerState('offline');
      log(`cannot reach ${baseUrl}`);
      notify('Tidak dapat tersambung ke llama-server');
    }
  }
  useEffect(() => { void refreshModels(); }, []); // Initial server check.

  async function importGguf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    setFileName(file.name);
    setFileSize(file.size);
    setFileBytes(bytes);
    const signature = new TextDecoder().decode(bytes.slice(0, 4));
    const isGguf = signature === 'GGUF';
    if (bytes.length >= 24) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const version = view.getUint32(4, true);
      const tensors = Number(view.getBigUint64(8, true));
      const metadataEntries = Number(view.getBigUint64(16, true));
      log(`${isGguf ? 'GGUF' : 'Unknown'} file • v${version} • ${tensors} tensors • ${metadataEntries} metadata entries`);
      setHex(Array.from(bytes.slice(0, 48), (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' '));
    } else {
      log(`${isGguf ? 'GGUF' : 'Unknown'} file imported • ${formatBytes(file.size)}`);
    }
    setStep(isGguf ? 'inspect' : 'import');
    notify(isGguf ? 'GGUF berhasil dibuka' : 'File dibuka, signature bukan GGUF');
    event.target.value = '';
  }

  function inspectFile() {
    if (!fileBytes) {
      setStep('import');
      notify('Pilih file GGUF terlebih dahulu');
      return;
    }
    const signature = new TextDecoder().decode(fileBytes.slice(0, 4));
    const view = fileBytes.byteLength >= 24 ? new DataView(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength) : null;
    log(signature === 'GGUF' ? `inspection complete • version ${view?.getUint32(4, true) ?? 'unknown'}` : 'invalid GGUF magic header');
    setStep('inspect');
    notify(signature === 'GGUF' ? 'Header GGUF valid' : 'Header GGUF tidak valid');
  }

  function saveMetadata() {
    try {
      JSON.parse(metadata);
      const name = fileName.replace(/\.gguf$/i, '') + '.forge-metadata.json';
      downloadText(name, metadata);
      log(`metadata sidecar exported • ${name}`);
      notify('Metadata JSON tersimpan');
    } catch {
      notify('JSON metadata belum valid');
    }
  }
  function previewDump() {
    setStep('inspect');
    log('preview dump opened • GGUF header and metadata summary');
  }
  function sendSuggestion(text: string) {
    setChatInput(text);
    setStep('chat');
  }
  async function sendChat(event?: FormEvent, override?: string) {
    event?.preventDefault();
    const prompt = (override ?? chatInput).trim();
    if (!prompt || busy) return;
    setChatInput('');
    setStep('chat');
    const userMessage: Message = { id: Date.now(), role: 'user', text: prompt, time: new Date().toLocaleTimeString().slice(0, 5) };
    setMessages((current) => [...current, userMessage]);
    setBusy(true);
    try {
      const history: ChatMessage[] = [...messages.filter((item) => item.role !== 'system').map(({ role, text }) => ({ role, content: text })), { role: 'user', content: prompt }];
      const answer = await client.chat(history, model || undefined);
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', text: answer || '(respons kosong)', time: new Date().toLocaleTimeString().slice(0, 5) }]);
      log('chat completion received');
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'system', text: `Chat gagal: ${reason}`, time: 'now' }]);
      log(`chat error • ${reason}`);
    } finally { setBusy(false); }
  }

  const stepIndex = steps.findIndex((item) => item.id === step);
  const activeLabel = steps.find((item) => item.id === step)?.label ?? 'Metadata';
  const parsedMetadata = (() => { try { return JSON.parse(metadata) as Record<string, unknown>; } catch { return null; } })();

  return <main className="forge-app">
    <header className="forge-topbar">
      <div className="brand-lockup"><div className="forge-mark">F</div><div className="brand-name">Forge<span>Editor</span></div><span className="top-divider" /><span className="product-tag">GGUF WORKBENCH</span></div>
      <div className="top-actions">
        <div className="model-health"><i className={`health-dot ${serverState}`} /><span>{serverState === 'ready' ? `Active • ${model || 'llama-server connected'}` : serverState === 'checking' ? 'Checking llama-server…' : 'llama-server offline'}</span></div>
        <button className="icon-button refresh-button" onClick={() => void refreshModels()} title="Reconnect llama-server">↻</button>
        <button className="button button-orange top-import" onClick={() => inputRef.current?.click()}><span>＋</span> Import GGUF</button>
        <input ref={inputRef} type="file" accept=".gguf,application/octet-stream" hidden onChange={importGguf} />
      </div>
    </header>

    <div className="app-body">
      <aside className="workflow-rail">
        <div className="rail-title">WORKSPACE</div>
        <div className="workflow-list">
          {['MODEL', 'EDIT', 'TOOLS'].map((group) => <div className="nav-group" key={group}>
            <div className="nav-group-title">{group}</div>
            {steps.filter((item) => item.group === group).map((item) => {
              const index = steps.findIndex((candidate) => candidate.id === item.id);
              const isActive = step === item.id;
              return <button key={item.id} className={`workflow-item ${isActive ? 'selected' : ''} ${index < stepIndex ? 'completed' : ''}`} onClick={() => item.id === 'import' ? inputRef.current?.click() : setStep(item.id)}>
                <span className="workflow-icon">{item.icon}</span><span>{item.label}</span>{isActive && <span className="active-indicator" />}
              </button>;
            })}
          </div>)}
        </div>
        <div className="rail-spacer" />
        <div className="terminal-card">
          <div className="terminal-heading"><span>TERMINAL</span><span className="terminal-state"><i /> LIVE</span></div>
          <pre>{logs.map((line, index) => <span key={`${line}-${index}`} className={index === 0 ? 'log-current' : ''}>{line}{'\n'}</span>)}</pre>
          <div className="terminal-actions"><button onClick={inspectFile}>Run inspect</button><button onClick={() => setLogs(['Terminal cleared.'])}>Clear</button></div>
        </div>
        <div className="rail-footer"><span className="rail-version">FORGE EDITOR</span><span className="version-number">v0.1.0</span></div>
      </aside>

      <div className="mobile-workflow" role="tablist" aria-label="Forge workspace">
        {steps.map((item) => <button key={item.id} className={step === item.id ? 'selected' : ''} onClick={() => item.id === 'import' ? inputRef.current?.click() : setStep(item.id)}>{item.icon}<span>{item.label}</span></button>)}
      </div>

      <section className="workbench-main">
        <section className="editor-stage">
          <div className="stage-toolbar">
            <div className="stage-title"><span className="stage-kicker">{activeLabel.toUpperCase()}</span><span className="stage-separator">/</span><span className="filename">{fileName}</span></div>
            <div className="stage-actions"><span className={`sync-state ${parsedMetadata ? 'synced' : 'invalid'}`}><i />{parsedMetadata ? 'editable' : 'invalid JSON'}</span><button className="small-ghost" onClick={previewDump}>Preview Dump</button></div>
          </div>
          <div className="editor-tabs">
            {(['Metadata', 'Template', 'Tokenizer', 'Hex'] as EditorTab[]).map((name) => <button key={name} className={tab === name ? 'tab-active' : ''} onClick={() => { setTab(name); setStep('metadata'); }}><span className="tab-glyph">{name === 'Metadata' ? '▤' : name === 'Template' ? '⌘' : name === 'Tokenizer' ? 'Aa' : '▦'}</span>{name}{tab === name && <i />}</button>)}
            <div className="tab-meta">{formatBytes(fileSize)} <span>•</span> {serverState === 'ready' ? 'server ready' : 'local preview'}</div>
          </div>

          <div className="editor-content">
            {step === 'metadata' && tab === 'Metadata' && <div className="metadata-view">
              <div className="metadata-caption"><span>forge-metadata.json <b>• editable sidecar</b></span><span className="caption-tag">JSON</span></div>
              <div className="metadata-editor"><div className="line-numbers">{metadata.split('\n').map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea aria-label="GGUF metadata JSON" spellCheck={false} value={metadata} onChange={(event) => setMetadata(event.target.value)} /></div>
              <div className="editor-bottom-row"><div className="metadata-stats"><span>{metadata.split('\n').length} lines</span><span>{parsedMetadata ? Object.keys(parsedMetadata).length : '—'} sections</span><span>{fileBytes ? 'file imported' : 'sample metadata'}</span></div><div className="editor-buttons"><button className="button button-light" onClick={saveMetadata}>Save JSON</button><button className="button button-orange" onClick={() => { void refreshModels(); log('server/model list refreshed'); }}>Refresh model</button></div></div>
            </div>}

            {step === 'metadata' && tab === 'Template' && <div className="alternate-view"><div className="view-heading"><div><span className="eyebrow">PROMPT FORMAT</span><h2>Chat template</h2></div><span className="caption-tag">JINJA2</span></div><p className="view-description">Edit the prompt template used to format messages before they are sent to the model.</p><textarea className="code-textarea template-input" spellCheck={false} value={template} onChange={(event) => setTemplate(event.target.value)} /><div className="view-footer"><span>{template.includes('<|im_start|>') ? 'Template contains chat tokens' : 'Missing expected chat tokens'}</span><button className="button button-light" onClick={() => { setTemplate(initialTemplate); notify('Template reset'); }}>Reset template</button></div></div>}

            {step === 'metadata' && tab === 'Tokenizer' && <div className="alternate-view"><div className="view-heading"><div><span className="eyebrow">TOKENIZER</span><h2>Vocabulary & validation</h2></div><span className="caption-tag">{parsedMetadata ? 'READY' : 'SAMPLE'}</span></div><div className="stat-grid"><div className="stat-card"><span>VOCABULARY</span><strong>{Number(initialMetadata.tokenizer.token_count).toLocaleString()}</strong><small>tokens</small></div><div className="stat-card"><span>TOKENIZER</span><strong>GPT-2</strong><small>pre-tokenizer</small></div><div className="stat-card"><span>CHAT TEMPLATE</span><strong>{template.includes('<|im_start|>') ? 'Valid' : 'Needs review'}</strong><small>Jinja2 format</small></div></div><div className="token-preview"><span className="eyebrow">SPECIAL TOKENS</span><div><code>&lt;|im_start|&gt;</code><code>&lt;|im_end|&gt;</code><code>&lt;|endoftext|&gt;</code><code>&lt;|assistant|&gt;</code></div></div><div className="view-footer"><span>Validate local template structure</span><button className="button button-light" onClick={() => notify(template.includes('<|im_start|>') ? 'Tokenizer validated ✓' : 'Template token not found')}>Validate</button><button className="button button-ghost" onClick={() => downloadText('forge-vocabulary.txt', '<|im_start|>\n<|im_end|>\n<|endoftext|>\n', 'text/plain')}>Export vocab</button></div></div>}

            {step === 'metadata' && tab === 'Hex' && <div className="alternate-view"><div className="view-heading"><div><span className="eyebrow">BINARY INSPECTOR</span><h2>Raw GGUF header</h2></div><span className="caption-tag">HEX</span></div><p className="view-description">View the first bytes of the imported GGUF file. This preview is read-only.</p><div className="hex-offset">OFFSET 0x0000 <span>• GGUF magic</span></div><textarea className="hex-input" spellCheck={false} value={hex} onChange={(event) => setHex(event.target.value)} aria-label="GGUF header bytes" /><div className="hex-byte-grid">{hex.split(/\s+/).slice(0, 24).map((byte, index) => <span key={`${byte}-${index}`} className={index < 4 ? 'magic-byte' : ''}>{byte || '00'}</span>)}</div><div className="view-footer"><span>{fileBytes ? `${Math.min(fileBytes.length, 48)} header bytes shown` : 'Showing sample GGUF header'}</span><button className="button button-light" onClick={inspectFile}>Inspect header</button></div></div>}

            {step === 'import' && <div className="empty-state"><div className="empty-icon">↥</div><span className="eyebrow">START WITH A MODEL</span><h2>Import a GGUF file</h2><p>Open a local GGUF model to inspect its header and edit a metadata sidecar.</p><button className="button button-orange" onClick={() => inputRef.current?.click()}>Choose GGUF file</button><span className="file-hint">File is read locally in your browser; it is not uploaded.</span></div>}

            {step === 'inspect' && <div className="inspect-view"><div className="view-heading"><div><span className="eyebrow">MODEL INSPECTOR</span><h2>{fileName}</h2></div><button className="button button-ghost" onClick={() => setTab('Hex')}>Open Hex view</button></div><div className="inspect-cards"><div className="inspect-card"><span>FORMAT</span><strong>{fileBytes && new TextDecoder().decode(fileBytes.slice(0, 4)) === 'GGUF' ? 'GGUF' : 'Sample GGUF'}</strong></div><div className="inspect-card"><span>FILE SIZE</span><strong>{formatBytes(fileSize)}</strong></div><div className="inspect-card"><span>QUANTIZATION</span><strong>Q4_K_M</strong></div><div className="inspect-card"><span>TENSORS</span><strong>{fileBytes && fileBytes.length >= 16 ? Number(new DataView(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength).getBigUint64(8, true)).toLocaleString() : '291'}</strong></div></div><div className="inspect-note"><span className="note-icon">i</span><p>This view validates the GGUF magic and reads header counts. Full tensor scan and metadata rewriting require the native GGUF backend.</p></div><button className="button button-orange" onClick={() => { setStep('metadata'); setTab('Metadata'); }}>Edit metadata sidecar</button></div>}

            {step === 'quantize' && <div className="alternate-view quantize-view"><div className="view-heading"><div><span className="eyebrow">QUANTIZATION</span><h2>Choose an output format</h2></div><span className="caption-tag">CLI READY</span></div><p className="view-description">Quantization runs with the upstream `llama-quantize` tool from the engine submodule.</p><div className="quant-options">{['Q4_K_M', 'Q5_K_M', 'Q8_0'].map((name) => <button key={name} className={`quant-option ${quant === name ? 'active' : ''}`} onClick={() => setQuant(name)}><span className="radio-dot" /><strong>{name}</strong><small>{name === 'Q4_K_M' ? 'Balanced · recommended' : name === 'Q5_K_M' ? 'Higher quality · larger' : 'Near-original quality · largest'}</small></button>)}</div><div className="command-preview"><span className="eyebrow">COMMAND PREVIEW</span><code>llama-quantize input.gguf output-{quant}.gguf {quant}</code></div><div className="inspect-note"><span className="note-icon">i</span><p>Quantization is preview-only in this browser build; it does not launch a process or modify your model file.</p></div><button className="button button-light" onClick={() => { void navigator.clipboard?.writeText(`llama-quantize input.gguf output-${quant}.gguf ${quant}`); notify('Command copied'); }}>Copy command</button></div>}

            {step === 'chat' && <div className="empty-state chat-empty"><div className="empty-icon">◌</div><span className="eyebrow">MODEL CHAT</span><h2>Ask about your GGUF</h2><p>Use the Forge chat panel to ask about metadata, quantization, or prompt templates.</p><button className="button button-orange" onClick={() => document.querySelector<HTMLInputElement>('.chat-composer input')?.focus()}>Focus chat</button></div>}

            {step === 'api' && <div className="alternate-view api-view"><div className="view-heading"><div><span className="eyebrow">OPENAI-COMPATIBLE</span><h2>API Server</h2></div><span className={`server-pill ${serverState}`}><i />{serverState === 'ready' ? 'Connected' : serverState === 'checking' ? 'Checking' : 'Offline'}</span></div><label className="endpoint-label">Base URL<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} onBlur={() => void refreshModels()} spellCheck={false} /></label><label className="endpoint-label">Active model<select value={model} onChange={(event) => setModel(event.target.value)}><option value="">Server default</option>{models.map((item) => <option key={item}>{item}</option>)}</select></label><div className="command-preview"><span className="eyebrow">QUICK TEST</span><code>curl {baseUrl}/models</code></div><div className="view-footer"><span>Endpoint is stored in this browser only.</span><button className="button button-orange" onClick={() => void refreshModels()}>Test connection</button></div></div>}
          </div>
        </section>

        <section className="chat-stage">
          <div className="chat-header"><div><div className="chat-title"><span className="chat-spark">✳</span><strong>Forge Chat</strong></div><div className="chat-subtitle">GGUF assistant <span>·</span> {model || 'server default'}</div></div><div className="chat-header-actions"><button className="icon-button" onClick={() => { setMessages([]); log('chat cleared'); }}>⌫</button><button className="icon-button" title="Test chat" onClick={() => sendSuggestion('Test chat template with new metadata')}>▷</button></div></div>
          <div className="chat-context"><span className="context-dot" />Context <b>{fileName}</b><span className="context-size">{formatBytes(fileSize)}</span></div>
          <div className="chat-messages" aria-live="polite">{messages.map((message) => <div key={message.id} className={`message-row ${message.role}`}><div className="message-avatar">{message.role === 'assistant' ? 'F' : message.role === 'system' ? '!' : 'You'}</div><div className="message-body"><div className="message-meta"><strong>{message.role === 'assistant' ? 'Forge' : message.role === 'system' ? 'System' : 'You'}</strong><span>{message.time}</span></div><div className="message-bubble">{message.text}</div></div></div>)}{busy && <div className="message-row assistant"><div className="message-avatar">F</div><div className="message-body"><div className="message-meta"><strong>Forge</strong></div><div className="message-bubble typing">Thinking<span>.</span><span>.</span><span>.</span></div></div></div>}</div>
          <form className="chat-composer" onSubmit={(event) => void sendChat(event)}><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Tanya tentang GGUF edit..." aria-label="Ask Forge about GGUF" /><button type="submit" disabled={busy || !chatInput.trim()}>Send <span>↑</span></button></form>
          <div className="quick-prompts">{quickPrompts.map((prompt) => <button key={prompt} onClick={() => sendSuggestion(prompt)}>{prompt}</button>)}</div>
          <div className="chat-footnote">Responses run through your local llama-server.</div>
        </section>
      </section>
    </div>
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </main>;
}
