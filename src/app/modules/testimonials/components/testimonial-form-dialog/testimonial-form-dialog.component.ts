import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Testimonial } from '../../../../core/models/testimonial.model';
import { TestimonialService } from '../../../../core/services/testimonial.service';

export interface TestimonialDialogData {
  mode: 'create' | 'edit';
  testimonial?: Testimonial;
}

@Component({
  selector: 'app-testimonial-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  templateUrl: './testimonial-form-dialog.component.html',
  styleUrls: ['./testimonial-form-dialog.component.scss'],
})
export class TestimonialFormDialogComponent {
  form: FormGroup;
  isEdit = false;
  testimonialId: string | null = null;
  submitting = false;

  colorPresets = ['#25D366', '#128C7E', '#075E54', '#6c63ff', '#06b6d4', '#f59e0b', '#ef4444', '#6b7280'];

  constructor(
    @Inject(MAT_DIALOG_DATA) data: TestimonialDialogData,
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<TestimonialFormDialogComponent>,
    private testimonialService: TestimonialService,
    private snackBar: MatSnackBar
  ) {
    this.isEdit = data.mode === 'edit';
    this.testimonialId = data.testimonial?.id || null;
    this.form = this.fb.group({
      author: ['', [Validators.required, Validators.minLength(2)]],
      role: [''],
      company: [''],
      quote: ['', [Validators.required, Validators.minLength(10)]],
      avatar: [''],
      rating: [5, [Validators.required, Validators.min(0), Validators.max(5)]],
      result: [''],
      color: ['#25D366'],
      featured: [false],
      isActive: [true],
      sortOrder: [0],
    });

    if (data.testimonial) {
      this.form.patchValue({
        author: data.testimonial.author,
        role: data.testimonial.role,
        company: data.testimonial.company,
        quote: data.testimonial.quote,
        avatar: data.testimonial.avatar,
        rating: data.testimonial.rating,
        result: data.testimonial.result,
        color: data.testimonial.color,
        featured: data.testimonial.featured,
        isActive: data.testimonial.isActive,
        sortOrder: data.testimonial.sortOrder,
      });
    }
  }

  get title(): string {
    return this.isEdit ? 'Editar testimonio' : 'Nuevo testimonio';
  }

  get saveLabel(): string {
    return this.submitting ? 'Guardando...' : this.isEdit ? 'Actualizar' : 'Crear';
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Completa los campos obligatorios', 'Cerrar', { duration: 3000 });
      return;
    }
    this.submitting = true;
    const value = this.form.value;
    const data = {
      author: value.author,
      role: value.role,
      company: value.company,
      quote: value.quote,
      avatar: value.avatar || undefined,
      rating: value.rating === null ? 5 : value.rating,
      result: value.result,
      color: value.color,
      featured: !!value.featured,
      isActive: value.isActive,
      sortOrder: value.sortOrder === null ? 0 : value.sortOrder,
    };
    const request = this.isEdit && this.testimonialId
      ? this.testimonialService.updateTestimonial(this.testimonialId, data)
      : this.testimonialService.createTestimonial(data);
    request.subscribe({
      next: () => {
        this.submitting = false;
        this.dialogRef.close(true);
      },
      error: (err: any) => {
        this.submitting = false;
        this.snackBar.open(err?.error?.error || 'Error al guardar el testimonio', 'Cerrar', { duration: 5000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
