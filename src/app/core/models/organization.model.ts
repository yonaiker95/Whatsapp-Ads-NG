export interface Organization {
  id: string;
  name: string;
  description?: string | null;
  ownerId?: string;
  isOwner?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationMember {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions?: string[];
  organizationId?: string | null;
  createdAt?: string;
}

export interface OrganizationFormData {
  name: string;
  description?: string;
}

export interface OrganizationMemberFormData {
  name: string;
  email: string;
  password: string;
  permissions?: string[];
}

export interface PermissionOption {
  key: string;
  label: string;
  icon: string;
}

export const PERMISSION_OPTIONS: PermissionOption[] = [
  { key: 'instances', label: 'Gestionar instancias', icon: 'phone_android' },
  { key: 'campaigns', label: 'Campañas y envíos', icon: 'campaign' },
  { key: 'templates', label: 'Plantillas', icon: 'description' },
  { key: 'groups', label: 'Grupos', icon: 'groups' },
  { key: 'auto_replies', label: 'Auto-respuestas', icon: 'auto_awesome' },
  { key: 'chatbot', label: 'Chatbot', icon: 'smart_toy' },
  { key: 'ai_center', label: 'Centro de IA', icon: 'psychology' },
  { key: 'reports', label: 'Reportes y conversaciones', icon: 'analytics' },
  { key: 'billing', label: 'Facturación y plan', icon: 'receipt_long' },
  { key: 'organization', label: 'Organización y equipo', icon: 'diversity_3' },
  { key: 'messages', label: 'Envío manual de mensajes', icon: 'send' },
];

export function permissionLabel(key: string): string {
  return PERMISSION_OPTIONS.find((p) => p.key === key)?.label || key;
}

export function permissionIcon(key: string): string {
  return PERMISSION_OPTIONS.find((p) => p.key === key)?.icon || 'check_circle';
}
