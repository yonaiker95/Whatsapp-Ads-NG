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
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';
import { ChatbotService } from '../../core/services/chatbot.service';
import { InstanceService } from '../../core/services/instance.service';
import { ChatbotConfig, ChatbotPaused, PriceItem, BotDocument, BotDocumentQueryResult } from '../../core/models/chatbot.model';
import { Instance } from '../../core/models/instance.model';

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatTabsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressSpinnerModule, MatListModule, MatChipsModule, MatDividerModule, MatSnackBarModule,
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
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInstanceChange(): void {
    this.loadConfig();
    this.loadPausedChats();
    this.loadDocuments();
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
}
