import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatExpansionModule } from '@angular/material/expansion';
import { Subject, takeUntil } from 'rxjs';
import { ReportsService } from '../../core/services/reports.service';
import { CampaignService } from '../../core/services/campaign.service';
import { InstanceService } from '../../core/services/instance.service';
import { DashboardMetrics, Campaign, ConversationSummary } from '../../core/models';
import { Instance } from '../../core/models/instance.model';

interface DonutSegment {
  label: string;
  value: number;
  color: string;
  percent: number;
  dash: string;
  offset: string;
}

interface ChartBar {
  label: string;
  value: number;
  color: string;
  percent: number;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatTabsModule,
    MatProgressSpinnerModule, MatProgressBarModule, MatChipsModule, MatTableModule,
    MatSelectModule, MatFormFieldModule, MatExpansionModule,
  ],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss'],
})
export class ReportsComponent implements OnInit, OnDestroy {
  metrics: DashboardMetrics | null = null;
  campaigns: Campaign[] = [];
  conversations: ConversationSummary[] = [];
  instances: Instance[] = [];
  selectedInstanceId = '';
  loading = true;
  loadingCampaigns = false;
  loadingConversations = false;
  private destroy$ = new Subject<void>();

  campaignColumns = ['name', 'status', 'totalSent', 'totalFailed', 'createdAt'];
  conversationColumns = ['senderName', 'senderJid', 'lastMessage', 'lastMessageAt', 'messageCount'];

  messageDonut: DonutSegment[] = [];
  messageDonutTotal = 0;
  campaignStatusBars: ChartBar[] = [];
  topCampaigns: ChartBar[] = [];

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

  messageStats = [
    { label: 'Entrantes', key: 'incomingMessages', icon: 'call_received', color: '#25d366' },
    { label: 'Entregados', key: 'deliveredMessages', icon: 'done_all', color: '#42a5f5' },
    { label: 'Leídos', key: 'readMessages', icon: 'visibility', color: '#ab47bc' },
    { label: 'Fallidos', key: 'totalFailed', icon: 'error', color: '#ef5350' },
  ];

  constructor(
    private reportsService: ReportsService,
    private campaignService: CampaignService,
    private instanceService: InstanceService
  ) {}

  ngOnInit(): void {
    this.loadMetrics();
    this.loadCampaigns();
    this.instanceService.getAll().subscribe((instances) => {
      this.instances = instances;
      if (instances.length > 0) {
        this.selectedInstanceId = instances[0].id;
        this.loadConversations();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadMetrics(): void {
    this.loading = true;
    this.reportsService.getDashboardMetrics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (metrics) => {
          this.metrics = metrics;
          this.loading = false;
          this.buildMessageCharts();
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  loadCampaigns(): void {
    this.loadingCampaigns = true;
    this.campaignService.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (campaigns) => {
          this.campaigns = campaigns;
          this.loadingCampaigns = false;
          this.buildCampaignCharts();
        },
        error: () => {
          this.loadingCampaigns = false;
        },
      });
  }

  loadConversations(): void {
    if (!this.selectedInstanceId) return;
    this.loadingConversations = true;
    this.reportsService.getConversations(this.selectedInstanceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (conversations) => {
          this.conversations = conversations;
          this.loadingConversations = false;
        },
        error: () => {
          this.conversations = [];
          this.loadingConversations = false;
        },
      });
  }

  onInstanceChange(): void {
    this.loadConversations();
  }

  getMetricValue(key: string): number {
    if (!this.metrics) return 0;
    return (this.metrics as any)[key] || 0;
  }

  percent(part: number, total: number): number {
    if (!total) return 0;
    return Math.min(100, Math.round((part / total) * 100));
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Borrador',
      scheduled: 'Programada',
      sending: 'Enviando',
      sent: 'Enviada',
      failed: 'Fallida',
      partial: 'Parcial',
    };
    return map[status] || status;
  }

  private buildMessageCharts(): void {
    if (!this.metrics) return;
    const m = this.metrics;
    const delivered = m.deliveredMessages || 0;
    const read = m.readMessages || 0;
    const failed = m.totalFailed || 0;
    const pending = Math.max(0, m.totalMessages - delivered - read - failed);
    const raw = [
      { label: 'Entregados', value: delivered, color: '#25d366' },
      { label: 'Leídos', value: read, color: '#42a5f5' },
      { label: 'Fallidos', value: failed, color: '#ef5350' },
      { label: 'Pendientes', value: pending, color: '#94a3b8' },
    ].filter((s) => s.value > 0);
    this.messageDonutTotal = raw.reduce((s, x) => s + x.value, 0);
    const segments = this.donutSegments(raw.map((s) => s.value));
    this.messageDonut = raw.map((s, i) => ({
      label: s.label,
      value: s.value,
      color: s.color,
      percent: this.messageDonutTotal ? Math.round((s.value / this.messageDonutTotal) * 100) : 0,
      dash: segments[i].dash,
      offset: segments[i].offset,
    }));
  }

  private buildCampaignCharts(): void {
    const statuses = [
      { key: 'sent', label: 'Enviadas', color: '#25d366' },
      { key: 'partial', label: 'Parciales', color: '#ffa726' },
      { key: 'scheduled', label: 'Programadas', color: '#42a5f5' },
      { key: 'draft', label: 'Borradores', color: '#94a3b8' },
      { key: 'sending', label: 'Enviando', color: '#26c6da' },
      { key: 'failed', label: 'Fallidas', color: '#ef5350' },
    ];
    const total = this.campaigns.length || 1;
    this.campaignStatusBars = statuses
      .map((s) => ({
        label: s.label,
        value: this.campaigns.filter((c) => c.status === s.key).length,
        color: s.color,
        percent: Math.round((this.campaigns.filter((c) => c.status === s.key).length / total) * 100),
      }))
      .filter((b) => b.value > 0);

    const maxSent = this.campaigns.reduce((mx, c) => Math.max(mx, c.totalSent || 0), 0) || 1;
    this.topCampaigns = [...this.campaigns]
      .sort((a, b) => (b.totalSent || 0) - (a.totalSent || 0))
      .slice(0, 5)
      .map((c) => ({
        label: c.name,
        value: c.totalSent || 0,
        color: '#6c63ff',
        percent: Math.max(2, Math.round(((c.totalSent || 0) / maxSent) * 100)),
      }));
  }

  private donutSegments(values: number[]): { dash: string; offset: string }[] {
    const r = 80;
    const c = 2 * Math.PI * r;
    const total = values.reduce((s, v) => s + v, 0) || 1;
    let acc = 0;
    return values.map((v) => {
      const frac = v / total;
      const dash = c * frac - (frac > 0 && frac < 1 ? 4 : 0);
      const offset = -c * acc;
      acc += frac;
      return { dash: `${dash} ${c}`, offset: `${offset}` };
    });
  }
}
