import { Component, Inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';
import { TemplateService } from '../../../../core/services/template.service';
import { TemplateFormData } from '../../../../core/models/template.model';

export interface TemplateDialogData {
  formData: TemplateFormData;
  id?: string;
}

interface PreviewToken {
  text: string;
  variable: boolean;
}

@Component({
  selector: 'app-template-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatSnackBarModule,
  ],
  templateUrl: './template-form-dialog.component.html',
  styleUrls: ['./template-form-dialog.component.scss'],
})
export class TemplateFormDialogComponent implements OnDestroy {
  form!: FormGroup;
  id?: string;
  saving = false;
  categories = ['marketing', 'utility', 'authentication', 'newsletter', 'promocion', 'informativa'];

  private destroy$ = new Subject<void>();

  constructor(
    @Inject(MAT_DIALOG_DATA) data: TemplateDialogData,
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<TemplateFormDialogComponent>,
    private templateService: TemplateService,
    private snackBar: MatSnackBar
  ) {
    this.id = data.id;
    this.buildForm(data.formData);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get title(): string {
    return this.id ? 'Editar plantilla' : 'Nueva plantilla';
  }

  get subtitle(): string {
    return this.id ? 'Actualiza los detalles de la plantilla' : 'Crea una nueva plantilla de mensaje';
  }

  get previewName(): string {
    return this.form.get('name')?.value || 'Sin nombre';
  }

  get previewCategory(): string {
    return this.form.get('category')?.value || 'Sin categoría';
  }

  get previewTokens(): PreviewToken[] {
    const text = this.form.get('content')?.get('text')?.value || '';
    return this.tokenize(text);
  }

  get previewMedia(): { type: string; url: string } | null {
    const content = this.form.get('content');
    const type = content?.get('mediaType')?.value;
    const url = content?.get('mediaUrl')?.value;
    return type ? { type, url } : null;
  }

  get previewVariables(): string[] {
    const text = this.form.get('content')?.get('text')?.value || '';
    const names = new Set<string>();
    for (const match of text.matchAll(/\{([^}]+)\}/g)) {
      const name = match[1].trim();
      if (name) names.add(name);
    }
    return [...names];
  }

  get saveLabel(): string {
    return this.saving ? 'Guardando...' : this.id ? 'Actualizar' : 'Crear';
  }

  tokenize(text: string): PreviewToken[] {
    const tokens: PreviewToken[] = [];
    const regex = /(\{[^}]{1,60}\})/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > last) tokens.push({ text: text.slice(last, match.index), variable: false });
      tokens.push({ text: match[1], variable: true });
      last = match.index + match[1].length;
    }
    if (last < text.length) tokens.push({ text: text.slice(last), variable: false });
    return tokens;
  }

  variableTag(name: string): string {
    return `{${name}}`;
  }

  mediaLabel(type: string): string {
    switch (type) {
      case 'image': return 'Imagen';
      case 'video': return 'Video';
      case 'audio': return 'Audio';
      case 'document': return 'Documento';
      default: return type;
    }
  }

  categoryLabel(cat: string): string {
    const labels: Record<string, string> = {
      marketing: 'Marketing',
      utility: 'Utilidad',
      authentication: 'Autenticación',
      newsletter: 'Boletín',
      promocion: 'Promoción',
      informativa: 'Informativa',
    };
    return labels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
  }

  mediaIcon(type: string): string {
    switch (type) {
      case 'image': return 'image';
      case 'video': return 'videocam';
      case 'audio': return 'audiotrack';
      case 'document': return 'description';
      default: return 'attach_file';
    }
  }

  buildForm(formData: TemplateFormData): void {
    this.form = this.fb.group({
      name: [formData.name || '', [Validators.required, Validators.minLength(3)]],
      category: [formData.category || ''],
      content: this.fb.group({
        text: [formData.content?.text || '', Validators.required],
        mediaUrl: [formData.content?.mediaUrl || ''],
        mediaType: [formData.content?.mediaType || ''],
      }),
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Completa los campos obligatorios', 'Cerrar', { duration: 3000 });
      return;
    }

    this.saving = true;
    const value = this.form.value;
    const data: TemplateFormData = {
      name: value.name,
      category: value.category,
      content: {
        text: value.content.text,
        mediaUrl: value.content.mediaUrl || undefined,
        mediaType: value.content.mediaType || undefined,
      },
      variables: this.previewVariables,
    };

    const request = this.id
      ? this.templateService.update(this.id, data)
      : this.templateService.create(data);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open(err?.error?.error || 'Error al guardar la plantilla', 'Cerrar', { duration: 5000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
