import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';
import { AutoReplyService } from '../../core/services/auto-reply.service';
import { InstanceService } from '../../core/services/instance.service';
import { AutoReply, AutoReplyFormData } from '../../core/models/auto-reply.model';
import { Instance } from '../../core/models/instance.model';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { AutoReplyFormDialogComponent } from './components/auto-reply-form-dialog/auto-reply-form-dialog.component';

@Component({
  selector: 'app-auto-replies',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule,
    MatChipsModule, MatMenuModule, MatDividerModule, MatProgressSpinnerModule,
    MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './auto-replies.component.html',
  styleUrls: ['./auto-replies.component.scss'],
})
export class AutoRepliesComponent implements OnInit, OnDestroy {
  displayedColumns = ['trigger', 'response', 'instance', 'isActive', 'actions'];
  autoReplies: AutoReply[] = [];
  instances: Instance[] = [];
  loading = true;
  searchQuery = '';
  private destroy$ = new Subject<void>();

  constructor(
    private autoReplyService: AutoReplyService,
    private instanceService: InstanceService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.instanceService.getAll().subscribe((instances) => (this.instances = instances));
    this.loadAutoReplies();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAutoReplies(): void {
    this.loading = true;
    this.autoReplyService.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (replies) => {
          this.autoReplies = replies;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  get filteredAutoReplies(): AutoReply[] {
    if (!this.searchQuery.trim()) return this.autoReplies;
    const q = this.searchQuery.toLowerCase();
    return this.autoReplies.filter(
      (r) =>
        r.trigger.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.response.toLowerCase().includes(q)
    );
  }

  openForm(data: AutoReplyFormData, id?: string): void {
    const dialogRef = this.dialog.open(AutoReplyFormDialogComponent, {
      width: '520px',
      data: { formData: data, id },
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) this.loadAutoReplies();
    });
  }

  create(): void {
    const data: AutoReplyFormData = {
      instanceId: this.instances[0]?.id || '',
      name: '',
      trigger: '',
      response: '',
      isActive: true,
    };
    this.openForm(data);
  }

  edit(reply: AutoReply): void {
    this.openForm(
      {
        instanceId: reply.instanceId,
        name: reply.name,
        trigger: reply.trigger,
        response: reply.response,
        isActive: reply.isActive,
        useAi: reply.useAi,
        aiInstructions: reply.aiInstructions,
      },
      reply.id
    );
  }

  toggleActive(reply: AutoReply): void {
    this.autoReplyService
      .update(reply.id, {
        instanceId: reply.instanceId,
        name: reply.name,
        trigger: reply.trigger,
        response: reply.response,
        isActive: !reply.isActive,
        useAi: reply.useAi,
        aiInstructions: reply.aiInstructions,
      })
      .subscribe(() => this.loadAutoReplies());
  }

  delete(reply: AutoReply): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar respuesta',
        message: `¿Eliminar la respuesta "${reply.name}"?`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.autoReplyService.delete(reply.id).subscribe({
          next: () => {
            this.snackBar.open('Respuesta eliminada', 'Cerrar', { duration: 3000 });
            this.loadAutoReplies();
          },
          error: (err) => {
            this.snackBar.open(err?.error?.error || 'Error al eliminar la respuesta', 'Cerrar', { duration: 5000 });
          },
        });
      }
    });
  }
}
