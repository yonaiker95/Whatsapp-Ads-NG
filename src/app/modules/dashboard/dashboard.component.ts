import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { ReportsService } from '../../core/services/reports.service';
import { CampaignService } from '../../core/services/campaign.service';
import { OrganizationService } from '../../core/services/organization.service';
import { DashboardMetrics, Campaign } from '../../core/models';
import { Subject, takeUntil, Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MatCardModule, MatIconModule, MatProgressSpinnerModule, MatChipsModule, MatButtonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  metrics: DashboardMetrics | null = null;
  recentCampaigns: Campaign[] = [];
  loading = true;
  loadingOrg = true;
  hasOrganization = true;
  private destroy$ = new Subject<void>();
  private poll$: Subscription | null = null;

  statCards = [
    { label: 'Instancias', key: 'totalInstances', icon: 'smartphone', color: '#6c63ff', gradient: 'linear-gradient(135deg, #6c63ff, #a78bfa)' },
    { label: 'Conectadas', key: 'connectedInstances', icon: 'check_circle', color: '#25d366', gradient: 'linear-gradient(135deg, #25d366, #6fcf97)' },
    { label: 'Grupos', key: 'totalGroups', icon: 'groups', color: '#ffa726', gradient: 'linear-gradient(135deg, #ffa726, #ffcc80)' },
    { label: 'Campañas', key: 'totalCampaigns', icon: 'campaign', color: '#ef5350', gradient: 'linear-gradient(135deg, #ef5350, #ef9a9a)' },
    { label: 'Activas', key: 'activeCampaigns', icon: 'play_circle', color: '#26c6da', gradient: 'linear-gradient(135deg, #26c6da, #80deea)' },
    { label: 'Enviados', key: 'totalSent', icon: 'send', color: '#ab47bc', gradient: 'linear-gradient(135deg, #ab47bc, #ce93d8)' },
    { label: 'Fallidos', key: 'totalFailed', icon: 'error', color: '#ef5350', gradient: 'linear-gradient(135deg, #ef5350, #ef9a9a)' },
    { label: 'Mensajes', key: 'totalMessages', icon: 'message', color: '#42a5f5', gradient: 'linear-gradient(135deg, #42a5f5, #90caf9)' },
  ];

  metricCards = [
    { label: 'Campañas enviadas', key: 'sentCampaigns', icon: 'task_alt', color: '#6c63ff', gradient: 'linear-gradient(135deg, #6c63ff, #a78bfa)' },
    { label: 'Entregados', key: 'deliveredMessages', icon: 'done_all', color: '#25d366', gradient: 'linear-gradient(135deg, #25d366, #6fcf97)' },
    { label: 'Errors', key: 'totalFailed', icon: 'error_outline', color: '#ef5350', gradient: 'linear-gradient(135deg, #ef5350, #ef9a9a)' },
    { label: 'Respuestas', key: 'responses', icon: 'reply', color: '#26c6da', gradient: 'linear-gradient(135deg, #26c6da, #80deea)' },
    { label: 'Conversiones', key: 'conversions', icon: 'trending_up', color: '#ffa726', gradient: 'linear-gradient(135deg, #ffa726, #ffcc80)' },
  ];

  constructor(
    private reportsService: ReportsService,
    private campaignService: CampaignService,
    private organizationService: OrganizationService
  ) {}

  ngOnInit(): void {
    this.loadOrganizationStatus();
    this.loadDashboardData();
    this.poll$ = interval(15000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadDashboardData(false);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDashboardData(showSpinner = true): void {
    if (showSpinner) {
      this.loading = true;
    }
    this.reportsService.getDashboardMetrics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (metrics) => {
          this.metrics = metrics;
          this.recentCampaigns = metrics.recentCampaigns || [];
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  loadOrganizationStatus(): void {
    this.loadingOrg = true;
    this.organizationService.getCurrent()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (org) => {
          this.hasOrganization = !!org;
          this.loadingOrg = false;
        },
        error: () => {
          this.loadingOrg = false;
        },
      });
  }

  getMetricValue(key: string): number {
    if (!this.metrics) return 0;
    return (this.metrics as any)[key] || 0;
  }

  getStatusInfo(status: string): { label: string; class: string } {
    const map: Record<string, { label: string; class: string }> = {
      draft: { label: 'Borrador', class: 'draft' },
      scheduled: { label: 'Programada', class: 'scheduled' },
      sending: { label: 'Enviando', class: 'sending' },
      sent: { label: 'Enviada', class: 'sent' },
      failed: { label: 'Fallida', class: 'failed' },
      partial: { label: 'Enviada parcialmente', class: 'partial' },
    };
    return map[status] || { label: status, class: 'draft' };
  }
}
