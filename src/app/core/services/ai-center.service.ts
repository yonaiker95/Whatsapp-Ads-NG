import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  AiConfig,
  AiConfigFormData,
  AiOverview,
  AiProviderInfo,
  AiUsageSummary,
  AiSaaSKey,
} from '../models/ai-center.model';

@Injectable({ providedIn: 'root' })
export class AiCenterService {
  constructor(private api: ApiService) {}

  getOverview(): Observable<AiOverview> {
    return this.api.get<AiOverview>('/ai').pipe(map((res) => res.data));
  }

  getConfig(): Observable<AiConfig | null> {
    return this.api.get<AiConfig | null>('/ai/config').pipe(map((res) => res.data));
  }

  saveConfig(data: AiConfigFormData): Observable<AiConfig> {
    return this.api.put<AiConfig>('/ai/config', data).pipe(map((res) => res.data));
  }

  validate(data: { provider: string; apiKey?: string; baseUrl?: string; project?: string }): Observable<{
    ok: boolean;
    models?: string[];
    label?: string;
  }> {
    return this.api.post<{ ok: boolean; models?: string[]; label?: string }>('/ai/validate', data).pipe(map((res) => res.data));
  }

  test(message?: string): Observable<{ ok: boolean; text: string }> {
    return this.api.post<{ ok: boolean; text: string }>('/ai/test', { message }).pipe(map((res) => res.data));
  }

  suggestReply(data: { instanceId: string; senderJid: string; message?: string }): Observable<{ text: string }> {
    return this.api.post<{ text: string }>('/ai/suggest', data).pipe(map((res) => res.data));
  }

  rotateKey(apiKey: string): Observable<{ apiKeyMasked: string }> {
    return this.api.post<{ apiKeyMasked: string }>('/ai/rotate-key', { apiKey }).pipe(map((res) => res.data));
  }

  getUsage(): Observable<AiUsageSummary> {
    return this.api.get<AiUsageSummary>('/ai/usage').pipe(map((res) => res.data));
  }

  getCatalogue(): Observable<AiProviderInfo[]> {
    return this.api.get<AiProviderInfo[]>('/ai/catalogue').pipe(map((res) => res.data));
  }

  getSaaSKeys(): Observable<AiSaaSKey[]> {
    return this.api.get<AiSaaSKey[]>('/ai/saas-keys').pipe(map((res) => res.data));
  }

  setSaaSKey(data: { provider: string; apiKey: string; label?: string }): Observable<AiSaaSKey> {
    return this.api.post<AiSaaSKey>('/ai/saas-keys', data).pipe(map((res) => res.data));
  }

  deleteSaaSKey(id: string): Observable<{ id: string }> {
    return this.api.delete<{ id: string }>(`/ai/saas-keys/${id}`).pipe(map((res) => res.data));
  }
}
