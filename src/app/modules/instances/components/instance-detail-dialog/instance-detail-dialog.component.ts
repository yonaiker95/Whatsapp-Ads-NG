import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { Instance } from '../../../../core/models/instance.model';

export type InstanceDetailAction = 'connect' | 'disconnect' | 'qr' | 'edit' | 'delete';

@Component({
  selector: 'app-instance-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatChipsModule, MatDividerModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="dialog-title-icon">phone_android</mat-icon>
      {{ data.name }}
    </h2>
    <mat-dialog-content>
      <div class="status-row">
        <mat-chip [class]="getStatusClass(data.status)" class="status-chip">
          <mat-icon class="status-icon">{{ getStatusIcon(data.status) }}</mat-icon>
          {{ getStatusLabel(data.status) }}
        </mat-chip>
        <span class="groups-count">{{ data.groups_count || data.groups?.length || 0 }} grupos</span>
      </div>

      <div class="info-list">
        <div class="info-item">
          <mat-icon>phone</mat-icon>
          <div>
            <span class="label">Teléfono</span>
            <span class="value">{{ data.phone || 'No configurado' }}</span>
          </div>
        </div>
        <div class="info-item">
          <mat-icon>badge</mat-icon>
          <div>
            <span class="label">ID de instancia</span>
            <span class="value mono">{{ data.evolutionInstanceId || data.name }}</span>
          </div>
        </div>
        <div class="info-item">
          <mat-icon>person</mat-icon>
          <div>
            <span class="label">Propietario</span>
            <span class="value">{{ ownerLabel }}</span>
          </div>
        </div>
        <div class="info-item">
          <mat-icon>calendar_today</mat-icon>
          <div>
            <span class="label">Creada</span>
            <span class="value">{{ data.createdAt | date:'medium' }}</span>
          </div>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="action('delete')" class="delete-action">
        <mat-icon>delete</mat-icon>
        Eliminar
      </button>
      <span class="spacer"></span>
      <button mat-stroked-button (click)="action('edit')">
        <mat-icon>edit</mat-icon>
        Editar
      </button>
      <button mat-stroked-button (click)="action('qr')">
        <mat-icon>qr_code</mat-icon>
        Ver QR
      </button>
      @if (data.status !== 'connected') {
        <button mat-raised-button color="primary" (click)="action('connect')">
          <mat-icon>wifi</mat-icon>
          Conectar
        </button>
      } @else {
        <button mat-raised-button color="warn" (click)="action('disconnect')">
          <mat-icon>wifi_off</mat-icon>
          Desconectar
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-title-icon { margin-right: 8px; color: #2563eb; }
    .status-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .status-chip { color: white; }
    .status-connected { background: #22c55e; }
    .status-connecting { background: #f59e0b; }
    .status-disconnected { background: #ef4444; }
    .status-qrcoded { background: #8b5cf6; }
    .status-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 4px; }
    .groups-count { color: #6b7280; }
    .info-list { display: flex; flex-direction: column; gap: 14px; }
    .info-item { display: flex; gap: 12px; align-items: flex-start; }
    .info-item mat-icon { color: #9ca3af; margin-top: 2px; }
    .info-item > div { display: flex; flex-direction: column; min-width: 0; }
    .label { font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; }
    .value { font-size: 14px; color: #111827; overflow-wrap: anywhere; }
    .mono { font-family: ui-monospace, monospace; font-size: 13px; }
    mat-dialog-actions { gap: 8px; padding: 8px 0 0; }
    .delete-action { color: #dc2626; }
    .delete-action mat-icon { color: #dc2626; }
    .spacer { flex: 1; }
  `],
})
export class InstanceDetailDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<InstanceDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Instance
  ) {}

  get ownerLabel(): string {
    if (this.data.ownerName) {
      return this.data.ownerEmail ? `${this.data.ownerName} (${this.data.ownerEmail})` : this.data.ownerName;
    }
    return this.data.userId || 'Desconocido';
  }

  close(): void {
    this.dialogRef.close();
  }

  action(action: InstanceDetailAction): void {
    this.dialogRef.close(action);
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
}
