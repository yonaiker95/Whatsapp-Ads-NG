import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil, Observable } from 'rxjs';
import { ChatbotService } from '../../core/services/chatbot.service';
import { InstanceService } from '../../core/services/instance.service';
import { ChatbotConfig, ChatbotPaused, PriceItem, BotDocument, BotDocumentQueryResult, GoogleFileItem, GoogleCalendarItem, GoogleSources } from '../../core/models/chatbot.model';
import { Instance } from '../../core/models/instance.model';

const GOOGLE_SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  sheet: 'Hoja de cálculo',
  docs: 'Documento',
  calendar: 'Agenda',
};

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatTabsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressSpinnerModule, MatListModule, MatChipsModule, MatDividerModule, MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.scss'],
})
export class ChatbotComponent implements OnInit, OnDestroy {
  instances: Instance[] = [];
  selectedInstanceId = '';
  config: ChatbotConfig | null = null;
  configLoading = false;
  saving = false;

  systemPrompt = `Eres un vendedor experto de WhatsApp Ads System. Tu objetivo es ayudar a los clientes, resolver sus dudas y guiarlos hacia la contratación de nuestros servicios.

Servicios:
- Sistema de publicidad para WhatsApp
- Gestión de campañas masivas
- Automatización de respuestas
- Chatbot con IA

Reglas:
- Sé amable y profesional
- Responde en el mismo idioma
- Usa emojis con moderación
- Si muestran interés ofrece más info
- Máximo 2-3 oraciones por respuesta
- Nunca inventes precios`;
  maxTokens = 200;
  temperature = 0.7;
  isActive = false;
  companyInfo = '';
  priceList: PriceItem[] = [];
  calendar = '';

  pausedChats: ChatbotPaused[] = [];
  pausedLoading = false;

  documents: BotDocument[] = [];
  documentsLoading = false;
  documentSaving = false;
  newDocTitle = '';
  newDocContent = '';
  queryTest = '';
  queryResults: BotDocumentQueryResult[] = [];
  queryTesting = false;
  queryTested = false;

