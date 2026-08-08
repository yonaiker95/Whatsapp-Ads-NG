import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Subject, takeUntil } from 'rxjs';
import { BillingService, PaymentDestinationFormData, ReportPaymentFormData } from '../../core/services/billing.service';
import { BillingInfo, Invoice, PaymentDestination, ReportedPayment } from '../../core/models/dashboard.model';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PlanManagerDialogComponent } from './components/plan-manager-dialog/plan-manager-dialog.component';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatCardModule, MatIconModule, MatButtonModule, MatTabsModule,
    MatProgressBarModule, MatDividerModule, MatChipsModule, MatProgressSpinnerModule,
    MatTableModule, MatSnackBarModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatSlideToggleModule,
  ],
  templateUrl: './billing.component.html',
  styleUrls: ['./billing.component.scss'],
})
export class BillingComponent implements OnInit, OnDestroy {
  billing: BillingInfo | null = null;
  invoices: Invoice[] = [];
  destinations: PaymentDestination[] = [];
  reportedPayments: ReportedPayment[] = [];
  loading = true;
  payingId: string | null = null;
  displayedColumns = ['number', 'period', 'date', 'amount', 'status', 'actions'];
  displayedPaymentColumns = ['user', 'destination', 'amount', 'reference', 'date', 'status', 'actions'];
  private destroy$ = new Subject<void>();

  destinationForm: FormGroup;
  showDestinationForm = false;
  editingDestinationId: string | null = null;
  savingDestination = false;

  reportForm: FormGroup;
  showReportForm = false;
  reporting = false;
  verifyingId: string | null = null;
  managingPlan = false;

  constructor(
    private billingService: BillingService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private fb: FormBuilder
  ) {
    this.destinationForm = this.fb.group({
      type: ['banco', Validators.required],
      customType: [''],
      name: ['', Validators.required],
      holder: [''],
      detail: [''],
      instructions: [''],
      isActive: [true],
      sortOrder: [0],
    });
    this.reportForm = this.fb.group({
      destinationId: ['', Validators.required],
      amount: [null],
      reference: ['', Validators.required],
      paymentDate: [new Date().toISOString().slice(0, 10)],
    });
    this.destinationForm.get('type')?.valueChanges.subscribe((type) => {
      const custom = this.destinationForm.get('customType');
      if (type === 'otro') {
        custom?.setValidators(Validators.required);
      } else {
        custom?.clearValidators();
      }
      custom?.updateValueAndValidity();
    });
  }

  get isAdmin(): boolean {
    const role = this.authService.currentUser()?.role;
    return role === 'admin' || role === 'owner';
  }

  ngOnInit(): void {
    this.loadBilling();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBilling(): void {
    this.loading = true;
    this.billingService.getBillingInfo()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (info) => {
          this.billing = info;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
    this.loadInvoices();
    this.loadDestinations();
    this.loadReportedPayments();
  }

  loadInvoices(): void {
    this.billingService.getInvoices()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (invoices) => {
          this.invoices = invoices;
        },
        error: () => {
          this.invoices = [];
        },
      });
  }

