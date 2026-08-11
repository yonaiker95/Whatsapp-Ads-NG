import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, takeUntil } from 'rxjs';
import { AiCenterService } from '../../core/services/ai-center.service';
import { AuthService } from '../../core/services/auth.service';
import {
  AiConfig,
  AiConfigFormData,
  AiMode,
  AiOverview,
  AiProviderId,
  AiProviderInfo,
  AiUsageSummary,
  AiSaaSKey,
  GoogleOAuthConfig,
} from '../../core/models/ai-center.model';

const AI_DEFAULT_QUOTA = 20;

@Component({
  selector: 'app-ai-center',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatRadioModule,
    MatTabsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressSpinnerModule, MatProgressBarModule, MatChipsModule, MatDividerModule,
    MatExpansionModule, MatSnackBarModule, MatTableModule, MatTooltipModule,
  ],
  templateUrl: './ai-center.component.html',
  styleUrls: ['./ai-center.component.scss'],
})
export class AiCenterComponent implements OnInit, OnDestroy {
  private aiService = inject(AiCenterService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private destroy$ = new Subject<void>();

  loading = true;
  saving = false;
  validating = false;
  testing = false;

  overview: AiOverview | null = null;
  catalogue: AiProviderInfo[] = [];
  config: AiConfig | null = null;
  usage: AiUsageSummary | null = null;
  saasKeys: AiSaaSKey[] = [];

  // Estado editable del formulario
  mode: AiMode = 'saas';
  provider: AiProviderId = 'gemini';
  model = '';
  apiKey = '';
  baseUrl = '';
  organization = '';
  project = '';
  monthlyQuota = 20;

  // Resultados
  validationMessage = '';
  validationOk = false;
  testResult = '';

  usageColumns = ['action', 'provider', 'mode', 'tokens', 'cost', 'status', 'date'];

  // Admin: gestión de claves SaaS
  saasProvider: AiProviderId = 'gemini';
  saasApiKey = '';
  saasLabel = '';

  // Admin: credenciales OAuth de Google del sistema
  googleOAuth: GoogleOAuthConfig | null = null;
  googleOAuthLoading = false;
  googleOAuthSaving = false;
  googleClientId = '';
  googleClientSecret = '';

  get isAdmin(): boolean {
    const role = this.authService.currentUser()?.role;
    return role === 'admin' || role === 'owner';
  }

  get currentProvider(): AiProviderInfo | null {
    return this.catalogue.find((p) => p.id === this.provider) || null;
  }

  get requiresApiKey(): boolean {
    return true;
  }

  get requiresBaseUrl(): boolean {
    return this.provider === 'azure';
  }

  get providerModels(): string[] {
    const p = this.currentProvider;
    return p ? p.models.map((m) => m.id) : [];
  }

  get statusLabel(): string {
    if (!this.config) return 'Sin configurar';
    switch (this.config.status) {
      case 'connected': return 'Conectado';
      case 'error': return 'Error de conexión';
      case 'invalid': return 'Error de autenticación';
      default: return 'Sin configurar';
    }
  }

  get quotaPercent(): number {
    if (!this.usage) return 0;
    const quota = this.saasQuota;
    if (quota <= 0) return 0;
    return Math.min(100, Math.round((this.usage.monthly.saasCost / quota) * 100));
  }

  // En modo SaaS el límite lo define el plan contratado (incluye add-ons de cuota).
  // En modo BYOK el usuario puede fijar su propio límite de referencia.
  get saasQuota(): number {
    if (this.mode === 'saas' && this.overview?.plan?.aiQuota != null) {
      return Math.max(0, Number(this.overview.plan.aiQuota));
    }
    return Math.max(0, this.config?.monthlyQuota || AI_DEFAULT_QUOTA);
  }

  ngOnInit(): void {
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAll(): void {
    this.loading = true;
    this.aiService.getCatalogue().subscribe({
      next: (c) => {
        this.catalogue = c;
        this.loadOverview();
      },
      error: () => {
        this.loading = false;
      },
    });
    if (this.isAdmin) this.loadSaaSKeys();
    if (this.isAdmin) this.loadGoogleOAuthConfig();
  }

  loadOverview(): void {
    this.aiService.getOverview()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (overview) => {
          this.overview = overview;
          this.config = overview.config;
          this.usage = overview.usage;
          if (overview.config) {
            this.mode = overview.config.mode;
            this.provider = overview.config.provider;
            this.model = overview.config.model || this.providerModels[0] || '';
            this.baseUrl = overview.config.baseUrl || '';
            this.organization = overview.config.organization || '';
            this.project = overview.config.project || '';
            this.monthlyQuota = overview.config.monthlyQuota;
          } else {
            this.mode = 'saas';
            this.provider = 'gemini';
            this.model = this.providerModels[0] || '';
            this.baseUrl = '';
            this.organization = '';
            this.project = '';
            this.monthlyQuota = 20;
          }
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  loadSaaSKeys(): void {
    this.aiService.getSaaSKeys()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (keys) => { this.saasKeys = keys; },
        error: () => { this.saasKeys = []; },
      });
  }

  onModeChange(): void {
    this.validationMessage = '';
    this.testResult = '';
  }

  onProviderChange(): void {
    this.apiKey = '';
    this.validationMessage = '';
    this.testResult = '';
    const p = this.currentProvider;
    if (p && p.requiresBaseUrl && !this.baseUrl) {
      this.baseUrl = p.defaultBaseUrl || '';
    }
    if (!p?.requiresBaseUrl) this.baseUrl = '';
    if (!this.providerModels.includes(this.model)) {
      this.model = this.providerModels[0] || '';
    }
  }

  saveConfig(): void {
    if (this.mode === 'byok' && this.requiresApiKey && !this.apiKey && !this.config?.hasApiKey) {
      this.snackBar.open('Ingresa tu API Key en modo BYOK', 'Cerrar', { duration: 4000 });
      return;
    }
    this.saving = true;
    const data: AiConfigFormData = {
      mode: this.mode,
      provider: this.provider,
      model: this.model,
      apiKey: this.apiKey || undefined,
      baseUrl: this.baseUrl || undefined,
      organization: this.organization || undefined,
      project: this.project || undefined,
      monthlyQuota: this.monthlyQuota,
    };
    this.aiService.saveConfig(data)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (config) => {
          this.saving = false;
          this.config = config;
          this.apiKey = '';
          this.snackBar.open('Configuración de IA guardada', 'Cerrar', { duration: 4000 });
        },
        error: (err) => {
          this.saving = false;
          this.snackBar.open(err?.error?.error || 'Error al guardar', 'Cerrar', { duration: 5000 });
        },
      });
  }

