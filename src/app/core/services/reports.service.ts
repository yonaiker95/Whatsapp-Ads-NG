import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { DashboardMetrics, Campaign, SendLog, ConversationSummary, ConversationMessage } from '../models';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  constructor(private api: ApiService) {}

  getDashboardMetrics(): Observable<DashboardMetrics> {
    return this.api.get<DashboardMetrics>('/metrics/dashboard').pipe(map((res) => res.data));
  }

  getCampaignAnalytics(campaignId: string): Observable<{ sent: number; failed: number; delivered: number; read: number }> {
    return this.api.get<{ sent: number; failed: number; delivered: number; read: number }>(`/analytics/campaign/${campaignId}`).pipe(map((res) => res.data));
  }

  getRecentCampaigns(): Observable<Campaign[]> {
    return this.api.get<Campaign[]>('/campaigns?limit=10').pipe(map((res) => res.data));
  }

  getSendLogs(campaignId: string): Observable<SendLog[]> {
    return this.api.get<SendLog[]>(`/campaigns/${campaignId}/logs`).pipe(map((res) => res.data));
  }

  getConversations(instanceId: string): Observable<ConversationSummary[]> {
    return this.api.get<ConversationSummary[]>(`/conversations?instanceId=${instanceId}`).pipe(map((res) => res.data));
  }

  syncConversations(instanceId: string): Observable<{ synced: number; created: number; updated: number; total: number }> {
    return this.api
      .post<{ synced: number; created: number; updated: number; total: number }>('/conversations/sync', { instanceId })
      .pipe(map((res) => res.data));
  }

  getConversationHistory(instanceId: string, senderJid: string): Observable<ConversationMessage[]> {
    return this.api.get<ConversationMessage[]>(`/conversations/history?instanceId=${instanceId}&senderJid=${senderJid}`).pipe(map((res) => res.data));
  }

  sendMessage(instanceId: string, to: string, text: string): Observable<ConversationMessage> {
    return this.api.post<ConversationMessage>('/messages/send', { instanceId, to, text }).pipe(map((res) => res.data));
  }
}