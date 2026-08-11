import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { UsersService } from '../../../../core/services/users.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  AdminUserDetail,
  PasswordResetResult,
  RegisteredUser,
  UserAddonCatalogOption,
  UserPlanOption,
} from '../../../../core/models/user-admin.model';

export interface UserManagerDialogData {
  user: RegisteredUser;
  focusBlock?: boolean;
}

@Component({
  selector: 'app-user-manager-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './user-manager-dialog.component.html',
  styleUrls: ['./user-manager-dialog.component.scss'],
})
export class UserManagerDialogComponent implements OnInit {
  detail: AdminUserDetail | null = null;
  loading = true;
  saving = false;

  selectedPlan: string | null = null;
  addonQty: Record<string, number> = {};

  blockReason = '';
  blocking = false;
  focusBlock = false;

  sendingReset = false;
  resetResult: PasswordResetResult | null = null;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: UserManagerDialogData,
    private usersService: UsersService,
    private authService: AuthService,
    private dialogRef: MatDialogRef<UserManagerDialogComponent>,
    private snackBar: MatSnackBar
  ) {
    this.focusBlock = !!data.focusBlock;
  }

  get user(): RegisteredUser {
    return this.detail?.user ?? this.data.user;
  }

  get isCurrentUser(): boolean {
    return this.user.id === this.authService.currentUser()?.id;
  }

  get plans(): UserPlanOption[] {
    return this.detail?.plans ?? [];
  }

  get addonCatalog(): UserAddonCatalogOption[] {
    return this.detail?.addonCatalog ?? [];
  }

  ngOnInit(): void {
    this.loadDetail();
  }

  loadDetail(): void {
    this.loading = true;
    this.usersService.get(this.data.user.id).subscribe({
      next: (res) => {
        this.detail = res.data;
        this.selectedPlan = res.data.user.plan || null;
        this.addonQty = {};
        for (const a of res.data.addonCatalog) {
          this.addonQty[a.key] = 0;
        }
        for (const a of res.data.user.addons ?? []) {
          this.addonQty[a.key] = a.quantity;
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('No se pudo cargar el detalle del propietario', 'Cerrar', { duration: 5000 });
      },
    });
  }

  get selectedPlanObj(): UserPlanOption | undefined {
    return this.plans.find((p) => p.slug === this.selectedPlan);
  }

  get basePrice(): number {
    return this.selectedPlanObj?.priceMonthly ?? 0;
  }

  get addonsTotal(): number {
    let t = 0;
    for (const a of this.addonCatalog) {
      t += (this.addonQty[a.key] ?? 0) * a.unitAmount;
    }
    return Math.round(t * 100) / 100;
  }

  get total(): number {
    return Math.round((this.basePrice + this.addonsTotal) * 100) / 100;
  }

  get currentTotal(): number {
    return this.detail?.monthly ?? 0;
  }

  get diff(): number {
    return Math.round((this.total - this.currentTotal) * 100) / 100;
  }

  get planChanged(): boolean {
    return !!this.selectedPlan && this.selectedPlan !== this.detail?.user.plan;
  }

  get addonsChanged(): boolean {
    if (!this.detail) return false;
    const cur: Record<string, number> = {};
    for (const a of this.detail.user.addons ?? []) {
      cur[a.key] = a.quantity;
    }
    for (const a of this.addonCatalog) {
      if ((cur[a.key] ?? 0) !== (this.addonQty[a.key] ?? 0)) return true;
    }
    return false;
  }

  get hasChanges(): boolean {
    return this.planChanged || this.addonsChanged;
  }

  qtyOf(key: string): number {
    return this.addonQty[key] ?? 0;
  }

  inc(key: string): void {
    this.addonQty[key] = Math.min(99, (this.addonQty[key] ?? 0) + 1);
  }

  dec(key: string): void {
    this.addonQty[key] = Math.max(0, (this.addonQty[key] ?? 0) - 1);
  }

  limitLabel(plan: UserPlanOption): string {
    const parts: string[] = [];
    if (plan.maxInstances > 0) parts.push(`${plan.maxInstances} instancias`);
    if (plan.maxMessages > 0) parts.push(`${plan.maxMessages.toLocaleString('es-ES')} msgs/mes`);
    if (plan.maxCampaigns > 0) parts.push(`${plan.maxCampaigns} campaña(s)`);
    if (plan.maxAutoReplies > 0) parts.push(`${plan.maxAutoReplies} auto-respuestas`);
    if (plan.chatbotEnabled) parts.push('Chatbot IA');
    if (plan.maxInstances <= 0) parts.push('Instancias ilimitadas');
    if (plan.maxMessages <= 0) parts.push('Mensajes ilimitados');
    return parts.join(' · ');
  }

  save(): void {
    if (!this.detail || !this.hasChanges) {
      this.dialogRef.close(false);
      return;
    }
    this.saving = true;
    const payload: { plan?: string; addons?: { key: string; quantity: number }[] } = {};
    if (this.planChanged && this.selectedPlan) {
      payload.plan = this.selectedPlan;
    }
    if (this.addonsChanged) {
      payload.addons = this.addonCatalog.map((a) => ({ key: a.key, quantity: this.addonQty[a.key] ?? 0 }));
    }
    this.usersService.update(this.user.id, payload).subscribe({
      next: (res) => {
        this.saving = false;
        const appliedDiff = this.diff;
        this.detail = res.data;
        this.selectedPlan = res.data.user.plan;
        const msg =
          appliedDiff > 0
            ? `Cambios aplicados. Se generó una factura pendiente por ${appliedDiff.toFixed(2)} USD.`
            : 'Plan y extras actualizados correctamente.';
        this.snackBar.open(msg, 'Cerrar', { duration: 5000 });
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open(err?.error?.error || 'Error al guardar los cambios', 'Cerrar', { duration: 5000 });
      },
    });
  }

  sendReset(): void {
    if (this.sendingReset) return;
    this.sendingReset = true;
    this.resetResult = null;
    this.usersService.sendPasswordReset(this.user.id).subscribe({
      next: (res) => {
        this.sendingReset = false;
        this.resetResult = res.data;
        if (res.data.delivered) {
          this.snackBar.open('Enlace de recuperación enviado por WhatsApp', 'Cerrar', { duration: 4000 });
        }
      },
      error: (err) => {
        this.sendingReset = false;
        this.snackBar.open(err?.error?.error || 'No se pudo enviar el enlace', 'Cerrar', { duration: 5000 });
      },
    });
  }

  copyUrl(): void {
    if (!this.resetResult?.url) return;
    navigator.clipboard?.writeText(this.resetResult.url).then(
      () => this.snackBar.open('Enlace copiado al portapapeles', 'Cerrar', { duration: 3000 }),
      () => this.snackBar.open('No se pudo copiar el enlace', 'Cerrar', { duration: 3000 })
    );
  }

  confirmBlock(): void {
    if (this.blocking) return;
    this.blocking = true;
    this.usersService.block(this.user.id, this.blockReason).subscribe({
      next: () => {
        this.blocking = false;
        this.snackBar.open('Usuario bloqueado', 'Cerrar', { duration: 3000 });
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.blocking = false;
        this.snackBar.open(err?.error?.error || 'Error al bloquear al usuario', 'Cerrar', { duration: 5000 });
      },
    });
  }

  unblock(): void {
    if (this.blocking) return;
    this.blocking = true;
    this.usersService.unblock(this.user.id).subscribe({
      next: () => {
        this.blocking = false;
        this.snackBar.open('Usuario desbloqueado', 'Cerrar', { duration: 3000 });
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.blocking = false;
        this.snackBar.open(err?.error?.error || 'Error al desbloquear al usuario', 'Cerrar', { duration: 5000 });
      },
    });
  }

  planLabel(plan: string): string {
    const map: Record<string, string> = { mensual: 'Mensual', trimestral: 'Trimestral', anual: 'Anual', free: 'Gratis' };
    return map[plan] || plan || '—';
  }

  billingLabel(status: string): string {
    const map: Record<string, string> = { active: 'Activo', trial: 'Prueba', overdue: 'Moroso', blocked: 'Suspendido' };
    return map[status] || status || '—';
  }

  formatDate(value?: string | null): string {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return value;
    }
  }

  avatarColor(u: RegisteredUser): string {
    const palette = ['#075E54', '#0B6E63', '#06B6D4', '#6c63ff', '#7c3aed', '#059669', '#2563eb', '#db2777'];
    let h = 0;
    for (const c of u.name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
