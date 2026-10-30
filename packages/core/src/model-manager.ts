import { LlamaClient, type ModelInfo } from './client.js';

export class ModelManager {
  private activeModel?: string;
  constructor(private readonly client: LlamaClient) {}

  async refresh(): Promise<ModelInfo[]> {
    const models = await this.client.listModels();
    if (!this.activeModel && models.length) this.activeModel = models[0].id;
    return models;
  }

  get active(): string | undefined { return this.activeModel; }

  select(modelId: string): void {
    if (!modelId.trim()) throw new Error('Model ID tidak boleh kosong');
    this.activeModel = modelId;
  }
}
