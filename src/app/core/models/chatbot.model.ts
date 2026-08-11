export interface PriceItem {
  name: string;
  price?: string;
  description?: string;
}

export interface ChatbotConfig {
  id: string;
  instanceId: string;
  instance?: { name: string };
  isActive: boolean;
  systemPrompt: string;
  companyInfo?: string;
  priceList?: PriceItem[];
  calendar?: string;
  maxTokens: number;
  temperature: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatbotConfigFormData {
  instanceId: string;
  isActive: boolean;
  systemPrompt: string;
  companyInfo?: string;
  priceList?: PriceItem[];
  calendar?: string;
  maxTokens: number;
  temperature: number;
}

export interface ChatbotPaused {
  id: string;
  instanceId: string;
  instanceName?: string;
  senderJid: string;
  createdAt: string;
}

export interface BotDocument {
  id: string;
  instanceId: string;
  title: string;
  status: string;
  error?: string | null;
  source?: string;
  sourceRef?: string | null;
  sourceUrl?: string | null;
  chunkCount: number;
  charCount: number;
  createdAt: string;
  updatedAt: string;
}

export type GoogleSourceType = 'sheet' | 'docs' | 'calendar';

export interface GoogleConnectionStatus {
  connected: boolean;
  email?: string | null;
}

export interface GoogleAuthUrl {
  url: string;
}

export interface GoogleFileItem {
  id: string;
  name: string;
  mimeType?: string;
}

export interface GoogleCalendarItem {
  id: string;
  summary: string;
  primary?: boolean;
}

export interface GoogleSources {
  sheetId: string;
  sheetName: string;
  sheetRange: string;
  docIds: string[];
  calendarId: string;
  calendarDays: number;
}

export interface BotDocumentQueryResult {
  title?: string | null;
  content: string;
  score: number;
}

export interface ConversationMessage {
  id: string;
  senderName: string;
  senderJid: string;
  content: string;
  direction: 'incoming' | 'outgoing';
  status: string;
  createdAt: string;
}

export interface ConversationSummary {
  senderJid: string;
  senderName: string;
  lastMessage: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface SendLog {
  id: string;
  campaignId: string;
  sent: number;
  failed: number;
  createdAt: string;
}