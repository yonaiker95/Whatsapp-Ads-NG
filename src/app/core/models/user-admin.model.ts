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