  validateConnection(): void {
    this.validating = true;
    this.validationMessage = '';
    this.validationOk = false;
    this.aiService.validate({
      provider: this.provider,
      apiKey: this.apiKey || undefined,
      baseUrl: this.baseUrl || undefined,
      project: this.project || undefined,
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.validating = false;
          this.validationOk = res.ok;
          this.validationMessage = res.ok ? `${res.label || this.currentProvider?.label} conectado correctamente` : 'No se pudo conectar';
        },
        error: (err) => {
          this.validating = false;
          this.validationOk = false;
          this.validationMessage = err?.error?.error || 'Error de conexión';
        },
      });
  }

  testAi(): void {
    this.testing = true;
    this.testResult = '';
    this.aiService.test()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.testing = false;
          this.testResult = res.text;
        },
        error: (err) => {
          this.testing = false;
          this.snackBar.open(err?.error?.error || 'Error al probar la IA', 'Cerrar', { duration: 5000 });
        },
      });
  }

  rotateKey(): void {
    if (!this.apiKey) {
      this.snackBar.open('Ingresa la nueva API Key', 'Cerrar', { duration: 4000 });
      return;
    }
    this.aiService.rotateKey(this.apiKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.apiKey = '';
          this.snackBar.open('API Key rotada correctamente', 'Cerrar', { duration: 4000 });
          this.loadOverview();
        },
        error: (err) => {
          this.snackBar.open(err?.error?.error || 'Error al rotar la clave', 'Cerrar', { duration: 5000 });
        },
      });
  }

  // ---- Admin: claves del sistema (SaaS) ----
  saveSaaSKey(): void {
    if (!this.saasApiKey) {
      this.snackBar.open('Ingresa la API Key del sistema', 'Cerrar', { duration: 4000 });
      return;
    }
    this.aiService.setSaaSKey({ provider: this.saasProvider, apiKey: this.saasApiKey, label: this.saasLabel || undefined })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.saasApiKey = '';
          this.saasLabel = '';
          this.snackBar.open('Clave del sistema guardada', 'Cerrar', { duration: 4000 });
          this.loadSaaSKeys();
        },
        error: (err) => {
          this.snackBar.open(err?.error?.error || 'Error al guardar la clave', 'Cerrar', { duration: 5000 });
        },
      });
  }

  removeSaaSKey(key: AiSaaSKey): void {
    this.aiService.deleteSaaSKey(key.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open('Clave del sistema eliminada', 'Cerrar', { duration: 4000 });
          this.loadSaaSKeys();
        },
        error: (err) => {
          this.snackBar.open(err?.error?.error || 'Error al eliminar', 'Cerrar', { duration: 5000 });
        },
      });
  }

  // ---- Admin: credenciales OAuth de Google ----
  loadGoogleOAuthConfig(): void {
    this.googleOAuthLoading = true;
    this.aiService.getGoogleOAuthConfig()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cfg) => {
          this.googleOAuth = cfg;
          this.googleOAuthLoading = false;
        },
        error: () => {
          this.googleOAuthLoading = false;
        },
      });
  }

  saveGoogleOAuthConfig(): void {
    const clientId = this.googleClientId.trim();
    const clientSecret = this.googleClientSecret.trim();
    if (!clientId || !clientSecret) {
      this.snackBar.open('Ingresa el Client ID y el Client Secret de Google', 'Cerrar', { duration: 4000 });
      return;
    }
    this.googleOAuthSaving = true;
    this.aiService.setGoogleOAuthConfig({ clientId, clientSecret })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.googleOAuthSaving = false;
          this.googleClientId = '';
          this.googleClientSecret = '';
          this.snackBar.open('Credenciales de Google guardadas. Ya puedes conectar cuentas en el módulo Chatbot', 'Cerrar', { duration: 5000 });
          this.loadGoogleOAuthConfig();
        },
        error: (err) => {
          this.googleOAuthSaving = false;
          this.snackBar.open(err?.error?.error || 'Error al guardar las credenciales', 'Cerrar', { duration: 5000 });
        },
      });
  }

  clearGoogleOAuthConfig(): void {
    this.aiService.clearGoogleOAuthConfig()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open('Credenciales de Google eliminadas', 'Cerrar', { duration: 4000 });
          this.loadGoogleOAuthConfig();
        },
        error: (err) => {
          this.snackBar.open(err?.error?.error || 'Error al eliminar', 'Cerrar', { duration: 5000 });
        },
      });
  }

  providerLabel(id: string): string {
    return this.catalogue.find((p) => p.id === id)?.label || id;
  }

  providerModelLabel(id: string): string {
    const p = this.currentProvider;
    const m = p?.models.find((mm) => mm.id === id);
    return m ? m.label : id;
  }

  actionLabel(action: string): string {
    switch (action) {
      case 'chatbot': return 'Chatbot';
      case 'test': return 'Prueba';
      default: return action;
    }
  }

  quotaColor(percent: number): string {
    if (percent >= 90) return 'warn';
    if (percent >= 70) return 'accent';
    return 'primary';
  }
}
