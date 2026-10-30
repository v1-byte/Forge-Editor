import Editor, { type OnMount } from '@monaco-editor/react';
import { useCallback } from 'react';

export type ForgeMonacoProps = {
  value: string;
  language?: string;
  onChange: (value: string) => void;
  onReady?: (editor: Parameters<OnMount>[0]) => void;
};

export function ForgeMonaco({ value, language = 'typescript', onChange, onReady }: ForgeMonacoProps) {
  const mount: OnMount = useCallback((editor) => onReady?.(editor), [onReady]);
  return <Editor height="100%" theme="vs-dark" language={language} value={value}
    onChange={(next) => onChange(next ?? '')} onMount={mount}
    options={{ minimap: { enabled: false }, automaticLayout: true, fontSize: 14,
      tabSize: 2, scrollBeyondLastLine: false, wordWrap: 'on' }} />;
}
