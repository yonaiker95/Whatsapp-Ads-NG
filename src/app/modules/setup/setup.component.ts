import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CountryCodeSelectorComponent } from '../../shared/components/country-code-selector/country-code-selector.component';
import { DEFAULT_COUNTRY, type Country } from '../../shared/components/country-code-selector/countries';

type StepKey = 'welcome' | 'database' | 'services' | 'admin' | 'installing';
type ProgressState = 'pending' | 'active' | 'done';

interface StepDef { key: StepKey; icon: string; label: string; }
interface TestResult { ok: boolean; error?: string; version?: string; willCreate?: boolean; }
interface ProgressItem { label: string; state: ProgressState; }

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    CountryCodeSelectorComponent,
  ],
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss'],
})
export class SetupComponent {
  readonly steps: StepDef[] = [
    { key: 'welcome', icon: 'rocket_launch', label: 'Bienvenida' },
    { key: 'database', icon: 'storage', label: 'Base de datos' },
    { key: 'services', icon: 'hub', label: 'Servicios externos' },
    { key: 'admin', icon: 'admin_panel_settings', label: 'Administrador' },
    { key: 'installing', icon: 'install_desktop', label: 'Instalación' },
  ];

  step: StepKey = 'welcome';
  installed = false;

  db = { host: 'localhost', port: 5432, user: 'postgres', password: '', database: '' };
  evolution = { url: 'http://localhost:3100', apiKey: '' };
  n8n = { url: 'http://localhost:5678', apiKey: '' };
  admin = { name: '', email: '', password: '', confirm: '', phone: '' };
  phoneCountry: Country = DEFAULT_COUNTRY;
  showPassword = false;

  dbTest: TestResult | null = null;
  dbTesting = false;
  evoTest: TestResult | null = null;
  evoTesting = false;
  n8nTest: TestResult | null = null;
  n8nTesting = false;

  installing = false;
  done = false;
  installError = '';
  adminEmail = '';
  progress: ProgressItem[] = [];

  constructor(private http: HttpClient, private router: Router) {
    this.checkStatus();
  }

  private async checkStatus(): Promise<void> {
    try {
      const resp: any = await firstValueFrom(this.http.get('/api/setup/status'));
      this.installed = resp?.installed === true;
    } catch {
      this.installed = true;
    }
  }

  get currentIdx(): number {
    return this.steps.findIndex((s) => s.key === this.step);
  }

  isComplete(key: StepKey): boolean {
    return this.steps.findIndex((s) => s.key === key) < this.currentIdx;
  }

  isStepBefore(key: StepKey): boolean {
    return this.steps.findIndex((s) => s.key === key) < this.currentIdx;
  }

  goToStep(key: StepKey): void {
    if (key === 'installing') return;
    if (this.isStepBefore(key) && !this.installing) {
      this.step = key;
    }
  }

  get emailInvalid(): boolean {
    const email = this.admin.email.trim();
    return email.length > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  }

  get fullPhone(): string {
    return '+' + this.phoneCountry.dial + (this.admin.phone || '').replace(/\D/g, '');
  }

  get dbValid(): boolean {
    return !!(this.db.host.trim() && this.db.database.trim() && this.db.user.trim());
  }

  get dbCanContinue(): boolean {
    return this.dbTest?.ok === true || this.dbTest?.willCreate === true;
  }

  get servicesCanContinue(): boolean {
    return (
      this.evolution.url.trim().length > 0 &&
      this.evolution.apiKey.trim().length > 0 &&
      this.n8n.url.trim().length > 0 &&
      this.n8n.apiKey.trim().length > 0
    );
  }

  get phoneValid(): boolean {
    return (this.admin.phone || '').replace(/\D/g, '').length >= 6;
  }

