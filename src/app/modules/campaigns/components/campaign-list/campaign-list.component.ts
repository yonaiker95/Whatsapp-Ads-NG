import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, takeUntil } from 'rxjs';
import { Campaign, CampaignFormData } from '../../../../core/models/campaign.model';
import { CampaignService } from '../../../../core/services/campaign.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { CampaignFormDialogComponent } from '../campaign-form-dialog/campaign-form-dialog.component';

const AVATAR_COLORS = ['#075E54', '#128C7E', '#0E7490', '#4338CA', '#7C3AED', '#BE185D', '#B45309', '#0F766E'];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: '#f1f5f9', color: '#475569' },
  scheduled: { bg: '#dbeafe', color: '#1d4ed8' },
  sending: { bg: '#fef3c7', color: '#b45309' },
  sent: { bg: '#d1fae5', color: '#047857' },
  failed: { bg: '#fee2e2', color: '#b91c1c' },
  partial: { bg: '#fce7f3', color: '#be185d' },
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  sending: 'Enviando',
  sent: 'Enviada',
  failed: 'Fallida',
  partial: 'Parcial',
};

@Component({
  selector: 'app-campaign-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, MatCardModule, MatButtonModule,
    MatIconModule, MatTableModule, MatFormFieldModule, MatInputModule,
    MatProgressSpinnerModule, MatMenuModule, MatDividerModule, MatDialogModule,
    MatSnackBarModule, MatTooltipModule,
  ],
  templateUrl: './campaign-list.component.html',
  styleUrls: ['./campaign-list.component.scss'],
})
export class CampaignListComponent implements OnInit, OnDestroy {
  displayedColumns = ['name', 'instance', 'template', 'groups', 'status', 'metrics', 'actions'];
  campaigns: Campaign[] = [];
  loading = true;
  searchQuery = '';
  statusFilter = 'all';
  sendingIds: Set<string> = new Set();
  private destroy$ = new Subject<void>();

  constructor(
    private campaignService: CampaignService,
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadCampaigns();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCampaigns(): void {
    this.loading = true;
    this.campaignService.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (campaigns) => {
          this.campaigns = campaigns;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  get statuses(): string[] {
    return [...new Set(this.campaigns.map((c) => c.status))].sort();
  }

  get filteredCampaigns(): Campaign[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.campaigns.filter((c) => {
      if (this.statusFilter !== 'all' && c.status !== this.statusFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.instance?.name || '').toLowerCase().includes(q) ||
        (c.template?.name || '').toLowerCase().includes(q)
      );
    });
  }

  get stats() {
    return {
      total: this.campaigns.length,
      active: this.campaigns.filter((c) => c.active).length,
      scheduled: this.campaigns.filter((c) => c.status === 'scheduled').length,
      sent: this.campaigns.filter((c) => c.status === 'sent').length,
      totalSent: this.campaigns.reduce((acc, c) => acc + (c.totalSent || 0), 0),
    };
  }

  setStatusFilter(filter: string): void {
    this.statusFilter = filter;
  }

  clearSearch(): void {
    this.searchQuery = '';
  }

  createCampaign(): void {
    this.openFormDialog();
  }

  editCampaign(campaign: Campaign): void {
    this.openFormDialog(campaign);
  }

  openFormDialog(campaign?: Campaign): void {
    const dialogRef = this.dialog.open(CampaignFormDialogComponent, {
      width: '900px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { mode: campaign ? 'edit' : 'create', campaign },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) this.loadCampaigns();
    });
  }

  viewCampaign(campaign: Campaign): void {
    this.router.navigate(['/app/campaigns', campaign.id]);
  }

  sendCampaign(campaign: Campaign): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Enviar campaña',
        message: `¿Estás seguro de que quieres enviar la campaña "${campaign.name}"?`,
        confirmText: 'Enviar',
        cancelText: 'Cancelar',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.sendingIds.add(campaign.id);
        this.campaignService.send(campaign.id).subscribe({
          next: () => {
            this.sendingIds.delete(campaign.id);
            this.snackBar.open('Campaña lanzada correctamente', 'Cerrar', { duration: 3000 });
            this.loadCampaigns();
          },
          error: (err) => {
            this.sendingIds.delete(campaign.id);
            this.snackBar.open(err?.error?.error || 'Error al enviar la campaña', 'Cerrar', { duration: 5000 });
          },
        });
      }
    });
  }

  duplicateCampaign(campaign: Campaign): void {
    const newCampaign: Partial<CampaignFormData> = {
      ...campaign,
      name: `${campaign.name} (copia)`,
      totalSent: 0,
      totalFailed: 0,
    };
    this.campaignService.create(newCampaign as CampaignFormData).subscribe(() => {
      this.loadCampaigns();
    });
  }

  deleteCampaign(campaign: Campaign): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar campaña',
        message: `¿Estás seguro de que quieres eliminar "${campaign.name}"? Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.campaignService.delete(campaign.id).subscribe({
          next: () => {
            this.snackBar.open('Campaña eliminada', 'Cerrar', { duration: 3000 });
            this.loadCampaigns();
          },
          error: (err) => {
            this.snackBar.open(err?.error?.error || 'Error al eliminar la campaña', 'Cerrar', { duration: 5000 });
          },
        });
      }
    });
  }

  isSending(campaign: Campaign): boolean {
    return this.sendingIds.has(campaign.id);
  }

  statusStyle(status: string): { bg: string; color: string } {
    return STATUS_COLORS[status] || STATUS_COLORS['draft'];
  }

  statusLabel(status: string): string {
    return STATUS_LABELS[status] || status;
  }

  avatarColor(name: string): string {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
}
