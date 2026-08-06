import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { BillingService } from '../../../../core/services/billing.service';
import { PlanChangeInfo } from '../../../../core/models/dashboard.model';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-plan-manager-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './plan-manager-dialog.component.html',
  styleUrls: ['./plan-manager-dialog.component.scss'],
})
export class PlanManagerDialogComponent implements OnInit {
  info: PlanChangeInfo | null = null;
  loading = true;
  saving = false;
  selectedSlug: string | null = null;
  addonQty: Record<string, number> = {};

  private billingService = inject(BillingService);
  private dialogRef = inject(MatDialogRef<PlanManagerDialogComponent>);
  private snackBar = inject(MatSnackBar);

  ngOnInit(): void {
    this.billingService.getPlanChangeInfo().subscribe({
      next: (info) => {
        this.info = info;
        this.selectedSlug = info.current.planSlug;
        for (const a of info.addonCatalog) {
          this.addonQty[a.key] = 0;
        }
        for (const a of info.current.addons) {
          this.addonQty[a.key] = a.quantity;
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('No se pudo cargar la información del plan', 'Cerrar', { duration: 5000 });
      },
    });
  }

  get selectedPlan(): PlanChangeInfo['plans'][number] | undefined {
    return this.info?.plans.find((p) => p.slug === this.selectedSlug);
  }

  get basePrice(): number {
    return this.selectedPlan?.priceMonthly ?? 0;
  }

  get addonsTotal(): number {
    let t = 0;
    for (const a of this.info?.addonCatalog ?? []) {
      t += (this.addonQty[a.key] ?? 0) * a.unitAmount;
    }
    return Math.round(t * 100) / 100;
  }

  get total(): number {
    return Math.round((this.basePrice + this.addonsTotal) * 100) / 100;
  }

  get currentTotal(): number {
    return this.info?.current.total ?? 0;
  }

  get diff(): number {
    return Math.round((this.total - this.currentTotal) * 100) / 100;
  }

  get planChanged(): boolean {
    return !!this.selectedSlug && this.selectedSlug !== this.info?.current.planSlug;
  }

  get addonsChanged(): boolean {
    if (!this.info) return false;
    const cur: Record<string, number> = {};
    for (const a of this.info.current.addons) {
      cur[a.key] = a.quantity;
    }
    for (const a of this.info.addonCatalog) {
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

  limitLabel(plan: PlanChangeInfo['plans'][number]): string {
    const maxInstances = plan.maxInstances ?? 0;
    const maxMessages = plan.maxMessages ?? 0;
    const maxCampaigns = plan.maxCampaigns ?? 0;
    const maxAutoReplies = plan.maxAutoReplies ?? 0;
    const parts: string[] = [];
    if (maxInstances > 0) parts.push(`${maxInstances} instancias`);
    if (maxMessages > 0) parts.push(`${maxMessages.toLocaleString('es-ES')} msgs/mes`);
    if (maxCampaigns > 0) parts.push(`${maxCampaigns} campaña(s)`);
    if (maxAutoReplies > 0) parts.push(`${maxAutoReplies} auto-respuestas`);
    if (plan.chatbotEnabled) parts.push('Chatbot IA');
    if (maxInstances <= 0) parts.push('Instancias ilimitadas');
    if (maxMessages <= 0) parts.push('Mensajes ilimitados');
    return parts.join(' · ');
  }

  save(): void {
    if (!this.info || !this.hasChanges) {
      this.dialogRef.close(false);
      return;
    }
    this.saving = true;
    const ops: Observable<unknown>[] = [];
    if (this.planChanged && this.selectedSlug) {
      ops.push(this.billingService.changePlan(this.selectedSlug));
    }
    if (this.addonsChanged) {
      const addons = this.info.addonCatalog.map((a) => ({ key: a.key, quantity: this.addonQty[a.key] ?? 0 }));
      ops.push(this.billingService.updateAddons(addons));
    }
    let done = 0;
    let failed = false;
    for (const op of ops) {
      op.subscribe({
        next: () => {
          done++;
          if (done === ops.length && !failed) {
            this.saving = false;
            const msg = this.diff > 0
              ? `Cambios aplicados. Se generó una factura pendiente por ${this.diff} USD.`
              : 'Cambios aplicados correctamente.';
            this.snackBar.open(msg, 'Cerrar', { duration: 6000 });
            this.dialogRef.close(true);
          }
        },
        error: (err) => {
          if (!failed) {
            failed = true;
            this.saving = false;
            this.snackBar.open(err?.error?.error || 'Error al guardar los cambios', 'Cerrar', { duration: 5000 });
          }
        },
      });
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
