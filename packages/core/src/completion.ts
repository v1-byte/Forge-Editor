import { LlamaClient } from './client.js';

export class ForgeCompletionProvider {
  constructor(private readonly client: LlamaClient, private model?: string) {}

  setModel(model: string): void { this.model = model; }

  async complete(prefix: string, suffix = '', signal?: AbortSignal): Promise<string> {
    const prompt = `${prefix}<|cursor|>${suffix}\n\nContinue the code at <|cursor|>. Return only code.`;
    return this.client.complete(prompt, this.model, signal);
  }
}
