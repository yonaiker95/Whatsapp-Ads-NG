import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { NegocioService, NegocioDoc } from '../negocio.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { DocumentFormDialogComponent } from './document-form-dialog/document-form-dialog.component';

@Component({
  selector: 'app-documentos',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatInputModule,
    MatFormFieldModule, MatSelectModule, MatTableModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatTooltipModule, MatDialogModule,
  ],
  templateUrl: './documentos.component.html',
  styleUrls: ['./documentos.component.scss'],
})
export class DocumentosComponent implements OnInit {
  displayedColumns = ['title', 'type', 'status', 'actions'];
  docs: NegocioDoc[] = [];
  types: string[] = ['politica', 'menu', 'faq', 'contrato', 'documento'];
  selectedType = '';
  search = '';
  loading = true;

  constructor(
    private negocio: NegocioService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    const params: Record<string, string> = {};
    if (this.selectedType) params['type'] = this.selectedType;
    if (this.search.trim()) params['q'] = this.search.trim();
    this.negocio.getDocuments(params).subscribe({
      next: (docs) => {
        this.docs = docs;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
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

  typeIcon(type: string): string {
    const map: Record<string, string> = {
      politica: 'gavel',
      menu: 'restaurant_menu',
      faq: 'help',
      contrato: 'description',
      documento: 'article',
    };
    return map[type] || 'article';
  }

  openCreate(): void {
    const dialogRef = this.dialog.open(DocumentFormDialogComponent, {
      width: '640px',
      maxWidth: '94vw',
      data: { doc: null, types: this.types },
    });
    dialogRef.afterClosed().subscribe((ok) => {
      if (ok) {
        this.snackBar.open('Documento creado', 'Cerrar', { duration: 3000 });
        this.load();
      }
    });
  }

  openEdit(d: NegocioDoc): void {
    const dialogRef = this.dialog.open(DocumentFormDialogComponent, {
      width: '640px',
      maxWidth: '94vw',
      data: { doc: d, types: this.types },
    });
    dialogRef.afterClosed().subscribe((ok) => {
      if (ok) this.load();
    });
  }

  confirmDelete(d: NegocioDoc): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar documento',
        message: `¿Eliminar "${d.title}"? El bot dejará de tener acceso a este documento.`,
        confirmText: 'Eliminar',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.negocio.deleteDocument(d.id).subscribe({
        next: () => {
          this.snackBar.open('Documento eliminado', 'Cerrar', { duration: 3000 });
          this.load();
        },
        error: (err) => {
          this.snackBar.open(err?.error?.error || 'Error al eliminar', 'Cerrar', { duration: 5000 });
        },
      });
    });
  }
}
