import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, takeUntil } from 'rxjs';
import { Instance, VERIFICATION_ROLE_LABELS } from '../../../../core/models/instance.model';
import { InstanceService } from '../../../../core/services/instance.service';
import { InstanceSocketService, SocketMessage } from '../../../../core/services/instance-socket.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { InstanceDetailDialogComponent } from '../instance-detail-dialog/instance-detail-dialog.component';
import { InstanceFormDialogComponent, InstanceFormDialogData } from '../instance-form-dialog/instance-form-dialog.component';

@Component({
  selector: 'app-instance-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatTableModule, MatChipsModule, MatProgressSpinnerModule, MatDialogModule, MatMenuModule, MatDividerModule, MatSnackBarModule, MatInputModule, MatFormFieldModule, MatTooltipModule],
  templateUrl: './instance-list.component.html',
  styleUrls: ['./instance-list.component.scss'],
})
export class InstanceListComponent implements OnInit, OnDestroy {
  private readonly baseColumns = ['name', 'status', 'verification', 'security', 'phone', 'groupsCount', 'actions'];
  instances: Instance[] = [];
  loading = true;
  syncing = false;
  search = '';
  statusFilter: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private instanceService: InstanceService,
    private socketService: InstanceSocketService,
    private dialog: MatDialog,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  get displayedColumns(): string[] {
    return this.baseColumns;
  }

  ngOnInit(): void {
    this.loadInstances();
    this.socketService.messages
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg) => this.handleSocketMessage(msg));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get filteredInstances(): Instance[] {
    const q = this.search.trim().toLowerCase();
    return this.instances.filter((i) => {
      if (this.statusFilter && i.status !== this.statusFilter) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.phone || '').toLowerCase().includes(q) ||
        (i.evolutionInstanceId || '').toLowerCase().includes(q)
      );
    });
  }

  get stats(): { total: number; connected: number; connecting: number; disconnected: number } {
    return {
      total: this.instances.length,
      connected: this.instances.filter((i) => i.status === 'connected').length,
      connecting: this.instances.filter((i) => i.status === 'connecting' || i.status === 'qrcoded').length,
      disconnected: this.instances.filter((i) => i.status === 'disconnected').length,
    };
  }

  clearSearch(): void {
    this.search = '';
  }

  setStatusFilter(status: string | null): void {
    this.statusFilter = this.statusFilter === status ? null : status;
  }

  private handleSocketMessage(msg: SocketMessage): void {
    if (msg.type === 'instances:snapshot') {
      this.instances = msg.data as Instance[];
      this.loading = false;
    } else if (msg.type === 'instance:update') {
      const updated = msg.data as Instance;
      const idx = this.instances.findIndex((i) => i.id === updated.id);
      if (idx >= 0) {
        this.instances = this.instances.map((i) => (i.id === updated.id ? { ...i, ...updated } : i));
      } else {
        this.instances = [updated, ...this.instances];
      }
    } else if (msg.type === 'instance:deleted') {
      const { id } = msg.data as { id: string };
      this.instances = this.instances.filter((i) => i.id !== id);
    }
  }

  syncInstances(): void {
    this.syncing = true;
    this.instanceService.syncAll().subscribe({
      next: (res) => {
        this.syncing = false;
        const created = res?.created || 0;
        const synced = res?.synced || 0;
        if (created > 0 || synced > 0) {
          this.snackBar.open(`Sincronizado: ${synced} actualizadas, ${created} creadas`, 'Cerrar', { duration: 4000 });
        } else {
          this.snackBar.open('Instancias al día con Evolution API', 'Cerrar', { duration: 3000 });
        }
        this.loadInstances();
      },
      error: (err) => {
        this.syncing = false;
        this.snackBar.open(err?.error?.error || 'No se pudo sincronizar con Evolution API', 'Cerrar', { duration: 5000 });
      },
    });
  }

  loadInstances(showSpinner = true): void {
    if (showSpinner) {
      this.loading = true;
    }
    this.instanceService.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (instances) => {
          this.instances = instances;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  createInstance(): void {
    const dialogRef = this.dialog.open(InstanceFormDialogComponent, {
      data: { mode: 'create' } as InstanceFormDialogData,
      width: '460px',
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((instance: Instance | undefined) => {
      if (instance) {
        this.snackBar.open('Instancia creada', 'Cerrar', { duration: 3000 });
        this.loadInstances(false);
      }
    });
  }

  editInstance(instance: Instance): void {
    const dialogRef = this.dialog.open(InstanceFormDialogComponent, {
      data: { mode: 'edit', instance } as InstanceFormDialogData,
      width: '460px',
      autoFocus: false,
    });

    dialogRef.afterClosed().subscribe((updated: Instance | undefined) => {
      if (updated) {
        this.snackBar.open('Instancia actualizada', 'Cerrar', { duration: 3000 });
        this.loadInstances(false);
      }
    });
  }

  viewInstance(instance: Instance): void {
    const dialogRef = this.dialog.open(InstanceDetailDialogComponent, {
      data: instance,
      width: '460px',
      autoFocus: false,
    });

    dialogRef.afterClosed().subscribe((action) => {
      if (!action) return;
      if (action === 'edit') {
        this.editInstance(instance);
      } else if (action === 'qr') {
        this.showQrCode(instance);
      } else if (action === 'connect') {
        this.connectInstance(instance);
      } else if (action === 'disconnect') {
        this.disconnectInstance(instance);
      } else if (action === 'delete') {
        this.deleteInstance(instance);
      }
    });
  }

  connectInstance(instance: Instance): void {
    this.snackBar.open(`Conectando "${instance.name}"...`, 'Cerrar', { duration: 2000 });
    this.instanceService.connect(instance.id).subscribe({
      next: () => {
        this.showQrCode(instance);
      },
      error: () => {
        this.snackBar.open('Error al conectar la instancia', 'Cerrar', { duration: 3000 });
      },
    });
  }

  disconnectInstance(instance: Instance): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Desconectar instancia',
        message: `¿Desconectar "${instance.name}"? Se cerrará la sesión de WhatsApp.`,
        confirmText: 'Desconectar',
        confirmColor: 'warn' as const,
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.instanceService.disconnect(instance.id).subscribe(() => {
          this.snackBar.open('Instancia desconectada', 'Cerrar', { duration: 3000 });
        });
      }
    });
  }

  showQrCode(instance: Instance): void {
    this.router.navigate(['/app/instances', instance.id, 'qr']);
  }

  deleteInstance(instance: Instance): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar instancia',
        message: `¿Eliminar "${instance.name}"? Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        confirmColor: 'warn' as const,
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.instanceService.delete(instance.id).subscribe({
          next: () => this.snackBar.open('Instancia eliminada', 'Cerrar', { duration: 3000 }),
          error: () => this.snackBar.open('No se pudo eliminar la instancia', 'Cerrar', { duration: 3000 }),
        });
      }
    });
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      connected: 'status-connected',
      connecting: 'status-connecting',
      disconnected: 'status-disconnected',
      qrcoded: 'status-qrcoded',
    };
    return classes[status] || '';
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

  getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      connected: 'wifi',
      connecting: 'wifi_tethering',
      disconnected: 'wifi_off',
      qrcoded: 'qr_code',
    };
    return icons[status] || 'help';
  }

    verificationRoleLabel(role?: string): string {
    return VERIFICATION_ROLE_LABELS[role || 'all'] || role || 'Todas';
  }

  isSecuritySender(instance: Instance): boolean {
    return !!instance.securitySender;
  }
}