  googleConnected = false;
  googleEmail = '';
  googleStatusLoading = false;
  googleConnecting = false;
  googleDisconnecting = false;
  googleConfigError = '';
  googleFiles: GoogleFileItem[] = [];
  googleDocs: GoogleFileItem[] = [];
  googleCalendars: GoogleCalendarItem[] = [];
  googleFilesLoading = false;
  googleSelectedFileId = '';
  googleSelectedCalendarId = '';
  googleCalendarDays = 30;
  googleSourcesLoading = false;
  googleSourcesSaving = false;
  googleSources: GoogleSources = { sheetId: '', sheetName: '', sheetRange: 'A1:Z200', docIds: [], calendarId: '', calendarDays: 30 };
  private googlePopup: Window | null = null;
  private googlePollTimer: ReturnType<typeof setInterval> | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private chatbotService: ChatbotService,
    private instanceService: InstanceService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.instanceService.getAll().subscribe((instances) => {
      this.instances = instances;
      if (instances.length > 0) {
        this.selectedInstanceId = instances[0].id;
        this.loadConfig();
        this.loadGoogleStatus();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopGooglePolling();
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInstanceChange(): void {
    this.loadConfig();
    this.loadPausedChats();
    this.loadDocuments();
    this.loadGoogleStatus();
  }

  loadConfig(): void {
    if (!this.selectedInstanceId) return;
    this.configLoading = true;
    this.chatbotService.getConfig(this.selectedInstanceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (config) => {
          this.config = config;
          if (config) {
            this.isActive = config.isActive;
            this.systemPrompt = config.systemPrompt;
            this.companyInfo = config.companyInfo || '';
            this.priceList = Array.isArray(config.priceList) ? config.priceList.map((p) => ({ ...p })) : [];
            this.calendar = config.calendar || '';
            this.maxTokens = config.maxTokens;
            this.temperature = config.temperature;
          } else {
            this.companyInfo = '';
            this.priceList = [];
            this.calendar = '';
          }
          this.configLoading = false;
        },
        error: () => {
          this.configLoading = false;
        },
      });
  }

  saveConfig(): void {
    if (!this.selectedInstanceId) {
      this.snackBar.open('Selecciona una instancia', 'Cerrar', { duration: 3000 });
      return;
    }
    this.saving = true;
    this.chatbotService
      .saveConfig({
        instanceId: this.selectedInstanceId,
        isActive: this.isActive,
        systemPrompt: this.systemPrompt,
        companyInfo: this.companyInfo,
        priceList: this.priceList.filter((p) => p && (p.name || '').trim()),
        calendar: this.calendar,
        maxTokens: this.maxTokens,
        temperature: this.temperature,
      })
      .subscribe({
        next: (config) => {
          this.saving = false;
          this.config = config;
          this.snackBar.open('Configuración guardada correctamente', 'Cerrar', { duration: 3000 });
        },
        error: (err) => {
          this.saving = false;
          this.snackBar.open(err?.error?.error || 'Error al guardar la configuración', 'Cerrar', { duration: 5000 });
        },
      });
  }

  loadPausedChats(): void {
    if (!this.selectedInstanceId) return;
    this.pausedLoading = true;
    this.chatbotService.getPausedChats(this.selectedInstanceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (chats) => {
          this.pausedChats = chats;
          this.pausedLoading = false;
        },
        error: () => {
          this.pausedLoading = false;
        },
      });
  }

  resumeChat(senderJid: string): void {
    this.chatbotService.toggleChat(this.selectedInstanceId, senderJid, false).subscribe({
      next: () => {
        this.snackBar.open('Conversación reanudada, el chatbot volverá a responder', 'Cerrar', { duration: 3000 });
        this.loadPausedChats();
      },
      error: (err) => {
        this.snackBar.open(err?.error?.error || 'Error al reanudar la conversación', 'Cerrar', { duration: 5000 });
      },
    });
  }

  removePausedChat(senderJid: string): void {
    this.chatbotService.removePausedChat(this.selectedInstanceId, senderJid).subscribe({
      next: () => {
        this.snackBar.open('Conversación eliminada', 'Cerrar', { duration: 3000 });
        this.loadPausedChats();
      },
      error: (err) => {
        this.snackBar.open(err?.error?.error || 'Error al eliminar la conversación', 'Cerrar', { duration: 5000 });
      },
    });
  }

  addPriceItem(): void {
    this.priceList.push({ name: '', price: '', description: '' });
  }

  removePriceItem(index: number): void {
    this.priceList.splice(index, 1);
  }

  trackPriceItem(index: number, item: PriceItem): string {
    return index + (item.name || '') + (item.price || '');
  }

  loadDocuments(): void {
    if (!this.selectedInstanceId) return;
    this.documentsLoading = true;
    this.chatbotService.getDocuments(this.selectedInstanceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (docs) => {
          this.documents = docs;
          this.documentsLoading = false;
        },
        error: () => {
          this.documentsLoading = false;
        },
      });
  }

  addDocument(): void {
    if (!this.selectedInstanceId) return;
    if (!this.newDocTitle.trim()) {
      this.snackBar.open('Escribe un título para el documento', 'Cerrar', { duration: 3000 });
      return;
    }
    if (!this.newDocContent.trim()) {
      this.snackBar.open('Escribe el contenido del documento', 'Cerrar', { duration: 3000 });
      return;
    }
    this.documentSaving = true;
    this.chatbotService.createDocument(this.selectedInstanceId, this.newDocTitle.trim(), this.newDocContent)
      .subscribe({
        next: () => {
          this.documentSaving = false;
          this.newDocTitle = '';
          this.newDocContent = '';
          this.snackBar.open('Documento agregado al conocimiento del bot', 'Cerrar', { duration: 3000 });
          this.loadDocuments();
        },
        error: (err) => {
          this.documentSaving = false;
          this.snackBar.open(err?.error?.error || 'Error al guardar el documento', 'Cerrar', { duration: 5000 });
        },
      });
  }

  deleteDocument(doc: BotDocument): void {
    this.chatbotService.deleteDocument(doc.id).subscribe({
      next: () => {
        this.snackBar.open('Documento eliminado', 'Cerrar', { duration: 3000 });
        this.loadDocuments();
      },
      error: (err) => {
        this.snackBar.open(err?.error?.error || 'Error al eliminar el documento', 'Cerrar', { duration: 5000 });
      },
    });
  }

