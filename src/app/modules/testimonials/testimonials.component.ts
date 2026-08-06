import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Testimonial } from '../../core/models/testimonial.model';
import { TestimonialService } from '../../core/services/testimonial.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { TestimonialFormDialogComponent } from './components/testimonial-form-dialog/testimonial-form-dialog.component';

@Component({
  selector: 'app-testimonials-admin',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatMenuModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './testimonials.component.html',
  styleUrls: ['./testimonials.component.scss'],
})
export class TestimonialsComponent implements OnInit {
  testimonials: Testimonial[] = [];
  loading = true;
  savingId: string | null = null;

  private testimonialService = inject(TestimonialService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  ngOnInit(): void {
    this.loadTestimonials();
  }

  loadTestimonials(): void {
    this.loading = true;
    this.testimonialService.getAllTestimonials().subscribe({
      next: (testimonials) => {
        this.testimonials = testimonials;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open(err?.error?.error || 'Error al cargar los testimonios', 'Cerrar', { duration: 5000 });
      },
    });
  }

  create(): void {
    const dialogRef = this.dialog.open(TestimonialFormDialogComponent, { data: { mode: 'create' }, width: '620px', maxWidth: '94vw' });
    dialogRef.afterClosed().subscribe((saved) => {
      if (saved) {
        this.snackBar.open('Testimonio creado correctamente', 'Cerrar', { duration: 4000 });
        this.loadTestimonials();
      }
    });
  }

  edit(testimonial: Testimonial): void {
    const dialogRef = this.dialog.open(TestimonialFormDialogComponent, { data: { mode: 'edit', testimonial }, width: '620px', maxWidth: '94vw' });
    dialogRef.afterClosed().subscribe((saved) => {
      if (saved) {
        this.snackBar.open('Testimonio actualizado correctamente', 'Cerrar', { duration: 4000 });
        this.loadTestimonials();
      }
    });
  }

  toggleActive(testimonial: Testimonial): void {
    this.savingId = testimonial.id;
    this.testimonialService.updateTestimonial(testimonial.id, { isActive: !testimonial.isActive }).subscribe({
      next: () => {
        this.savingId = null;
        this.snackBar.open(testimonial.isActive ? 'Testimonio desactivado' : 'Testimonio activado', 'Cerrar', { duration: 4000 });
        this.loadTestimonials();
      },
      error: (err) => {
        this.savingId = null;
        this.snackBar.open(err?.error?.error || 'Error al cambiar el estado', 'Cerrar', { duration: 5000 });
      },
    });
  }

  delete(testimonial: Testimonial): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar testimonio',
        message: `¿Eliminar el testimonio de "${testimonial.author}"? Desaparecerá del landing page.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.testimonialService.deleteTestimonial(testimonial.id).subscribe({
          next: () => {
            this.snackBar.open('Testimonio eliminado', 'Cerrar', { duration: 4000 });
            this.loadTestimonials();
          },
          error: (err) => {
            this.snackBar.open(err?.error?.error || 'Error al eliminar el testimonio', 'Cerrar', { duration: 5000 });
          },
        });
      }
    });
  }

  stars(rating: number): number[] {
    return Array.from({ length: Math.min(Math.max(rating || 0, 0), 5) });
  }

  textColor(hex: string): string {
    const h = (hex || '#25D366').replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.179 ? '#052e1f' : '#ffffff';
  }
}
