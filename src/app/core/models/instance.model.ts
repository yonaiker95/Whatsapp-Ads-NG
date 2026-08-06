export interface Instance {
  id: string;
  name: string;
  evolutionUrl: string | null;
  apiKey: string | null;
  phone?: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'qrcoded';
  evolutionInstanceId?: string;
  verificationRole?: string;
  groups_count?: number;
  groups?: unknown[];
  userId?: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstanceFormData {
  name: string;
  phone?: string;
  verificationRole?: string;
}

export const VERIFICATION_ROLE_LABELS: Record<string, string> = {
  otp: 'Verificación OTP',
  password: 'Recuperar contraseña',
  other: 'Otras verificaciones',
  all: 'Todas',
};