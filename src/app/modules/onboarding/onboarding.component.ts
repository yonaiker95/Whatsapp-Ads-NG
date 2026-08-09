import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, interval, switchMap } from 'rxjs';
import { OrganizationService } from '../../core/services/organization.service';
import { OnboardingService } from '../../core/services/onboarding.service';
import { AuthService } from '../../core/services/auth.service';
import { InstanceService } from '../../core/services/instance.service';
import { CampaignService } from '../../core/services/campaign.service';
import { Instance } from '../../core/models/instance.model';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, MatCardModule, MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
    <div class="onboarding-page">
      <div class="ob-bg-shapes">
        <div class="shape shape-1"></div>
        <div class="shape shape-2"></div>
      </div>

      <div class="ob-container">
        <div class="ob-brand">
          <div class="brand-icon">
            <mat-icon>rocket_launch</mat-icon>
          </div>
          <h1>Configura tu espacio</h1>
          <p class="brand-subtitle">Completa estos pasos y empieza a automatizar</p>
        </div>

        <div class="ob-stepper" aria-label="Progreso del onboarding">
          <div class="step" *ngFor="let s of steps; let i = index" [class.active]="i === currentStep" [class.done]="i < currentStep">
            <div class="step-dot">
              <mat-icon *ngIf="i < currentStep">check</mat-icon>
              <span *ngIf="i >= currentStep">{{ i + 1 }}</span>
            </div>
            <span class="step-label">{{ s }}</span>
          </div>
        </div>

        <mat-card class="ob-card">
          <!-- STEP 1: Organización (crear o unirse) -->
          <div *ngIf="currentStep === 0">
            @if (joinMode) {
              <div class="step-header">
                <mat-icon>groups</mat-icon>
                <div>
                  <h2>{{ isOrgOwner ? 'Tu organización está lista' : 'Únete a tu organización' }}</h2>
                  <p *ngIf="!isOrgOwner">Tu equipo ya tiene un espacio configurado. Te unirás a <strong>{{ existingOrgName }}</strong>.</p>
                  <p *ngIf="isOrgOwner">Tu espacio <strong>{{ existingOrgName }}</strong> ya está creado. Continúa para terminar tu configuración.</p>
                </div>
              </div>
            } @else {
              <div class="step-header">
                <mat-icon>domain</mat-icon>
                <div>
                  <h2>Tu organización</h2>
                  <p>¿Cómo se llama tu empresa o proyecto?</p>
                </div>
              </div>
              <form [formGroup]="orgForm" class="ob-form">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Nombre de la organización *</mat-label>
                  <input matInput formControlName="name" placeholder="Ej: Agencia Andina" autocomplete="organization">
                  <mat-error *ngIf="orgForm.get('name')?.hasError('required')">El nombre es requerido</mat-error>
                  <mat-error *ngIf="orgForm.get('name')?.hasError('minlength')">Mínimo 2 caracteres</mat-error>
                </mat-form-field>
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Descripción</mat-label>
                  <textarea matInput formControlName="description" rows="2" placeholder="Opcional. ¿A qué se dedica tu organización?"></textarea>
                </mat-form-field>
              </form>
            }
          </div>

          <!-- STEP 2: Usuario del equipo -->
          <div *ngIf="currentStep === 1">
            <div class="step-header">
              <mat-icon>group_add</mat-icon>
              <div>
                <h2>Invita a tu equipo</h2>
                <p>Crea el primer miembro de tu organización. Puedes saltarte este paso.</p>
              </div>
            </div>
            <form [formGroup]="memberForm" class="ob-form">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Nombre *</mat-label>
                <input matInput formControlName="name" placeholder="Ej: Ana Torres" autocomplete="name">
                <mat-error *ngIf="memberForm.get('name')?.hasError('required')">El nombre es requerido</mat-error>
                <mat-error *ngIf="memberForm.get('name')?.hasError('minlength')">Mínimo 2 caracteres</mat-error>
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Correo electrónico *</mat-label>
                <input matInput type="email" formControlName="email" placeholder="ana@tuempresa.com" autocomplete="email">
                <mat-error *ngIf="memberForm.get('email')?.hasError('required')">El correo es requerido</mat-error>
                <mat-error *ngIf="memberForm.get('email')?.hasError('email')">Ingresa un correo válido</mat-error>
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Contraseña *</mat-label>
                <input matInput [type]="hidePassword ? 'password' : 'text'" formControlName="password" autocomplete="new-password" placeholder="••••••••">
                <mat-error *ngIf="memberForm.get('password')?.hasError('required')">La contraseña es requerida</mat-error>
                <mat-error *ngIf="memberForm.get('password')?.hasError('minlength')">Mínimo 6 caracteres</mat-error>
              </mat-form-field>
            </form>
          </div>

          <!-- STEP 3: Conectar WhatsApp -->
          <div *ngIf="currentStep === 2">
            <div class="step-header">
              <mat-icon>phone_android</mat-icon>
              <div>
                <h2>Conecta WhatsApp</h2>
                <p>Vincula una instancia escaneando el código QR desde tu teléfono.</p>
              </div>
            </div>

            <form [formGroup]="instanceForm" class="ob-form" *ngIf="!instance">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Nombre de la instancia *</mat-label>
                <input matInput formControlName="name" placeholder="Ej: WhatsApp Ventas" autocomplete="off">
                <mat-error *ngIf="instanceForm.get('name')?.hasError('required')">El nombre es requerido</mat-error>
                <mat-error *ngIf="instanceForm.get('name')?.hasError('minlength')">Mínimo 3 caracteres</mat-error>
              </mat-form-field>
            </form>

            <div class="ob-qr" *ngIf="instance">
              @if (connected) {
                <div class="qr-connected">
                  <mat-icon>check_circle</mat-icon>
                  <h3>¡Conectado!</h3>
                  <p>La instancia "{{ instance.name }}" se vinculó correctamente a WhatsApp.</p>
                </div>
              } @else if (qrCode) {
                <div class="qr-image">
                  <img [src]="qrCode" alt="Código QR para conectar WhatsApp">
                </div>
                <p class="qr-instructions">
                  1. Abre WhatsApp en tu teléfono<br>
                  2. Ve a Dispositivos vinculados → Vincular dispositivo<br>
                  3. Escanea este código QR
                </p>
                <p class="qr-note">El código se actualiza automáticamente. Estado: {{ statusLabel }}</p>
              } @else {
                <div class="qr-loading">
                  <mat-spinner diameter="40"></mat-spinner>
                  <p>Generando código QR...</p>
                </div>
              }
            </div>
          </div>

          <!-- STEP 4: Crear campaña -->
          <div *ngIf="currentStep === 3">
            <div class="step-header">
              <mat-icon>campaign</mat-icon>
              <div>
                <h2>Tu primera campaña</h2>
                <p>Crea una campaña en borrador. Podrás editarla y lanzarla cuando quieras.</p>
              </div>
            </div>
            <form [formGroup]="campaignForm" class="ob-form">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Nombre de la campaña *</mat-label>
                <input matInput formControlName="name" placeholder="Ej: Bienvenida nuevos clientes">
                <mat-error *ngIf="campaignForm.get('name')?.hasError('required')">El nombre es requerido</mat-error>
                <mat-error *ngIf="campaignForm.get('name')?.hasError('minlength')">Mínimo 3 caracteres</mat-error>
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Descripción</mat-label>
                <textarea matInput formControlName="description" rows="2" placeholder="Opcional. ¿Cuál es el objetivo de la campaña?"></textarea>
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width" *ngIf="instance">
                <mat-label>Instancia</mat-label>
                <input matInput [value]="instance.name" readonly>
              </mat-form-field>
              <p class="ob-hint" *ngIf="!instance">
                <mat-icon>info</mat-icon> No tienes una instancia conectada. La campaña se creará sin instancia; podrás asignarla después.
              </p>
            </form>
          </div>

          <mat-card-actions class="ob-actions">
            <button mat-button type="button" (click)="goBack()" *ngIf="currentStep > 0" [disabled]="busy">
              <mat-icon>arrow_back</mat-icon> Atrás
            </button>
            <button mat-button type="button" (click)="skipStep()" *ngIf="currentStep > 0" [disabled]="busy">
              Saltar paso
            </button>
            <span class="spacer"></span>
            <button mat-raised-button color="primary" (click)="nextStep()" [disabled]="busy || !isStepValid()">
              <mat-spinner diameter="18" *ngIf="busy"></mat-spinner>
              <span *ngIf="!busy">
                {{ currentStep === steps.length - 1 ? 'Finalizar' : 'Continuar' }}
                <mat-icon>arrow_forward</mat-icon>
              </span>
            </button>
          </mat-card-actions>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .onboarding-page { min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%); padding: 48px 24px; position: relative; overflow: hidden; }
    .ob-bg-shapes { position: absolute; inset: 0; pointer-events: none; }
    .ob-bg-shapes .shape { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.15; }
    .ob-bg-shapes .shape-1 { width: 420px; height: 420px; top: -120px; right: -60px; background: radial-gradient(circle, #25D366, transparent); animation: floatShape 20s ease-in-out infinite; }
    .ob-bg-shapes .shape-2 { width: 360px; height: 360px; bottom: -100px; left: -100px; background: radial-gradient(circle, #128C7E, transparent); animation: floatShape 25s ease-in-out infinite reverse; }
    @keyframes floatShape { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(30px, -30px) scale(1.1); } 66% { transform: translate(-20px, 20px) scale(0.9); } }

    .ob-container { width: 100%; max-width: 560px; position: relative; z-index: 1; animation: fadeInUp 0.6s ease-out; }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

    .ob-brand { text-align: center; margin-bottom: 28px; }
    .ob-brand .brand-icon { width: 64px; height: 64px; border-radius: 20px; background: linear-gradient(135deg, #25D366, #128C7E); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; box-shadow: 0 8px 32px rgba(37, 211, 102, 0.3); }
    .ob-brand .brand-icon mat-icon { font-size: 32px; width: 32px; height: 32px; color: white; }
    .ob-brand h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; color: #ffffff; }
    .ob-brand .brand-subtitle { margin: 0; color: rgba(255, 255, 255, 0.6); font-size: 14px; }

    .ob-stepper { display: flex; justify-content: space-between; margin-bottom: 24px; padding: 0 8px; }
    .ob-stepper .step { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; }
    .ob-stepper .step-dot { width: 34px; height: 34px; border-radius: 50%; background: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.6); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; transition: all 0.25s ease; }
    .ob-stepper .step-dot mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .ob-stepper .step.active .step-dot { background: #25D366; color: #062e1e; box-shadow: 0 0 0 4px rgba(37, 211, 102, 0.25); }
    .ob-stepper .step.done .step-dot { background: #128C7E; color: white; }
    .ob-stepper .step-label { font-size: 12px; color: rgba(255, 255, 255, 0.5); text-align: center; }
    .ob-stepper .step.active .step-label, .ob-stepper .step.done .step-label { color: rgba(255, 255, 255, 0.9); }

    .ob-card { padding: 32px 28px; border-radius: var(--radius-lg, 16px); background: rgba(255, 255, 255, 0.97); backdrop-filter: blur(20px); box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35); }
    .step-header { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 22px; }
    .step-header > mat-icon { font-size: 32px; width: 44px; height: 44px; border-radius: 12px; background: #e0f2fe; color: #0369a1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .step-header h2 { margin: 0 0 4px; font-size: 20px; font-weight: 700; color: var(--text-primary, #111827); }
    .step-header p { margin: 0; font-size: 13px; color: var(--text-secondary, #6b7280); }
    .ob-form { display: flex; flex-direction: column; gap: 8px; }
    .full-width { width: 100%; }

    .ob-qr { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px 8px; text-align: center; }
    .ob-qr .qr-image img { max-width: 280px; height: auto; border: 1px solid #e5e7eb; border-radius: 12px; background: white; }
    .ob-qr .qr-instructions { color: #4b5563; line-height: 1.8; margin: 0; font-size: 14px; }
    .ob-qr .qr-note { font-size: 13px; color: #9ca3af; margin: 0; }
    .ob-qr .qr-loading { display: flex; flex-direction: column; align-items: center; gap: 14px; color: #6b7280; padding: 40px 0; }
    .ob-qr .qr-connected { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 0; }
    .ob-qr .qr-connected mat-icon { font-size: 56px; width: 56px; height: 56px; color: #22c55e; }
    .ob-qr .qr-connected h3 { margin: 0; font-size: 20px; color: #111827; }
    .ob-qr .qr-connected p { margin: 0; color: #6b7280; font-size: 14px; }

    .ob-hint { display: flex; align-items: center; gap: 8px; margin: 4px 0 0; font-size: 13px; color: #9ca3af; }
    .ob-hint mat-icon { font-size: 18px; width: 18px; height: 18px; }

    .ob-actions { display: flex; align-items: center; gap: 8px; margin: 8px -8px -8px; padding: 16px 0 0; }
    .ob-actions .spacer { flex: 1; }
    .ob-actions mat-spinner { display: inline-block; margin-right: 8px; }
    .ob-actions button[mat-raised-button] mat-icon { margin-left: 6px; }

    .ob-skip-all { text-align: center; margin: 20px 0 0; }
    .ob-skip-all a { color: rgba(255, 255, 255, 0.7); font-size: 13px; text-decoration: none; }
    .ob-skip-all a:hover { color: #25D366; text-decoration: underline; }

    @media (max-width: 520px) {
      .onboarding-page { padding: 32px 16px; }
      .ob-card { padding: 24px 18px; }
      .ob-stepper .step-label { font-size: 11px; }
    }
  `],
})
export class OnboardingComponent implements OnInit, OnDestroy {
  steps = ['Organización', 'Equipo', 'WhatsApp', 'Campaña'];
  currentStep = 0;
  busy = false;
  hidePassword = true;
  joinMode = false;
  isOrgOwner = false;
  existingOrgName = '';

  orgForm: FormGroup;
  memberForm: FormGroup;
  instanceForm: FormGroup;
  campaignForm: FormGroup;

  instance: Instance | null = null;
  qrCode: string | null = null;
  connected = false;
  status = 'connecting';
  statusLabel = 'Conectando...';

  private poll: Subscription | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private snackBar: MatSnackBar,
    private organizationService: OrganizationService,
    private onboardingService: OnboardingService,
    private authService: AuthService,
    private instanceService: InstanceService,
    private campaignService: CampaignService
  ) {
    this.orgForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
    });
    this.memberForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
    this.instanceForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
    });
    this.campaignForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
    });
  }

  ngOnInit(): void {
    this.onboardingService.getStatus().subscribe({
      next: (status) => {
        if (status.completed) {
          this.router.navigate(['/app/dashboard']);
          return;
        }
        // Si la organización ya existe (miembro invitado por el owner) el primer
        // paso es unirse en lugar de crearla, y no se muestra el paso de equipo.
        this.joinMode = !!status.hasOrganization;
        this.isOrgOwner = !!status.isOwner;
        this.existingOrgName = status.organization?.name || '';
        if (this.joinMode) {
          this.steps = ['Organización', 'WhatsApp', 'Campaña'];
        }
      },
      error: () => {},
    });
    this.instanceService.getAll().subscribe({
      next: (instances) => {
        const connected = instances.find((i) => i.status === 'connected');
        if (connected) {
          this.instance = connected;
          this.connected = true;
        } else if (instances.length > 0) {
          this.instance = instances[0];
          if (this.instance.status === 'connecting' || this.instance.status === 'qrcoded') {
            this.startPolling();
          }
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      connected: 'Conectado',
      connecting: 'Conectando...',
      disconnected: 'Desconectado',
      qrcoded: 'QR generado',
    };
    return labels[status] || status;
  }

  isStepValid(): boolean {
    const label = this.steps[this.currentStep];
    if (label === 'Organización') return this.joinMode ? true : this.orgForm.valid;
    if (label === 'Equipo') return true;
    if (label === 'WhatsApp') return this.instance ? true : this.instanceForm.valid;
    if (label === 'Campaña') return true;
    return false;
  }

  goBack(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  skipStep(): void {
    if (this.busy) return;
    const label = this.steps[this.currentStep];
    if (label === 'Campaña') {
      this.finishOnboarding();
      return;
    }
    if (label === 'Equipo' || label === 'WhatsApp') {
      this.currentStep = Math.min(this.currentStep + 1, this.steps.length - 1);
    }
  }

  nextStep(): void {
    if (this.busy) return;
    const label = this.steps[this.currentStep];
    if (label === 'Organización') {
      this.completeOrganizationStep();
    } else if (label === 'Equipo') {
      this.addMember();
    } else if (label === 'WhatsApp') {
      this.setupInstance();
    } else if (label === 'Campaña') {
      this.createCampaign();
    }
  }

  // Paso 1: crea la organización (primer usuario -> se convierte en owner) o
  // une al usuario a la organización existente de su equipo.
  completeOrganizationStep(): void {
    if (!this.joinMode && this.orgForm.invalid) {
      this.orgForm.markAllAsTouched();
      return;
    }
    this.busy = true;
    const value = this.orgForm.value;
    this.onboardingService.complete(this.joinMode ? {} : { name: value.name, description: value.description }).subscribe({
      next: (result) => {
        this.busy = false;
        if (result.isOwner && !this.joinMode) {
          this.steps = ['Organización', 'Equipo', 'WhatsApp', 'Campaña'];
        }
        this.currentStep = 1;
      },
      error: (err) => {
        this.busy = false;
        this.snackBar.open(err?.error?.error || 'Error al configurar la organización', 'Cerrar', { duration: 5000 });
      },
    });
  }

  addMember(): void {
    if (this.memberForm.invalid) {
      this.memberForm.markAllAsTouched();
      return;
    }
    this.busy = true;
    this.organizationService.addMember(this.memberForm.value).subscribe({
      next: () => {
        this.busy = false;
        this.snackBar.open('Miembro añadido al equipo', 'Cerrar', { duration: 3000 });
        this.currentStep = 2;
      },
      error: (err) => {
        this.busy = false;
        this.snackBar.open(err?.error?.error || 'Error al añadir el miembro', 'Cerrar', { duration: 5000 });
      },
    });
  }

  setupInstance(): void {
    if (this.instance) {
      // La instancia ya existe: avanzar al paso de campaña (el QR sigue
      // consultándose en segundo plano).
      this.currentStep = 3;
      return;
    }
    if (this.instanceForm.invalid) {
      this.instanceForm.markAllAsTouched();
      return;
    }
    this.busy = true;
    this.instanceService.create(this.instanceForm.value).subscribe({
      next: (created) => {
        this.busy = false;
        this.instance = created;
        this.qrCode = (created as Instance & { qrCode?: string }).qrCode || null;
        if (!this.qrCode) {
          this.loadQrCode(created.id);
        }
        this.startPolling();
      },
      error: (err) => {
        this.busy = false;
        this.snackBar.open(err?.error?.error || 'Error al crear la instancia', 'Cerrar', { duration: 5000 });
      },
    });
  }

  loadQrCode(instanceId: string): void {
    this.instanceService.getQrCode(instanceId).subscribe({
      next: (res) => {
        if (res.qrCode) this.qrCode = res.qrCode;
      },
    });
  }

  private startPolling(): void {
    if (!this.instance) return;
    this.stopPolling();
    this.poll = interval(5000)
      .pipe(switchMap(() => this.instanceService.getStatus(this.instance!.id)))
      .subscribe((res) => {
        this.status = res.status;
        this.statusLabel = this.getStatusLabel(res.status);
        if (res.status === 'connected') {
          this.connected = true;
          this.stopPolling();
        } else if ((res.status === 'connecting' || res.status === 'qrcoded') && !this.qrCode) {
          this.loadQrCode(this.instance!.id);
        }
      });
  }

  private stopPolling(): void {
    if (this.poll) {
      this.poll.unsubscribe();
      this.poll = null;
    }
  }

  createCampaign(): void {
    if (this.campaignForm.invalid) {
      this.campaignForm.markAllAsTouched();
      return;
    }
    this.busy = true;
    const value = this.campaignForm.value;
    this.campaignService.create({
      name: value.name,
      description: value.description,
      instanceId: this.instance?.id || '',
      groupIds: [],
      tags: [],
      excludeTags: [],
      active: false,
      recurrence: 'none',
    }).subscribe({
      next: () => {
        this.busy = false;
        this.snackBar.open('¡Campaña creada! Bienvenido a WhatsApp Ads.', 'Cerrar', { duration: 4000 });
        this.finishOnboarding();
      },
      error: (err) => {
        this.busy = false;
        if (err?.status === 403) {
          // El miembro no tiene permiso de campañas: este paso es opcional y
          // el onboarding se considera completado igualmente.
          this.finishOnboarding();
          return;
        }
        this.snackBar.open(err?.error?.error || 'Error al crear la campaña', 'Cerrar', { duration: 5000 });
      },
    });
  }

  finishOnboarding(): void {
    this.stopPolling();
    // Refresca la sesión: el primer usuario acaba de pasar a ser 'owner' y el
    // panel debe reflejarlo de inmediato (sidebar, permisos, usuarios).
    this.authService.refreshSession().subscribe({
      next: () => this.router.navigate(['/app/dashboard']),
      error: () => this.router.navigate(['/app/dashboard']),
    });
  }
}
