import { Campaign } from './campaign.model';
import { Plan } from './plan.model';

export interface DashboardMetrics {
  totalInstances: number;
  connectedInstances: number;
  totalGroups: number;
  totalCampaigns: number;
  activeCampaigns: number;
  sentCampaigns: number;
  totalSent: number;
  totalFailed: number;
  totalMessages: number;
  incomingMessages: number;
  responses: number;
  conversions: number;
  deliveredMessages: number;
  readMessages: number;
  weeklyData: Array<{ name: string; enviados: number; fallidos: number }>;
  recentCampaigns: Campaign[];
}

export interface BillingInfo {
  plan: string;
  planSlug?: string;
  status: 'active' | 'inactive' | 'trial' | 'overdue' | 'blocked';
  nextBillingDate: string | null;
  amount: number;
  basePrice?: number;
  addons?: UserAddon[];
  addonTotal?: number;
  currency: string;
  graceDays?: number;
  currentUsage: {
    messages: number;
    maxMessages: number;
    instances: number;
    maxInstances: number;
    campaigns: number;
    maxCampaigns: number;
    connectedInstances?: number;
    maxGroups?: number;
    maxAutoReplies?: number;
    chatbotEnabled?: boolean;
    aiQuota?: number;
  };
  invoices: Invoice[];
  paymentDestinations: PaymentDestination[];
}

export interface UserAddon {
  key: string;
  label: string;
  unitLabel: string;
  quantity: number;
  unitAmount: number;
  total: number;
}

export interface PlanAddonOption {
  key: string;
  label: string;
  unitLabel: string;
  unitAmount: number;
}

export interface PlanChangeInfo {
  plans: Plan[];
  addonCatalog: PlanAddonOption[];
  current: {
    planSlug: string;
    planName: string;
    basePrice: number;
    addons: UserAddon[];
    addonTotal: number;
    total: number;
  };
}

export interface Invoice {
  id: string;
  number: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
  period: string;
  dueDate?: string | null;
  paidAt?: string | null;
}

export type PaymentDestinationType = 'banco' | 'billetera' | 'pagomovil' | 'binance_usdt' | 'otro';

export interface PaymentDestination {
  id: string;
  type: PaymentDestinationType;
  customType: string | null;
  name: string;
  holder: string;
  detail: string;
  instructions: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface ReportedPayment {
  id: string;
  userId: string;
  userName: string;
  destinationId: string;
  destinationName: string;
  amount: number;
  reference: string;
  paymentDate: string;
  status: 'pending' | 'verified' | 'rejected';
  note: string;
  verifiedBy: string;
  verifiedAt: string;
  createdAt: string;
}