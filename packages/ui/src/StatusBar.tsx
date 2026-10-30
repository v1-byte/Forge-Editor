export function StatusBar({ file, language, connected }: { file: string; language: string; connected: boolean }) {
  return <footer className="status-bar"><span>{file || 'No file open'}</span><span>{language}</span><span>{connected ? 'llama-server connected' : 'llama-server offline'}</span></footer>;
}
