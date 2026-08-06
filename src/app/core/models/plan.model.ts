export interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  cta: string;
  popular?: boolean;
  color: string;
  isActive?: boolean;
  sortOrder: number;
  maxInstances?: number;
  maxMessages?: number;
  maxCampaigns?: number;
  maxGroups?: number;
  maxAutoReplies?: number;
  chatbotEnabled?: boolean;
  aiQuota?: number;
  createdAt?: string;
}

export interface PlanFormData {
  name: string;
  slug?: string;
  description?: string;
  priceMonthly?: number;
  priceYearly?: number;
  features?: string[];
  cta?: string;
  popular?: boolean;
  color?: string;
  isActive?: boolean;
  sortOrder?: number;
  maxInstances?: number;
  maxMessages?: number;
  maxCampaigns?: number;
  maxGroups?: number;
  maxAutoReplies?: number;
  chatbotEnabled?: boolean;
  aiQuota?: number;
}

// Precio configurable de un adicional (add-on) del catálogo global.
export interface PlanAddonPrice {
  key: string;
  label: string;
  unitLabel: string;
  unitAmount: number;
  isActive?: boolean;
  sortOrder?: number;
}