  get adminStepValid(): boolean {
    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.admin.email.trim());
    const nameOk = this.admin.name.trim().length > 0;
    const passOk = (this.admin.password || '').length >= 8;
    const confirmOk = this.admin.password === this.admin.confirm;
    return emailOk && nameOk && passOk && confirmOk && this.phoneValid;
  }

  passwordStrength(): { label: string; level: number; color: string } {
    const p = this.admin.password || '';
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Za-z]/.test(p) && /\d/.test(p)) score++;
    if (p.length >= 12 || (/[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p))) score++;
    const levels = [
      { label: 'Débil', level: 1, color: '#ef4444' },
      { label: 'Débil', level: 1, color: '#ef4444' },
      { label: 'Media', level: 2, color: '#f59e0b' },
      { label: 'Fuerte', level: 3, color: '#25D366' },
    ];
    return levels[Math.max(0, Math.min(score, 3))];
  }

  passwordErrors(): string[] {
    const errors: string[] = [];
    const p = this.admin.password || '';
    if (!p) return errors;
    if (p.length < 8) errors.push('Mínimo 8 caracteres');
    if (!/[A-Za-z]/.test(p)) errors.push('Debe incluir letras');
    if (!/\d/.test(p)) errors.push('Debe incluir números');
    if (this.admin.confirm && p !== this.admin.confirm) errors.push('Las contraseñas no coinciden');
    return errors;
  }

  async testDb(): Promise<void> {
    this.dbTesting = true;
    this.dbTest = null;
    try {
      const resp: any = await firstValueFrom(
        this.http.post('/api/setup/db-test', { db: this.db })
      );
      this.dbTest = { ok: !!resp.ok, error: resp.error, version: resp.version, willCreate: resp.willCreate };
    } catch (e) {
      this.dbTest = { ok: false, error: this.extractError(e) };
    } finally {
      this.dbTesting = false;
    }
  }

  async testService(type: 'evolution' | 'n8n'): Promise<void> {
    if (type === 'evolution') {
      this.evoTesting = true;
      this.evoTest = null;
      try {
        const resp: any = await firstValueFrom(
          this.http.post('/api/setup/test-service', { type, url: this.evolution.url, apiKey: this.evolution.apiKey })
        );
        this.evoTest = { ok: !!resp.ok, error: resp.error };
      } catch (e) {
        this.evoTest = { ok: false, error: this.extractError(e) };
      } finally {
        this.evoTesting = false;
      }
    } else {
      this.n8nTesting = true;
      this.n8nTest = null;
      try {
        const resp: any = await firstValueFrom(
          this.http.post('/api/setup/test-service', { type, url: this.n8n.url, apiKey: this.n8n.apiKey })
        );
        this.n8nTest = { ok: !!resp.ok, error: resp.error };
      } catch (e) {
        this.n8nTest = { ok: false, error: this.extractError(e) };
      } finally {
        this.n8nTesting = false;
      }
    }
  }

  async install(): Promise<void> {
    this.installing = true;
    this.installError = '';
    this.done = false;
    this.progress = [
      { label: 'Verificando y creando la base de datos', state: 'pending' },
      { label: 'Guardando configuración', state: 'pending' },
      { label: 'Creando tablas y esquema', state: 'pending' },
      { label: 'Creando cuenta de administrador', state: 'pending' },
    ];
    this.setProgress(0, 'active');

    const payload = {
      db: { ...this.db, port: Number(this.db.port) || 5432 },
      evolution: this.evolution,
      n8n: this.n8n,
      admin: { ...this.admin, phone: this.fullPhone },
    };

    try {
      const resp: any = await firstValueFrom(this.http.post('/api/setup/install', payload));
      this.progress = [
        { label: 'Verificando y creando la base de datos', state: 'done' },
        { label: 'Guardando configuración', state: 'done' },
        { label: 'Creando tablas y esquema', state: 'done' },
        { label: 'Creando cuenta de administrador', state: 'done' },
      ];
      this.adminEmail = resp?.adminEmail || this.admin.email.trim();
      this.done = true;
      this.step = 'installing';
      this.installed = true;
    } catch (e) {
      this.progress.forEach((p) => (p.state = 'pending'));
      this.installError = this.extractError(e);
      this.installing = false;
    }
  }

  private setProgress(idx: number, state: ProgressState): void {
    if (this.progress[idx]) this.progress[idx].state = state;
  }

  private extractError(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      const msg = e.error && (e.error.error || e.error.message);
      if (msg) return String(msg);
      return e.status ? `Error del servidor (HTTP ${e.status})` : 'No se pudo contactar al servidor.';
    }
    return String((e as Error)?.message || 'Error desconocido');
  }

  goLogin(): void {
    this.router.navigate(['/auth/login']);
  }
}
