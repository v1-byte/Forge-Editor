export type WorkspaceFile = { path: string; content: string; language: string };

const languageByExtension: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', py: 'python', rs: 'rust', go: 'go',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', css: 'css', html: 'html'
};

export function createWorkspaceFile(path: string, content = ''): WorkspaceFile {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return { path, content, language: languageByExtension[extension] ?? 'plaintext' };
}

export function readBrowserFile(file: File): Promise<WorkspaceFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Tidak dapat membaca file'));
    reader.onload = () => resolve(createWorkspaceFile(file.name, String(reader.result ?? '')));
    reader.readAsText(file);
  });
}

export function downloadWorkspaceFile(file: WorkspaceFile): void {
  const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.path.split('/').pop() || 'untitled.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}