  loadDestinations(): void {
    this.billingService.getPaymentDestinations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (destinations) => {
          this.destinations = destinations;
        },
        error: () => {
          this.destinations = [];
        },
      });
  }

  loadReportedPayments(): void {
    this.billingService.getReportedPayments()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (payments) => {
          this.reportedPayments = payments;
        },
        error: () => {
          this.reportedPayments = [];
        },
      });
  }

  usagePercent(used: number, max: number): number {
    if (!max) return 0;
    return Math.min(100, Math.round((used / max) * 100));
  }

  isUnlimited(max: number): boolean {
    return !max || max <= 0;
  }

  usageLabel(used: number, max: number): string {
    return this.isUnlimited(max) ? `${used} / Ilimitados` : `${used} / ${max}`;
  }

  usageColor(percent: number): string {
    if (percent >= 90) return 'warn';
    if (percent >= 70) return 'accent';
    return 'primary';
  }

  payInvoice(invoice: Invoice): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Pagar factura',
        message: `¿Confirmas el pago de la factura ${invoice.number} por ${invoice.amount} USD?`,
        confirmText: 'Pagar ahora',
        cancelText: 'Cancelar',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.payingId = invoice.id;
        this.billingService.payInvoice(invoice.id).subscribe({
          next: (paid) => {
            this.payingId = null;
            this.snackBar.open(`Factura ${paid.number} pagada. Plan renovado por 30 días.`, 'Cerrar', { duration: 5000 });
            this.loadBilling();
          },
          error: (err) => {
            this.payingId = null;
            this.snackBar.open(err?.error?.error || 'Error al pagar la factura', 'Cerrar', { duration: 5000 });
          },
        });
      }
    });
  }

  openPlanManager(): void {
    if (this.managingPlan) return;
    this.managingPlan = true;
    const dialogRef = this.dialog.open(PlanManagerDialogComponent, {
      width: '640px',
      maxWidth: '95vw',
      autoFocus: false,
    });
    dialogRef.afterClosed().subscribe(() => {
      this.managingPlan = false;
      this.loadBilling();
    });
  }

  openReportForm(): void {
    this.showReportForm = !this.showReportForm;
    if (this.showReportForm) {
      this.reportForm.patchValue({ paymentDate: new Date().toISOString().slice(0, 10) });
    }
  }

  submitReport(): void {
    if (this.reportForm.invalid) {
      this.reportForm.markAllAsTouched();
      return;
    }
    const v = this.reportForm.value;
    const data: ReportPaymentFormData = {
      destinationId: v.destinationId,
      amount: v.amount ? parseFloat(v.amount) : undefined,
      reference: v.reference,
      paymentDate: v.paymentDate,
    };
    this.reporting = true;
    this.billingService.reportPayment(data)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.reporting = false;
          this.showReportForm = false;
          this.reportForm.reset({ paymentDate: new Date().toISOString().slice(0, 10) });
          this.snackBar.open('Pago reportado. El administrador lo confirmará en breve.', 'Cerrar', { duration: 5000 });
          this.loadReportedPayments();
        },
        error: (err) => {
          this.reporting = false;
          this.snackBar.open(err?.error?.error || 'Error al reportar el pago', 'Cerrar', { duration: 5000 });
        },
      });
  }

  toggleDestinationForm(): void {
    this.showDestinationForm = !this.showDestinationForm;
    if (!this.showDestinationForm) {
      this.editingDestinationId = null;
      this.destinationForm.reset({ type: 'banco', customType: '', isActive: true, sortOrder: 0 });
    }
  }

  editDestination(destination: PaymentDestination): void {
    this.editingDestinationId = destination.id;
    this.showDestinationForm = true;
    this.destinationForm.patchValue({
      type: destination.type,
      customType: destination.customType || '',
      name: destination.name,
      holder: destination.holder || '',
      detail: destination.detail || '',
      instructions: destination.instructions || '',
      isActive: destination.isActive,
      sortOrder: destination.sortOrder,
    });
  }

  saveDestination(): void {
    if (this.destinationForm.invalid) {
      this.destinationForm.markAllAsTouched();
      return;
    }
    const v = this.destinationForm.value;
    const data: PaymentDestinationFormData = {
      type: v.type,
      customType: v.type === 'otro' ? v.customType : undefined,
      name: v.name,
      holder: v.holder,
      detail: v.detail,
      instructions: v.instructions,
      isActive: v.isActive,
      sortOrder: v.sortOrder,
    };
    this.savingDestination = true;
    const req = this.editingDestinationId
      ? this.billingService.updatePaymentDestination(this.editingDestinationId, data)
      : this.billingService.createPaymentDestination(data);
    req.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.savingDestination = false;
        this.showDestinationForm = false;
        this.editingDestinationId = null;
        this.destinationForm.reset({ type: 'banco', customType: '', isActive: true, sortOrder: 0 });
        this.snackBar.open('Método de pago guardado', 'Cerrar', { duration: 4000 });
        this.loadDestinations();
      },
      error: (err) => {
        this.savingDestination = false;
        this.snackBar.open(err?.error?.error || 'Error al guardar el método de pago', 'Cerrar', { duration: 5000 });
      },
    });
  }

  removeDestination(destination: PaymentDestination): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar método de pago',
        message: `¿Eliminar "${destination.name}"? Los usuarios ya no podrán usarlo para pagar.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.billingService.deletePaymentDestination(destination.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.snackBar.open('Método de pago eliminado', 'Cerrar', { duration: 4000 });
              this.loadDestinations();
            },
            error: (err) => {
              this.snackBar.open(err?.error?.error || 'Error al eliminar', 'Cerrar', { duration: 5000 });
            },
          });
      }
    });
  }

  verifyPayment(payment: ReportedPayment): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Confirmar pago recibido',
        message: `¿Confirmar el pago de ${payment.userName} por ${payment.amount} USD (ref. ${payment.reference})? Se renovará su plan por 30 días.`,
        confirmText: 'Confirmar',
        cancelText: 'Cancelar',
        confirmColor: 'primary',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.verifyingId = payment.id;
        this.billingService.verifyReportedPayment(payment.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.verifyingId = null;
              this.snackBar.open('Pago confirmado. Plan renovado por 30 días.', 'Cerrar', { duration: 5000 });
              this.loadReportedPayments();
              this.loadInvoices();
            },
            error: (err) => {
              this.verifyingId = null;
              this.snackBar.open(err?.error?.error || 'Error al confirmar el pago', 'Cerrar', { duration: 5000 });
            },
          });
      }
    });
  }

  rejectPayment(payment: ReportedPayment): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Rechazar pago',
        message: `¿Rechazar el pago de ${payment.userName} (ref. ${payment.reference})?`,
        confirmText: 'Rechazar',
        cancelText: 'Cancelar',
        confirmColor: 'warn',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.billingService.rejectReportedPayment(payment.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.snackBar.open('Pago rechazado', 'Cerrar', { duration: 4000 });
              this.loadReportedPayments();
            },
            error: (err) => {
              this.snackBar.open(err?.error?.error || 'Error al rechazar el pago', 'Cerrar', { duration: 5000 });
            },
          });
      }
    });
  }

  cardMasked(method: PaymentDestination): string {
    return `${method.name}${method.detail ? ' · ' + method.detail : ''}`;
  }

  destIcon(type: string): string {
    switch (type) {
      case 'banco': return 'account_balance';
      case 'billetera': return 'account_balance_wallet';
      case 'pagomovil': return 'smartphone';
      case 'binance_usdt': return 'currency_bitcoin';
      case 'otro': return 'credit_score';
      default: return 'payments';
    }
  }

  destinationTypeLabel(dest: PaymentDestination): string {
    switch (dest.type) {
      case 'banco': return 'Banco';
      case 'billetera': return 'Billetera';
      case 'pagomovil': return 'Pago móvil';
      case 'binance_usdt': return 'Binance USDT';
      case 'otro': return dest.customType || 'Personalizado';
      default: return 'Método de pago';
    }
  }

  get statusLabel(): string {
    return this.billing?.status === 'active'
      ? 'Activo'
      : this.billing?.status === 'trial'
        ? 'Prueba'
        : this.billing?.status === 'overdue'
          ? 'Vencido'
          : this.billing?.status === 'blocked'
            ? 'Bloqueado'
            : 'Inactivo';
  }

  get hasBlockingIssue(): boolean {
    return this.billing?.status === 'overdue' || this.billing?.status === 'blocked';
  }

  get invoiceTotal(): number {
    return this.invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  }

  get paidInvoices(): number {
    return this.invoices.filter((inv) => inv.status === 'paid').length;
  }

  get pendingInvoices(): number {
    return this.invoices.filter((inv) => inv.status === 'pending').length;
  }

  get overdueInvoices(): number {
    return this.invoices.filter((inv) => inv.status === 'overdue').length;
  }

  copyDetail(destination: PaymentDestination): void {
    const text = [
      destination.name,
      destination.holder ? `Titular: ${destination.holder}` : null,
      destination.detail || null,
      destination.instructions || null,
    ]
      .filter(Boolean)
      .join(' | ');
    if (!text) return;
    const done = () => this.snackBar.open('Datos copiados al portapapeles', 'Cerrar', { duration: 3000 });
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text));
    } else {
      this.fallbackCopy(text);
    }
  }

  private fallbackCopy(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      /* noop */
    }
    document.body.removeChild(ta);
    this.snackBar.open('Datos copiados al portapapeles', 'Cerrar', { duration: 3000 });
  }
}
