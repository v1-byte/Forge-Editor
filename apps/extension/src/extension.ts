import * as vscode from 'vscode';

type ChatResult = { choices?: Array<{ message?: { content?: string } }> };
export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Forge Editor');
  context.subscriptions.push(output);
  context.subscriptions.push(vscode.commands.registerCommand('forge.askSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const selected = editor.document.getText(editor.selection) || editor.document.getText();
    const question = await vscode.window.showInputBox({ prompt: 'Apa yang ingin Anda tanyakan tentang kode ini?' });
    if (!question) return;
    const config = vscode.workspace.getConfiguration('forge');
    const endpoint = config.get<string>('endpoint', 'http://127.0.0.1:8080/v1').replace(/\/+$/, '');
    const model = config.get<string>('model', '');
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Forge sedang menjawab…' }, async () => {
      try {
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: model || undefined, stream: false,
            messages: [{ role: 'user', content: `Question: ${question}\n\nCode:\n\`\`\`\n${selected}\n\`\`\`` }] })
        });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
        const result = await response.json() as ChatResult;
        const answer = result.choices?.[0]?.message?.content ?? '(empty response)';
        output.clear(); output.appendLine(answer); output.show(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Forge connection failed: ${message}`);
      }
    });
  }));
}
export function deactivate() {}
