import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { Template, TemplateFormData } from '../../../../core/models/template.model';
import { TemplateService } from '../../../../core/services/template.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { TemplateFormDialogComponent } from '../template-form-dialog/template-form-dialog.component';

const AVATAR_COLORS = ['#075E54', '#128C7E', '#0E7490', '#4338CA', '#7C3AED', '#BE185D', '#B45309', '#0F766E'];

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  marketing: { bg: '#e0f2fe', color: '#0369a1' },
  utility: { bg: '#d1fae5', color: '#065f46' },
  authentication: { bg: '#ede9fe', color: '#6d28d9' },
  newsletter: { bg: '#fef3c7', color: '#92400e' },
  promocion: { bg: '#fce7f3', color: '#be185d' },
  informativa: { bg: '#cffafe', color: '#0e7490' },
};

const DEFAULT_CATEGORY: { bg: string; color: string } = { bg: '#f1f5f9', color: '#475569' };

@Component({
  selector: 'app-template-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule,
    MatDialogModule, MatMenuModule, MatDividerModule, MatSnackBarModule, MatTooltipModule,
  ],
  templateUrl: './template-list.component.html',
  styleUrls: ['./template-list.component.scss'],
})
export class TemplateListComponent implements OnInit, OnDestroy {
  displayedColumns = ['name', 'category', 'variables', 'preview', 'actions'];
  templates: Template[] = [];
  loading = true;
  searchQuery = '';
  categoryFilter = 'all';
  private destroy$ = new Subject<void>();

  constructor(
    private templateService: TemplateService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadTemplates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTemplates(): void {
    this.loading = true;
    this.templateService.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (templates) => {
          this.templates = templates;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  get categories(): string[] {
    return [...new Set(this.templates.map((t) => t.category).filter((c): c is string => !!c))].sort();
  }

  get filteredTemplates(): Template[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.templates.filter((t) => {
      if (this.categoryFilter !== 'all' && t.category !== this.categoryFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.content.text || '').toLowerCase().includes(q) ||
        (t.preview || '').toLowerCase().includes(q)
      );
    });
  }

  get stats() {
    return {
      total: this.templates.length,
      categories: this.categories.length,
      withVariables: this.templates.filter((t) => t.variables.length > 0).length,
      withMedia: this.templates.filter((t) => !!t.content.mediaType || !!t.content.mediaUrl).length,
    };
  }

  setCategoryFilter(filter: string): void {
    this.categoryFilter = filter;
  }

  clearSearch(): void {
    this.searchQuery = '';
  }

  createTemplate(): void {
    const defaultData: TemplateFormData = {
      name: '',
      category: '',
      content: { text: '', mediaUrl: '', mediaType: undefined },
      variables: [],
    };
    this.openFormDialog(defaultData);
  }

  editTemplate(template: Template): void {
    this.openFormDialog({
      name: template.name,
      category: template.category || '',
      content: {
        text: template.content.text,
        mediaUrl: template.content.mediaUrl || '',
        mediaType: template.content.mediaType,
      },
      variables: template.variables,
    }, template.id);
  }

  openFormDialog(data: TemplateFormData, id?: string): void {
    const dialogRef = this.dialog.open(TemplateFormDialogComponent, {
      width: '860px',
      maxWidth: '95vw',
      data: { formData: data, id },
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) this.loadTemplates();
    });
  }

  deleteTemplate(template: Template): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar plantilla',
        message: `¿Eliminar la plantilla "${template.name}"?`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.templateService.delete(template.id).subscribe({
          next: () => {
            this.snackBar.open('Plantilla eliminada', 'Cerrar', { duration: 3000 });
            this.loadTemplates();
          },
          error: (err) => {
            this.snackBar.open(err?.error?.error || 'Error al eliminar la plantilla', 'Cerrar', { duration: 5000 });
          },
        });
      }
    });
  }

  getVariablesDisplay(variables: string[]): string {
    return variables.length > 0 ? variables.join(', ') : 'Sin variables';
  }

  previewText(template: Template): string {
    const text = template.preview || template.content.text || '';
    return text.length > 80 ? text.slice(0, 80) + '…' : text;
  }

  categoryStyle(category?: string): { bg: string; color: string } {
    if (!category) return DEFAULT_CATEGORY;
    return CATEGORY_COLORS[category] || DEFAULT_CATEGORY;
  }

  categoryLabel(category?: string): string {
    if (!category) return 'Sin categoría';
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  avatarColor(name: string): string {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  hasMedia(template: Template): boolean {
    return !!template.content.mediaType || !!template.content.mediaUrl;
  }

  mediaIcon(template: Template): string {
    switch (template.content.mediaType) {
      case 'image': return 'image';
      case 'video': return 'videocam';
      case 'audio': return 'audiotrack';
      case 'document': return 'description';
      default: return 'attach_file';
    }
  }
}
