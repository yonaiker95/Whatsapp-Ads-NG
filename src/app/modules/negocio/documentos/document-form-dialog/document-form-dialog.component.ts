import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { NegocioService, NegocioDoc } from '../../negocio.service';

@Component({
  selector: 'app-document-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatCheckboxModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ doc ? 'Editar documento' : 'Nuevo documento' }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Título *</mat-label>
          <input matInput [(ngModel)]="form.title" required>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Tipo</mat-label>
          <mat-select [(ngModel)]="form.type">
            @for (t of types; track t) {
              <mat-option [value]="t">{{ typeLabel(t) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Resumen (opcional)</mat-label>
          <input matInput [(ngModel)]="form.summary" placeholder="Una línea para resumir el contenido">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Contenido</mat-label>
          <textarea matInput rows="10" [(ngModel)]="form.content" placeholder="Escribe aquí el contenido completo del documento (política, menú, FAQ, contrato...)"></textarea>
        </mat-form-field>

        <mat-checkbox class="full" color="primary" [(ngModel)]="form.active">Activo para el bot y la empresa</mat-checkbox>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="saving">
        @if (saving) { <mat-spinner diameter="16"></mat-spinner> }
        Guardar
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      padding-top: 8px;
    }
    .full { grid-column: 1 / -1; }
    mat-dialog-content { max-height: 70vh; }
    mat-dialog-actions { padding: 8px 0 0; }
    mat-dialog-actions mat-spinner { margin-right: 8px; }
  `],
})
export class DocumentFormDialogComponent {
  doc: NegocioDoc | null;
  types: string[];
  form: { title: string; type: string; summary: string; content: string; active: boolean } = {
    title: '', type: 'documento', summary: '', content: '', active: true,
  };
  saving = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { doc: NegocioDoc | null; types: string[] },
    private dialogRef: MatDialogRef<DocumentFormDialogComponent>,
    private negocio: NegocioService,
    private snackBar: MatSnackBar
  ) {
    this.doc = data.doc;
    this.types = data.types || ['politica', 'menu', 'faq', 'contrato', 'documento'];
    if (this.doc) {
      this.form = {
        title: this.doc.title,
        type: this.doc.type || 'documento',
        summary: this.doc.summary || '',
        content: this.doc.content || '',
        active: this.doc.active,
      };
    }
  }

  typeLabel(type: string): string {
    const map: Record<string, string> = {
      politica: 'Política',
      menu: 'Menú',
      faq: 'FAQ',
      contrato: 'Contrato',
      documento: 'Documento',
    };
    return map[type] || type;
  }

  save(): void {
    if (!this.form.title.trim()) {
      this.snackBar.open('El título es requerido', 'Cerrar', { duration: 3000 });
      return;
    }
    this.saving = true;
    const body = { ...this.form, title: this.form.title.trim() };
    const op = this.doc
      ? this.negocio.updateDocument(this.doc.id, body)
      : this.negocio.createDocument(body);
    op.subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open(err?.error?.error || 'Error al guardar el documento', 'Cerrar', { duration: 5000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
