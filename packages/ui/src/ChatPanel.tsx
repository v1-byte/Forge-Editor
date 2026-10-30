import { useMemo, useState, type FormEvent } from 'react';
import { ForgeChat, LlamaClient } from '@forge/core';

type Props = { baseUrl: string; model?: string; codeContext?: string };
export function ChatPanel({ baseUrl, model, codeContext }: Props) {
  const chat = useMemo(() => new ForgeChat(new LlamaClient(baseUrl), model), [baseUrl, model]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    const prompt = question.trim(); setQuestion(''); setBusy(true); setError('');
    try { setAnswer(await chat.ask(prompt, codeContext)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <section className="chat-panel">
    <header><strong>Forge AI</strong><span>{model || 'Pilih model'}</span></header>
    <div className="chat-answer" aria-live="polite">{error ? <p className="error">{error}</p> : answer || 'Tanyakan sesuatu tentang kode Anda.'}</div>
    <form onSubmit={submit}>
      <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Tanya Forge AI…" rows={3} />
      <button disabled={busy || !question.trim()}>{busy ? 'Berpikir…' : 'Kirim'}</button>
    </form>
  </section>;
}
