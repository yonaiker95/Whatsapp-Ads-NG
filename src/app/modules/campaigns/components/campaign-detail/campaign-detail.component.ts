import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { CampaignService } from '../../../../core/services/campaign.service';
import { ReportsService } from '../../../../core/services/reports.service';
import { GroupService } from '../../../../core/services/group.service';
import { TemplateService } from '../../../../core/services/template.service';
import { Campaign } from '../../../../core/models/campaign.model';
import { SendLog } from '../../../../core/models/chatbot.model';
import { Group } from '../../../../core/models/group.model';
import { Template, TemplateButton } from '../../../../core/models/template.model';
import { CampaignFormDialogComponent } from '../campaign-form-dialog/campaign-form-dialog.component';

const RECURRENCE_LABELS: Record<string, string> = {
  none: 'Sin recurrencia',
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensual',
  custom: 'Personalizada',
};

@Component({
  selector: 'app-campaign-detail',
  standalone: true,
  imports: [
    CommonModule, RouterModule, MatCardModule, MatButtonModule, MatIconModule,
    MatChipsModule, MatDividerModule, MatProgressSpinnerModule, MatTabsModule,
    MatTableModule, MatSnackBarModule, MatDialogModule
  ],
  templateUrl: './campaign-detail.component.html',
  styleUrls: ['./campaign-detail.component.scss'],
})
export class CampaignDetailComponent implements OnInit, OnDestroy {
  campaign: Campaign | null = null;
  sendLogs: SendLog[] = [];
  groups: Group[] = [];
  template: Template | null = null;
  templateLoading = false;
  loading = true;
  logsLoading = false;
  sending = false;
  private destroy$ = new Subject<void>();

  sendLogsColumns = ['date', 'sent', 'failed', 'result'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private campaignService: CampaignService,
    private reportsService: ReportsService,
    private groupService: GroupService,
    private templateService: TemplateService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadCampaign(id);
      this.loadSendLogs(id);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCampaign(id: string): void {
    this.loading = true;
    this.campaignService.getById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (campaign) => {
          this.campaign = campaign;
          this.loading = false;
          this.loadGroups();
          this.loadTemplate();
        },
        error: () => {
          this.loading = false;
          this.router.navigate(['/app/campaigns']);
        },
      });
  }

  private loadGroups(): void {
    this.groupService.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (groups) => { this.groups = groups; },
        error: () => { this.groups = []; },
      });
  }

  private loadTemplate(): void {
    const id = this.campaign?.templateId;
    if (!id) {
      this.template = null;
      this.templateLoading = false;
      return;
    }
    this.templateLoading = true;
    this.templateService.getById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (t) => {
          this.template = t;
          this.templateLoading = false;
        },
        error: () => {
          this.template = null;
          this.templateLoading = false;
        },
      });
  }

  loadSendLogs(id: string): void {
    this.logsLoading = true;
    this.reportsService.getSendLogs(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (logs) => {
          this.sendLogs = logs;
          this.logsLoading = false;
        },
        error: () => {
          this.sendLogs = [];
          this.logsLoading = false;
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/app/campaigns']);
  }

  editCampaign(): void {
    if (!this.campaign) return;
    const dialogRef = this.dialog.open(CampaignFormDialogComponent, {
      width: '900px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { mode: 'edit', campaign: this.campaign },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && this.campaign) {
        this.loadCampaign(this.campaign.id);
        this.loadSendLogs(this.campaign.id);
      }
    });
  }

  sendCampaign(): void {
    if (!this.campaign) return;
    this.sending = true;
    this.campaignService.send(this.campaign.id).subscribe({
      next: () => {
        this.sending = false;
        this.snackBar.open('Campaña lanzada correctamente', 'Cerrar', { duration: 3000 });
        this.loadCampaign(this.campaign!.id);
        this.loadSendLogs(this.campaign!.id);
      },
      error: (err) => {
        this.sending = false;
        this.snackBar.open(err?.error?.error || 'Error al enviar la campaña', 'Cerrar', { duration: 5000 });
      },
    });
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      draft: 'status-draft',
      scheduled: 'status-scheduled',
      sending: 'status-sending',
      sent: 'status-sent',
      failed: 'status-failed',
      partial: 'status-partial',
    };
    return classes[status] || '';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Borrador',
      scheduled: 'Programada',
      sending: 'Enviando',
      sent: 'Enviada',
      failed: 'Fallida',
      partial: 'Enviada parcialmente',
    };
    return labels[status] || status;
  }

  recurrenceLabel(recurrence?: string): string {
    return recurrence ? RECURRENCE_LABELS[recurrence] || recurrence : RECURRENCE_LABELS['none'];
  }

  get groupDetails(): { id: string; name: string; participants?: number }[] {
    const byId = new Map(this.groups.map((g) => [g.id, g]));
    return (this.campaign?.groupIds || []).map((id) => {
      const g = byId.get(id);
      return g ? { id, name: g.name, participants: g.participants } : { id, name: id };
    });
  }

  get successRate(): number | null {
    const sent = this.campaign?.totalSent || 0;
    const failed = this.campaign?.totalFailed || 0;
    const total = sent + failed;
    if (total === 0) return null;
    return Math.round((sent / total) * 100);
  }

  get templateText(): string {
    return this.template?.content?.text || '';
  }

  get templateButtons(): TemplateButton[] {
    return this.template?.content?.buttons || [];
  }

  get templateMediaType(): string | undefined {
    return this.template?.content?.mediaType;
  }

  get templateVariables(): string[] {
    return this.template?.variables || [];
  }

  copyId(): void {
    if (!this.campaign?.id) return;
    navigator.clipboard?.writeText(this.campaign.id).then(
      () => this.snackBar.open('ID copiado al portapapeles', 'Cerrar', { duration: 2000 }),
      () => {}
    );
  }
}