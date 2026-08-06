import { Template } from './template.model';
import { Instance } from './instance.model';
import { SendLog } from './chatbot.model';

export interface CampaignMetrics {
  totalGroups: number;
  sent: number;
  failed: number;
  pending: number;
  lastSentAt?: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'partial';
  active: boolean;
  scheduledAt?: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
  recurrenceConfig?: Record<string, unknown>;
  templateId?: string;
  template?: Template;
  instanceId: string;
  instance?: Instance;
  groupIds: string[];
  tags: string[];
  excludeTags: string[];
  metrics?: CampaignMetrics;
  startTime?: string;
  endTime?: string;
  intervalUnit?: string;
  intervalValue?: number;
  concurrence?: number;
  totalSent: number;
  totalFailed: number;
  createdAt: string;
  updatedAt: string;
  sentLogs?: SendLog[];
}

export interface CampaignFormData {
  name: string;
  description?: string;
  instanceId: string;
  groupIds: string[];
  tags: string[];
  excludeTags: string[];
  templateId?: string;
  scheduledAt?: string;
  recurrence?: string;
  recurrenceConfig?: Record<string, unknown>;
  startTime?: string;
  endTime?: string;
  intervalUnit?: string;
  intervalValue?: number;
  concurrence?: number;
  active: boolean;
  totalSent?: number;
  totalFailed?: number;
}