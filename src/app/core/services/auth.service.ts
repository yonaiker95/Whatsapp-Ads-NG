import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { tap, map, switchMap } from 'rxjs/operators';
import { AuthState, User, LoginCredentials, RegisterCredentials, LoginResult, NextAuthSession, CsrfResponse, PhoneCodeResponse, ForgotSendResponse } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API_URL = '/api';

  readonly currentUser = signal<User | null>(null);
  readonly isAuthenticated = signal(false);

  constructor(private http: HttpClient, private router: Router) {
    this.restoreSession();
  }

  getAuthState(): AuthState {
    return { user: this.currentUser(), isAuthenticated: this.isAuthenticated() };
  }

  login(credentials: LoginCredentials): Observable<LoginResult> {
    return this.http.get<CsrfResponse>(`${this.API_URL}/auth/csrf`, { withCredentials: true }).pipe(
      switchMap((csrfRes) =>
        this.http.post<any>(
          `${this.API_URL}/auth/callback/credentials`,
          { ...credentials, csrfToken: csrfRes.csrfToken },
          { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
        )
      ),
      switchMap((resp) => {
        if (resp?.data?.requiresTwoFactor) {
          return of({
            requiresTwoFactor: true,
            token: resp.data.token,
            maskedPhone: resp.data.maskedPhone,
          } as LoginResult);
        }
        return this.fetchSession().pipe(
          tap((user) => this.setSession(user)),
          map((user) => ({ requiresTwoFactor: false, user } as LoginResult))
        );
      })
    );
  }

  verifyTwoFactor(token: string, code: string): Observable<User> {
    return this.http.post<any>(
      `${this.API_URL}/auth/two-factor/verify`,
      { token, code },
      { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
    ).pipe(
      switchMap(() => this.fetchSession()),
      tap((user) => this.setSession(user))
    );
  }

  resendTwoFactorCode(token: string): Observable<{ maskedPhone?: string }> {
    return this.http.post<any>(
      `${this.API_URL}/auth/two-factor/resend`,
      { token },
      { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
    );
  }

  register(credentials: RegisterCredentials): Observable<User> {
    return this.http.get<CsrfResponse>(`${this.API_URL}/auth/csrf`, { withCredentials: true }).pipe(
      switchMap((csrfRes) =>
        this.http.post<any>(
          `${this.API_URL}/auth/register`,
          { ...credentials, csrfToken: csrfRes.csrfToken },
          { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
        )
      ),
      switchMap(() => this.fetchSession()),
      tap((user) => this.setSession(user))
    );
  }

  sendPhoneCode(phone: string, purpose: 'register' | 'login' | 'password_reset' | 'phone_update' = 'register'): Observable<PhoneCodeResponse> {
    return this.http.post<PhoneCodeResponse>(
      `${this.API_URL}/auth/phone/send-code`,
      { phone, purpose },
      { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
    );
  }

  verifyPhoneCode(phone: string, code: string, purpose: 'register' | 'password_reset' | 'phone_update' = 'register'): Observable<{ verified: boolean }> {
    return this.http.post<any>(
      `${this.API_URL}/auth/phone/verify`,
      { phone, code, purpose },
      { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
    ).pipe(map((resp) => ({ verified: !!resp?.data?.verified })));
  }

  updatePhone(phone: string, code: string): Observable<{ phone: string; phoneVerified: boolean }> {
    return this.http.put<any>(
      `${this.API_URL}/auth/phone`,
      { phone, code },
      { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
    ).pipe(
      map((resp) => resp?.data || { phone, phoneVerified: true }),
      tap(() => {
        const user = this.currentUser();
        if (user) {
          this.currentUser.set({ ...user, phone, phoneVerified: true });
          localStorage.setItem('user', JSON.stringify({ ...user, phone, phoneVerified: true }));
        }
      })
    );
  }

  updateSettings(payload: { twoFactorEnabled?: boolean; notificationsEnabled?: boolean }): Observable<void> {
    return this.http.post<any>(
      `${this.API_URL}/auth/settings`,
      payload,
      { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
    ).pipe(
      tap(() => {
        const user = this.currentUser();
        if (user) {
          const updated = { ...user, ...(payload.twoFactorEnabled !== undefined ? { twoFactorEnabled: payload.twoFactorEnabled } : {}), ...(payload.notificationsEnabled !== undefined ? { notificationsEnabled: payload.notificationsEnabled } : {}) };
          this.currentUser.set(updated);
          localStorage.setItem('user', JSON.stringify(updated));
        }
      })
    );
  }

  forgotSend(email: string): Observable<ForgotSendResponse> {
    return this.http.post<ForgotSendResponse>(
      `${this.API_URL}/auth/forgot/send`,
      { email },
      { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
    );
  }

  forgotReset(token: string, code: string, password: string): Observable<void> {
    return this.http.post<any>(
      `${this.API_URL}/auth/forgot/reset`,
      { token, code, password },
      { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logout(): void {
    this.http.get(`${this.API_URL}/auth/signout`, { withCredentials: true }).subscribe({
      next: () => this.clearSession(),
      error: () => this.clearSession(),
    });
  }

  // Re-consulta la sesión del servidor y actualiza el estado local. Se usa tras
  // completar el onboarding (el usuario puede pasar de 'user' a 'owner').
  refreshSession(): Observable<User> {
    return this.fetchSession().pipe(
      tap((user) => this.setSession(user))
    );
  }

  private fetchSession(): Observable<User> {
    return this.http.get<NextAuthSession>(`${this.API_URL}/auth/session`, { withCredentials: true }).pipe(
      map((session) => {
        if (!session?.user?.email) {
          throw new Error('No session');
        }
        return {
          id: session.user.id || '',
          email: session.user.email || '',
          name: session.user.name || '',
          role: session.user.role || '',
          permissions: Array.isArray(session.user.permissions) ? session.user.permissions : [],
          phone: session.user.phone || null,
          phoneVerified: !!session.user.phoneVerified,
          twoFactorEnabled: !!session.user.twoFactorEnabled,
          notificationsEnabled: session.user.notificationsEnabled !== false,
          onboardingCompleted: !!session.user.onboardingCompleted,
          organizationId: session.user.organizationId || null,
        };
      })
    );
  }

  private restoreSession(): void {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        this.fetchSession().subscribe({
          next: (sessionUser) => {
            this.currentUser.set(sessionUser);
            localStorage.setItem('user', JSON.stringify(sessionUser));
          },
          error: () => this.clearSession(),
        });
      } catch {
        this.clearSession();
      }
    }
  }

  private setSession(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
    this.currentUser.set(user);
    this.isAuthenticated.set(true);
  }

  private clearSession(): void {
    localStorage.removeItem('user');
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
    this.router.navigate(['/auth/login']);
  }
}