  testDocumentQuery(): void {
    if (!this.selectedInstanceId || !this.queryTest.trim()) return;
    this.queryTesting = true;
    this.queryTested = false;
    this.chatbotService.testDocumentQuery(this.selectedInstanceId, this.queryTest.trim())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.queryResults = results;
          this.queryTesting = false;
          this.queryTested = true;
        },
        error: () => {
          this.queryTesting = false;
          this.queryTested = true;
          this.queryResults = [];
        },
      });
  }

  trackDocument(index: number, doc: BotDocument): string {
    return doc.id;
  }

  docSourceLabel(doc: BotDocument): string {
    return GOOGLE_SOURCE_LABELS[doc.source || 'manual'] || 'Manual';
  }

  docSourceIcon(doc: BotDocument): string {
    switch (doc.source) {
      case 'sheet': return 'grid_on';
      case 'docs': return 'article';
      case 'calendar': return 'event';
      default: return 'insert_drive_file';
    }
  }

  loadGoogleStatus(): void {
    if (!this.selectedInstanceId) return;
    this.googleStatusLoading = true;
    this.googleConfigError = '';
    this.chatbotService.getGoogleStatus(this.selectedInstanceId).subscribe({
      next: (status) => {
        this.googleConnected = status.connected;
        this.googleEmail = status.email || '';
        this.googleStatusLoading = false;
        if (status.connected) {
          this.loadGoogleFiles();
          this.loadGoogleDocs();
          this.loadGoogleCalendars();
          this.loadGoogleSources();
        }
      },
      error: (err) => {
        this.googleStatusLoading = false;
        this.googleConfigError = err?.error?.error || '';
      },
    });
  }

  connectGoogle(): void {
    if (this.googleConnecting || !this.selectedInstanceId) return;
    this.googleConfigError = '';
    this.chatbotService.getGoogleAuthUrl(this.selectedInstanceId).subscribe({
      next: ({ url }) => {
        this.googlePopup = window.open(url, '_blank', 'width=620,height=700');
        this.googleConnecting = true;
        this.startGooglePolling();
      },
      error: (err) => {
        this.googleConfigError = err?.error?.error || 'No se pudo iniciar la conexión con Google';
      },
    });
  }

  private startGooglePolling(): void {
    this.stopGooglePolling();
    let tries = 0;
    this.googlePollTimer = setInterval(() => {
      tries += 1;
      if (!this.selectedInstanceId) {
        this.stopGooglePolling();
        this.googleConnecting = false;
        return;
      }
      this.chatbotService.getGoogleStatus(this.selectedInstanceId).subscribe({
        next: (status) => {
          if (status.connected) {
            this.stopGooglePolling();
            this.googleConnecting = false;
            this.googleConnected = true;
            this.googleEmail = status.email || '';
            if (this.googlePopup) {
              this.googlePopup.close();
              this.googlePopup = null;
            }
            this.snackBar.open('Cuenta de Google conectada correctamente', 'Cerrar', { duration: 3000 });
            this.loadGoogleFiles();
            this.loadGoogleDocs();
            this.loadGoogleCalendars();
            this.loadGoogleSources();
          } else if (tries > 90) {
            this.stopGooglePolling();
            this.googleConnecting = false;
            this.snackBar.open('No se detectó la conexión. Vuelve a intentarlo.', 'Cerrar', { duration: 5000 });
          }
        },
        error: () => {
          if (tries > 90) {
            this.stopGooglePolling();
            this.googleConnecting = false;
          }
        },
      });
    }, 1500);
  }

  private stopGooglePolling(): void {
    if (this.googlePollTimer) {
      clearInterval(this.googlePollTimer);
      this.googlePollTimer = null;
    }
  }

  disconnectGoogle(): void {
    if (!confirm('¿Desconectar la cuenta de Google de esta instancia? El bot dejará de leer su catálogo, documentos y agenda hasta reconectarla.')) return;
    this.googleDisconnecting = true;
    this.chatbotService.disconnectGoogle(this.selectedInstanceId).subscribe({
      next: () => {
        this.googleDisconnecting = false;
        this.googleConnected = false;
        this.googleEmail = '';
        this.googleFiles = [];
        this.googleCalendars = [];
        this.googleSelectedFileId = '';
        this.googleSelectedCalendarId = '';
        this.googleSources = { sheetId: '', sheetName: '', sheetRange: 'A1:Z200', docIds: [], calendarId: '', calendarDays: 30 };
        this.snackBar.open('Cuenta de Google desconectada', 'Cerrar', { duration: 3000 });
      },
      error: (err) => {
        this.googleDisconnecting = false;
        this.snackBar.open(err?.error?.error || 'Error al desconectar la cuenta', 'Cerrar', { duration: 5000 });
      },
    });
  }

  loadGoogleFiles(): void {
    if (!this.googleConnected || !this.selectedInstanceId) return;
    this.googleFilesLoading = true;
    const load: Observable<GoogleFileItem[] | GoogleCalendarItem[]> = this.chatbotService.listGoogleFiles(this.selectedInstanceId, 'sheets');
    load.subscribe({
      next: (items: any) => {
        this.googleFiles = items as GoogleFileItem[];
        if (!this.googleSelectedFileId && items.length > 0) {
          this.googleSelectedFileId = (items[0] as GoogleFileItem).id;
        }
        this.googleFilesLoading = false;
      },
      error: (err: any) => {
        this.googleFilesLoading = false;
        this.snackBar.open(err?.error?.error || 'Error al cargar los archivos de Google', 'Cerrar', { duration: 5000 });
      },
    });
  }

  loadGoogleCalendars(): void {
    if (!this.googleConnected || !this.selectedInstanceId) return;
    this.googleFilesLoading = true;
    this.chatbotService.listGoogleCalendars(this.selectedInstanceId).subscribe({
      next: (items) => {
        this.googleCalendars = items;
        if (!this.googleSelectedCalendarId && items.length > 0) {
          this.googleSelectedCalendarId = (items[0] as GoogleCalendarItem).id;
        }
        this.googleFilesLoading = false;
      },
      error: (err: any) => {
        this.googleFilesLoading = false;
        this.snackBar.open(err?.error?.error || 'Error al cargar los calendarios de Google', 'Cerrar', { duration: 5000 });
      },
    });
  }

  loadGoogleDocs(): void {
    if (!this.googleConnected || !this.selectedInstanceId) return;
    this.googleFilesLoading = true;
    this.chatbotService.listGoogleFiles(this.selectedInstanceId, 'docs').subscribe({
      next: (items) => {
        this.googleDocs = items;
        this.googleFilesLoading = false;
      },
      error: (err: any) => {
        this.googleFilesLoading = false;
        this.snackBar.open(err?.error?.error || 'Error al cargar los documentos de Google', 'Cerrar', { duration: 5000 });
      },
    });
  }

  loadGoogleSources(): void {
    if (!this.googleConnected || !this.selectedInstanceId) return;
    this.googleSourcesLoading = true;
    this.chatbotService.getGoogleSources(this.selectedInstanceId).subscribe({
      next: (sources) => {
        this.googleSourcesLoading = false;
        this.googleSources = sources ?? { sheetId: '', sheetName: '', sheetRange: 'A1:Z200', docIds: [], calendarId: '', calendarDays: 30 };
        this.googleSelectedFileId = this.googleSources.sheetId;
        this.googleSelectedCalendarId = this.googleSources.calendarId;
        this.googleCalendarDays = this.googleSources.calendarDays || 30;
      },
      error: (err: any) => {
        this.googleSourcesLoading = false;
        this.snackBar.open(err?.error?.error || 'Error al cargar las fuentes de Google', 'Cerrar', { duration: 5000 });
      },
    });
  }

  onGoogleSelectedFileChange(): void {
    this.googleSources.sheetId = this.googleSelectedFileId;
  }

  onGoogleSelectedCalendarChange(): void {
    this.googleSources.calendarId = this.googleSelectedCalendarId;
  }

  saveGoogleSources(): void {
    if (!this.selectedInstanceId) {
      this.snackBar.open('Selecciona una instancia', 'Cerrar', { duration: 3000 });
      return;
    }
    this.googleSourcesSaving = true;
    this.chatbotService
      .saveGoogleSources({
        instanceId: this.selectedInstanceId,
        sheetId: this.googleSelectedFileId,
        sheetName: this.googleSources.sheetName,
        sheetRange: this.googleSources.sheetRange || 'A1:Z200',
        docIds: this.googleSources.docIds || [],
        calendarId: this.googleSelectedCalendarId,
        calendarDays: this.googleCalendarDays,
      })
      .subscribe({
        next: () => {
          this.googleSourcesSaving = false;
          this.snackBar.open('Fuentes guardadas: el bot las leerá en vivo', 'Cerrar', { duration: 3000 });
        },
        error: (err) => {
          this.googleSourcesSaving = false;
          this.snackBar.open(err?.error?.error || 'Error al guardar las fuentes', 'Cerrar', { duration: 5000 });
        },
      });
  }
}
