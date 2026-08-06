import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription, interval, switchMap } from 'rxjs';
import { InstanceService } from '../../../../core/services/instance.service';

@Component({
  selector: 'app-instance-qr',
  standalone: true,
  imports: [CommonModule, RouterModule, MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="qr-container">
      <div class="qr-header">
        <button mat-icon-button (click)="goBack()" aria-label="Volver">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div>
          <h1>Código QR</h1>
          <p class="subtitle">Escanea con WhatsApp para conectar</p>
        </div>
      </div>

      @if (connected) {
        <mat-card class="qr-card connected-card">
          <mat-card-content class="connected-content">
            <mat-icon class="connected-icon">check_circle</mat-icon>
            <h2>¡Conectado!</h2>
            <p>La instancia se conectó correctamente a WhatsApp.</p>
          </mat-card-content>
          <mat-card-actions>
            <button mat-raised-button color="primary" (click)="goBack()">Volver a instancias</button>
          </mat-card-actions>
        </mat-card>
      } @else {
        <mat-card class="qr-card" *ngIf="!loading; else loadingTemplate">
          <mat-card-content>
            <div class="qr-content">
              @if (qrCode) {
                <div class="qr-image">
                  <img [src]="qrCode" alt="Código QR para conectar WhatsApp">
                </div>
                <p class="qr-instructions">
                  1. Abre WhatsApp en tu teléfono<br>
                  2. Ve a Dispositivos vinculados → Vincular dispositivo<br>
                  3. Escanea este código QR
                </p>
                <p class="qr-note">
                  El código expira en unos minutos y se actualiza automáticamente.
                  <span class="status-line">Estado: {{ statusLabel }}</span>
                </p>
              } @else {
                <div class="no-qr">
                  <mat-spinner diameter="40"></mat-spinner>
                  <p>Generando código QR...</p>
                </div>
              }
            </div>
          </mat-card-content>
          <mat-card-actions>
            <button mat-raised-button color="primary" (click)="refreshQr()" [disabled]="loading">
              <mat-spinner diameter="20" *ngIf="loading"></mat-spinner>
              <span *ngIf="!loading">Actualizar QR</span>
            </button>
            <button mat-button (click)="goBack()">Volver</button>
          </mat-card-actions>
        </mat-card>
      }

      <ng-template #loadingTemplate>
        <mat-card class="qr-card">
          <mat-card-content class="loading-content">
            <mat-spinner diameter="40"></mat-spinner>
            <p>Generando código QR...</p>
          </mat-card-content>
        </mat-card>
      </ng-template>
    </div>
  `,
  styles: [`
    .qr-container { max-width: 500px; margin: 0 auto; padding: 24px; }
    .qr-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
    .qr-header h1 { margin: 0 0 4px; font-size: 28px; font-weight: 600; }
    .subtitle { margin: 0; color: #6b7280; }
    .qr-card { }
    .qr-content { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px; }
    .qr-image img { max-width: 300px; height: auto; border: 1px solid #e5e7eb; border-radius: 8px; background: white; }
    .qr-instructions { text-align: center; color: #4b5563; line-height: 1.8; margin: 0; }
    .qr-note { font-size: 13px; color: #9ca3af; margin: 8px 0 0; text-align: center; }
    .status-line { display: block; margin-top: 6px; color: #2563eb; font-weight: 500; }
    .no-qr { display: flex; flex-direction: column; align-items: center; gap: 16px; color: #6b7280; padding: 24px; }
    .loading-content { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 48px; color: #6b7280; }
    .connected-card { text-align: center; }
    .connected-content { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 24px; }
    .connected-icon { font-size: 64px; width: 64px; height: 64px; color: #22c55e; }
    .connected-content h2 { margin: 0; font-size: 24px; color: #111827; }
    .connected-content p { margin: 0; color: #6b7280; }
    mat-card-actions { justify-content: center; padding-bottom: 16px; }
  `],
})
export class InstanceQrComponent implements OnInit, OnDestroy {
  instanceId: string | null = null;
  qrCode: string | null = null;
  loading = true;
  connected = false;
  status: string = 'connecting';
  statusLabel = 'Conectando...';
  private poll: Subscription | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private instanceService: InstanceService
  ) {}

  ngOnInit(): void {
    this.instanceId = this.route.snapshot.paramMap.get('id');
    if (this.instanceId) {
      this.loadQrCode();
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  goBack(): void {
    this.router.navigate(['/app/instances']);
  }

  loadQrCode(): void {
    this.loading = true;
    if (!this.instanceId) return;
    this.instanceService.getQrCode(this.instanceId).subscribe({
      next: (res) => {
        if (res.qrCode) {
          this.qrCode = res.qrCode;
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  refreshQr(): void {
    this.loadQrCode();
  }

  private startPolling(): void {
    if (!this.instanceId) return;
    this.poll = interval(5000)
      .pipe(
        switchMap(() => this.instanceService.getStatus(this.instanceId!)),
      )
      .subscribe((res) => {
        this.status = res.status;
        this.statusLabel = this.getStatusLabel(res.status);
        if (res.status === 'connected') {
          this.connected = true;
          this.stopPolling();
        } else if (res.status === 'connecting' && !this.qrCode) {
          this.loadQrCode();
        }
      });
  }

  private stopPolling(): void {
    if (this.poll) {
      this.poll.unsubscribe();
      this.poll = null;
    }
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
}
