export type AiMode = 'saas' | 'byok';

export type AiStatus = 'not_configured' | 'connected' | 'error' | 'invalid';

export type AiProviderId =
  | 'gemini'
  | 'openai'
  | 'claude'
  | 'deepseek'
  | 'mistral'
  | 'openrouter'
  | 'azure';

export interface AiProviderModel {
  id: string;
  label: string;
  inputCost?: number;
  outputCost?: number;
}

export interface AiProviderInfo {
  id: AiProviderId;
  label: string;
  defaultBaseUrl?: string | null;
  models: AiProviderModel[];
  helpGuide: string[];
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
}

export interface AiConfig {
  id: string;
  mode: AiMode;
  provider: AiProviderId;
  model: string | null;
  apiKeyMasked: string;
  hasApiKey: boolean;
  baseUrl?: string | null;
  organization?: string | null;
  project?: string | null;
  status: AiStatus;
  lastError?: string | null;
  lastValidatedAt?: string | null;
  monthlyQuota: number;
  updatedAt: string;
}

export interface AiConfigFormData {
  mode: AiMode;
  provider: AiProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  project?: string;
  monthlyQuota?: number;
}

export interface AiUsageSummary {
  monthly: {
    saasCost: number;
    byokCost: number;
    totalCost: number;
    requests: number;
    ok: number;
    failed: number;
    inputTokens: number;
    outputTokens: number;
  };
  recent: AiUsageLog[];
}

export interface AiUsageLog {
  id: string;
  provider: string;
  model: string | null;
  mode: AiMode;
  action: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  status: 'ok' | 'error' | 'auth_error';
  createdAt: string;
}

export interface AiOverview {
  config: AiConfig | null;
  usage: AiUsageSummary;
  effective: { error?: string; mode?: AiMode; provider?: string } | null;
  providers: Array<{ id: AiProviderId; label: string; requiresApiKey: boolean; requiresBaseUrl: boolean }>;
  plan?: { aiQuota: number };
}

export interface AiSaaSKey {
  id: string;
  provider: AiProviderId;
  providerLabel: string;
  apiKeyMasked: string;
  label?: string | null;
  isActive: boolean;
  createdAt: string;
}
