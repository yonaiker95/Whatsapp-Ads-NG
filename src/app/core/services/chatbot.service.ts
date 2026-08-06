import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { ChatbotConfig, ChatbotConfigFormData, ChatbotPaused, ConversationSummary, ConversationMessage } from '../models/chatbot.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  constructor(private api: ApiService) {}

  getConfig(instanceId: string): Observable<ChatbotConfig> {
    return this.api.get<ChatbotConfig>(`/chatbot/config/${instanceId}`).pipe(map((res) => res.data));
  }

  saveConfig(data: ChatbotConfigFormData): Observable<ChatbotConfig> {
    return this.api.post<ChatbotConfig>('/chatbot/config', data).pipe(map((res) => res.data));
  }

  toggleChat(instanceId: string, senderJid: string, paused: boolean): Observable<void> {
    return this.api.post<void>(`/chatbot/pause`, { instanceId, senderJid, paused }).pipe(map((res) => res.data));
  }

  getPausedChats(instanceId: string): Observable<ChatbotPaused[]> {
    return this.api.get<ChatbotPaused[]>(`/chatbot/paused?instanceId=${instanceId}`).pipe(map((res) => res.data));
  }

  removePausedChat(instanceId: string, senderJid: string): Observable<void> {
    return this.api.delete<void>(`/chatbot/paused?instanceId=${instanceId}&senderJid=${senderJid}`).pipe(map((res) => res.data));
  }

  getConversations(instanceId: string): Observable<ConversationSummary[]> {
    return this.api.get<ConversationSummary[]>(`/conversations?instanceId=${instanceId}`).pipe(map((res) => res.data));
  }

  getConversationHistory(instanceId: string, senderJid: string): Observable<ConversationMessage[]> {
    return this.api.get<ConversationMessage[]>(`/conversations/history?instanceId=${instanceId}&senderJid=${senderJid}`).pipe(map((res) => res.data));
  }
}