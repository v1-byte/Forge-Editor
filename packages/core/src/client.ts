export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ModelInfo = { id: string; object?: string; owned_by?: string };

type ModelsResponse = { data?: ModelInfo[] };
type ChatResponse = { choices?: Array<{ message?: { content?: string } }> };
type CompletionResponse = { choices?: Array<{ text?: string }> };

export class LlamaClient {
  readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(baseUrl = 'http://127.0.0.1:8080/v1', apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set('Content-Type', 'application/json');
    if (this.apiKey) headers.set('Authorization', `Bearer ${this.apiKey}`);
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`llama-server ${response.status}: ${detail || response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  async listModels(): Promise<ModelInfo[]> {
    const result = await this.request<ModelsResponse>('/models');
    return result.data ?? [];
  }

  async chat(messages: ChatMessage[], model?: string, signal?: AbortSignal): Promise<string> {
    const result = await this.request<ChatResponse>('/chat/completions', {
      method: 'POST', signal,
      body: JSON.stringify({ model, messages, stream: false })
    });
    return result.choices?.[0]?.message?.content ?? '';
  }

  async complete(prompt: string, model?: string, signal?: AbortSignal): Promise<string> {
    const result = await this.request<CompletionResponse>('/completions', {
      method: 'POST', signal,
      body: JSON.stringify({ model, prompt, stream: false })
    });
    return result.choices?.[0]?.text ?? '';
  }
}
