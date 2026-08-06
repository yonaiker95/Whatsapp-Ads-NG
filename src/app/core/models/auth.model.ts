export interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  permissions?: string[];
  phone?: string | null;
  phoneVerified?: boolean;
  twoFactorEnabled?: boolean;
  notificationsEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  name: string;
  email: string;
  password: string;
  phone: string;
  code: string;
}

export interface LoginResult {
  requiresTwoFactor: boolean;
  token?: string;
  maskedPhone?: string;
  user?: User;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

export interface NextAuthSession {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
    permissions?: string[];
    phone?: string | null;
    phoneVerified?: boolean;
    twoFactorEnabled?: boolean;
    notificationsEnabled?: boolean;
  };
  expires: string;
}

export interface CsrfResponse {
  csrfToken: string;
}

export interface PhoneCodeResponse {
  data?: {
    sent?: boolean;
    maskedPhone?: string;
    delivered?: boolean;
  };
  success?: boolean;
  error?: string;
}

export interface ForgotSendResponse {
  data?: {
    sent?: boolean;
    token?: string;
    maskedPhone?: string;
  };
  success?: boolean;
  error?: string;
}
