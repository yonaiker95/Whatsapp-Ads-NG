export interface RegisteredUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  plan: string;
  billingStatus: string;
  phone?: string | null;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  notificationsEnabled: boolean;
  organizationId?: string | null;
  organizationName?: string | null;
  blocked: boolean;
  blockedAt?: string | null;
  blockedReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  instanceCount: number;
  sessionCount: number;
  addons?: UserAddon[];
}

export interface UserAddon {
  key: string;
  label: string;
  unitLabel: string;
  quantity: number;
  unitAmount: number;
  total: number;
}

export interface UserPlanOption {
  id: string;
  name: string;
  slug: string;
  priceMonthly: number;
  maxInstances: number;
  maxMessages: number;
  maxCampaigns: number;
  maxAutoReplies: number;
  chatbotEnabled: boolean;
  isActive: boolean;
}

export interface UserAddonCatalogOption {
  key: string;
  label: string;
  unitLabel: string;
  unitAmount: number;
  isActive: boolean;
}

export interface AdminUserDetail {
  user: RegisteredUser;
  plans: UserPlanOption[];
  addonCatalog: UserAddonCatalogOption[];
  monthly: number;
}

export interface PasswordResetResult {
  sent: boolean;
  delivered: boolean;
  noInstance?: boolean;
  url: string;
  maskedPhone?: string;
}

export interface BlockAuditEntry {
  id: string;
  actorId: string;
  actorName?: string | null;
  targetId: string;
  targetName?: string | null;
  action: 'block' | 'unblock';
  reason?: string | null;
  createdAt?: string;
}
