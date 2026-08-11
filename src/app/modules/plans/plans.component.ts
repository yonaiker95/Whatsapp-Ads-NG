import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Plan } from '../../core/models/plan.model';
import { PlanService } from '../../core/services/plan.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PlanFormDialogComponent } from './components/plan-form-dialog/plan-form-dialog.component';
import { AddonPricesDialogComponent } from './components/addon-prices-dialog/addon-prices-dialog.component';

@Component({
  selector: 'app-plans',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatMenuModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './plans.component.html',
  styleUrls: ['./plans.component.scss'],
})
export class PlansComponent implements OnInit {
  plans: Plan[] = [];
  loading = true;
  savingId: string | null = null;
  searchQuery = '';
  statusFilter: 'all' | 'active' | 'inactive' | 'popular' = 'all';

  private planService = inject(PlanService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  ngOnInit(): void {
    this.loadPlans();
  }

  loadPlans(): void {
    this.loading = true;
    this.planService.getAllPlans().subscribe({
      next: (plans) => {
        this.plans = plans;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open(err?.error?.error || 'Error al cargar los planes', 'Cerrar', { duration: 5000 });
      },
    });
  }

  create(): void {
    const dialogRef = this.dialog.open(PlanFormDialogComponent, { data: { mode: 'create' }, width: '1080px', maxWidth: '96vw' });
    dialogRef.afterClosed().subscribe((saved) => {
      if (saved) {
        this.snackBar.open('Plan creado correctamente', 'Cerrar', { duration: 4000 });
        this.loadPlans();
      }
    });
  }

  edit(plan: Plan): void {
    const dialogRef = this.dialog.open(PlanFormDialogComponent, { data: { mode: 'edit', plan }, width: '1080px', maxWidth: '96vw' });
    dialogRef.afterClosed().subscribe((saved) => {
      if (saved) {
        this.snackBar.open('Plan actualizado correctamente', 'Cerrar', { duration: 4000 });
        this.loadPlans();
      }
    });
  }

  openAddonPrices(): void {
    const dialogRef = this.dialog.open(AddonPricesDialogComponent, { width: '640px', maxWidth: '95vw', autoFocus: false });
    dialogRef.afterClosed().subscribe(() => {});
  }

  toggleActive(plan: Plan): void {
    this.savingId = plan.id;
    this.planService.updatePlan(plan.id, { isActive: !plan.isActive }).subscribe({
      next: () => {
        this.savingId = null;
        this.snackBar.open(plan.isActive ? 'Plan desactivado' : 'Plan activado', 'Cerrar', { duration: 4000 });
        this.loadPlans();
      },
      error: (err) => {
        this.savingId = null;
        this.snackBar.open(err?.error?.error || 'Error al cambiar el estado', 'Cerrar', { duration: 5000 });
      },
    });
  }

  delete(plan: Plan): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar plan',
        message: `¿Eliminar el plan "${plan.name}"? Desaparecerá del landing page.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.planService.deletePlan(plan.id).subscribe({
          next: () => {
            this.snackBar.open('Plan eliminado', 'Cerrar', { duration: 4000 });
            this.loadPlans();
          },
          error: (err) => {
            this.snackBar.open(err?.error?.error || 'Error al eliminar el plan', 'Cerrar', { duration: 5000 });
          },
        });
      }
    });
  }

  isFree(plan: Plan): boolean {
    return plan.priceMonthly === 0 && plan.priceYearly === 0;
  }

  get activeCount(): number {
    return this.plans.filter((p) => p.isActive).length;
  }

  get inactiveCount(): number {
    return this.plans.filter((p) => !p.isActive).length;
  }

  get popularCount(): number {
    return this.plans.filter((p) => p.popular).length;
  }

  get maxMonthlyPrice(): number {
    return this.plans.filter((p) => p.isActive).reduce((max, p) => Math.max(max, p.priceMonthly || 0), 0);
  }

  get filteredPlans(): Plan[] {
    const q = this.searchQuery.trim().toLowerCase();
    let list = [...this.plans].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
    );
    if (this.statusFilter === 'active') list = list.filter((p) => p.isActive);
    if (this.statusFilter === 'inactive') list = list.filter((p) => !p.isActive);
    if (this.statusFilter === 'popular') list = list.filter((p) => p.popular);
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.slug || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  setStatusFilter(filter: 'all' | 'active' | 'inactive' | 'popular'): void {
    this.statusFilter = filter;
  }

  visibleFeatures(plan: Plan): string[] {
    return (plan.features || []).slice(0, 4);
  }

  extraFeaturesCount(plan: Plan): number {
    return Math.max(0, (plan.features || []).length - 4);
  }

  annualSavings(plan: Plan): number | null {
    const m = plan.priceMonthly;
    const y = plan.priceYearly;
    if (m > 0 && y > 0 && y < m) return Math.round((1 - y / m) * 100);
    return null;
  }

  isUnlimited(value: number | undefined): boolean {
    return !value || value <= 0;
  }

  swatchTextColor(color: string): string {
    const h = (color || '#25D366').replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.179 ? '#052e1f' : '#ffffff';
  }
}
