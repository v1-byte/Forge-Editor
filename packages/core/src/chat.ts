import { LlamaClient, type ChatMessage } from './client.js';

export class ForgeChat {
  constructor(private readonly client: LlamaClient, private model?: string) {}

  setModel(model: string): void { this.model = model; }

  async send(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    return this.client.chat(messages, this.model, signal);
  }

  async ask(question: string, codeContext?: string, signal?: AbortSignal): Promise<string> {
    const context = codeContext?.trim()
      ? `Use this code context when answering:\n\n\`\`\`\n${codeContext}\n\`\`\`\n\n`
      : '';
    return this.send([{ role: 'user', content: `${context}${question}` }], signal);
  }
}
