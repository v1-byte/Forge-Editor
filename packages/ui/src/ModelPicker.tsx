import { useEffect, useState } from 'react';
import { LlamaClient } from '@forge/core';

export function ModelPicker({ baseUrl, value, onChange }: { baseUrl: string; value: string; onChange: (id: string) => void }) {
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    setStatus('loading');
    new LlamaClient(baseUrl).listModels().then((items) => {
      if (active) { setModels(items.map((item) => item.id)); setStatus('ready'); }
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [baseUrl]);
  return <label className="model-picker">Model
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={!models.length}>
      {!models.length && <option value="">{status === 'loading' ? 'Memuat…' : 'Tidak ada model'}</option>}
      {models.map((model) => <option key={model} value={model}>{model}</option>)}
    </select>
    <span className={`connection ${status}`} title={status === 'ready' ? 'llama-server tersambung' : status === 'error' ? 'Tidak dapat tersambung' : 'Menguji koneksi'} />
  </label>;
}
