import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, Subscription, interval, takeUntil } from 'rxjs';
import { ReportsService } from '../../core/services/reports.service';
import { InstanceService } from '../../core/services/instance.service';
import { AiCenterService } from '../../core/services/ai-center.service';
import { ConversationSummary, ConversationMessage } from '../../core/models';

@Component({
  selector: 'app-conversations',
  standalone: true,
  imports: [CommonModule, RouterModule, MatCardModule, MatIconModule, MatButtonModule, MatInputModule, MatFormFieldModule, MatTabsModule, MatListModule, FormsModule, MatTooltipModule, MatBadgeModule, MatSelectModule, MatProgressSpinnerModule, MatSnackBarModule],
  templateUrl: './conversations.component.html',
  styleUrls: ['./conversations.component.scss'],
})
export class ConversationsComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  searchQuery = '';
  selectedInstanceId = '';
  instances: { id: string; name: string }[] = [];
  selectedConversation: ConversationSummary | null = null;
  newMessage = '';
  messages: ConversationMessage[] = [];
  showEmoji = false;
  loading = true;

  conversations: ConversationSummary[] = [];
  suggesting = false;
  syncingConversations = false;
  private destroy$ = new Subject<void>();
  private conversationsPoll$: Subscription | null = null;
  private messagesPoll$: Subscription | null = null;

  constructor(
    private reportsService: ReportsService,
    private instanceService: InstanceService,
    private aiService: AiCenterService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadInstances();
  }

  ngOnDestroy(): void {
    this.stopConversationsPoll();
    this.stopMessagesPoll();
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  loadInstances(): void {
    this.instanceService.getAll().subscribe({
      next: (instances) => {
        this.instances = instances.map((i) => ({ id: i.id, name: i.name }));
        if (this.instances.length > 0) {
          this.selectedInstanceId = this.instances[0].id;
          this.loadConversations();
        } else {
          this.loading = false;
        }
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  onInstanceChange(): void {
    this.stopConversationsPoll();
    this.selectedConversation = null;
    this.messages = [];
    this.loadConversations();
  }

  syncConversations(): void {
    if (!this.selectedInstanceId || this.syncingConversations) return;
    this.syncingConversations = true;
    this.reportsService.syncConversations(this.selectedInstanceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.syncingConversations = false;
          this.snackBar.open(
            `Conversaciones extraídas: ${res.synced} chats (${res.created} nuevos).`,
            'Cerrar', { duration: 4000 }
          );
          this.loadConversations();
        },
        error: (err) => {
          this.syncingConversations = false;
          const detail = err?.error?.error || 'Error al extraer las conversaciones';
          this.snackBar.open(detail, 'Cerrar', { duration: 6000 });
        },
      });
  }

  loadConversations(): void {
    if (!this.selectedInstanceId) return;
    this.loading = true;
    this.stopConversationsPoll();
    this.reportsService.getConversations(this.selectedInstanceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (convs) => {
          const prevSelectedJid = this.selectedConversation?.senderJid;
          this.conversations = convs;
          if (prevSelectedJid) {
            this.selectedConversation = this.conversations.find((c) => c.senderJid === prevSelectedJid) || null;
          }
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
    this.conversationsPoll$ = interval(6000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadConversationsSilent();
      });
  }

  private loadConversationsSilent(): void {
    if (!this.selectedInstanceId) return;
    this.reportsService.getConversations(this.selectedInstanceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (convs) => {
          this.conversations = convs;
          if (this.selectedConversation) {
            const updated = this.conversations.find((c) => c.senderJid === this.selectedConversation!.senderJid);
            if (updated) {
              this.selectedConversation = updated;
            }
          }
        },
        error: () => {},
      });
  }

  get filteredConversations(): ConversationSummary[] {
    if (!this.searchQuery.trim()) return this.conversations;
    const q = this.searchQuery.toLowerCase();
    return this.conversations.filter(c =>
      (c.senderName || '').toLowerCase().includes(q) || (c.senderJid || '').includes(q)
    );
  }

  selectConversation(conv: ConversationSummary): void {
    this.selectedConversation = conv;
    this.loadMessages(conv.senderJid);
  }

  backToList(): void {
    this.selectedConversation = null;
    this.messages = [];
  }

  loadMessages(jid: string): void {
    if (!this.selectedInstanceId) return;
    this.stopMessagesPoll();
    this.reportsService.getConversationHistory(this.selectedInstanceId, jid)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (msgs) => {
          this.messages = msgs;
        },
        error: () => {
          this.messages = [];
        },
      });
    this.messagesPoll$ = interval(4000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.selectedConversation) {
          this.reportsService.getConversationHistory(this.selectedInstanceId, this.selectedConversation.senderJid)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (msgs) => {
                this.messages = msgs;
              },
              error: () => {},
            });
        }
      });
  }

  sendMessage(): void {
    if (!this.newMessage.trim() || !this.selectedConversation || !this.selectedInstanceId) return;
    const text = this.newMessage.trim();
    this.reportsService.sendMessage(this.selectedInstanceId, this.selectedConversation.senderJid, text)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (msg) => {
          this.messages = [msg, ...this.messages];
          this.newMessage = '';
        },
        error: (err) => {
          const detail = err?.error?.error || 'Error al enviar el mensaje';
          this.snackBar.open(detail, 'Cerrar', { duration: 5000 });
        },
      });
  }

  suggestReply(): void {
    if (!this.selectedConversation || !this.selectedInstanceId) return;
    if (this.suggesting) return;
    this.suggesting = true;
    this.aiService.suggestReply({
      instanceId: this.selectedInstanceId,
      senderJid: this.selectedConversation.senderJid,
      message: this.newMessage.trim() || undefined,
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.suggesting = false;
          this.newMessage = res.text;
        },
        error: (err) => {
          this.suggesting = false;
          const detail = err?.error?.error || 'Error al generar la respuesta con IA';
          this.snackBar.open(detail, 'Cerrar', { duration: 5000 });
        },
      });
  }

  formatTime(date: string | Date): string {
    const d = new Date(date);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return this.formatTime(date);
    if (days === 1) return 'Ayer';
    if (days < 7) return d.toLocaleDateString('es-ES', { weekday: 'short' });
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }

  private stopConversationsPoll(): void {
    if (this.conversationsPoll$) {
      this.conversationsPoll$.unsubscribe();
      this.conversationsPoll$ = null;
    }
  }

  private stopMessagesPoll(): void {
    if (this.messagesPoll$) {
      this.messagesPoll$.unsubscribe();
      this.messagesPoll$ = null;
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch {}
  }
}
