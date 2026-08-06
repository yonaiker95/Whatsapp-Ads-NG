import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Testimonial } from '../../../../core/models/testimonial.model';
import { TestimonialService } from '../../../../core/services/testimonial.service';

const FALLBACK_TESTIMONIALS: Testimonial[] = [
  {
    id: 'maria-gonzalez',
    author: 'María González',
    role: 'Directora de Marketing',
    company: 'EcoMarket',
    avatar: 'MG',
    quote: "WhatsApp Ads transformó completamente nuestra estrategia de ventas. Pasamos de enviar 200 mensajes manuales al día a más de 5,000 automatizados con una tasa de respuesta del 42%.",
    rating: 5,
    result: '+340% ventas en 3 meses',
    color: '#25D366',
    featured: true,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'carlos-ruiz',
    author: 'Carlos Ruiz',
    role: 'CEO',
    company: 'TechSolutions',
    avatar: 'CR',
    quote: 'El chatbot con IA nos permite atender consultas 24/7 sin contratar personal adicional. Los leads calificados llegan directo a nuestro CRM listos para cerrar.',
    rating: 5,
    result: '60% menos tiempo en soporte',
    color: '#128C7E',
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'ana-martinez',
    author: 'Ana Martínez',
    role: 'Gerente de Operaciones',
    company: 'FashionHub',
    avatar: 'AM',
    quote: 'La gestión multi-instancia nos permite manejar 3 números de WhatsApp distintos desde un solo panel. La programación de campañas nos ahorra 15 horas semanales.',
    rating: 5,
    result: 'ROI 12x en campañas',
    color: '#075E54',
    isActive: true,
    sortOrder: 3,
  },
  {
    id: 'pedro-lopez',
    author: 'Pedro López',
    role: 'Fundador',
    company: 'AutoPartes Online',
    avatar: 'PL',
    quote: 'Implementamos respuestas automáticas para FAQs y reducimos el tiempo de primera respuesta de 4 horas a segundos. Nuestros clientes están encantados.',
    rating: 5,
    result: '98% satisfacción cliente',
    color: '#6c63ff',
    isActive: true,
    sortOrder: 4,
  },
  {
    id: 'sofia-herrera',
    author: 'Sofía Herrera',
    role: 'Directora de Agencia',
    company: 'DigitalBoost',
    avatar: 'SH',
    quote: 'Como agencia, la opción white-label nos permite ofrecer WhatsApp Ads a nuestros clientes bajo nuestra marca. El soporte prioritario es excelente.',
    rating: 5,
    result: '15 nuevos clientes en 6 meses',
    color: '#f59e0b',
    isActive: true,
    sortOrder: 5,
  },
  {
    id: 'roberto-silva',
    author: 'Roberto Silva',
    role: 'Head of Growth',
    company: 'FitLife',
    avatar: 'RS',
    quote: 'Los analytics en tiempo real nos permitieron detectar que los jueves a las 7pm teníamos 3x más conversiones. Reprogramamos campañas y duplicamos ventas.',
    rating: 5,
    result: '2x conversiones en 1 mes',
    color: '#ef4444',
    isActive: true,
    sortOrder: 6,
  },
];

@Component({
  selector: 'app-testimonials',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatCardModule],
  templateUrl: './testimonials.component.html',
  styleUrls: ['./testimonials.component.scss'],
})
export class TestimonialsComponent implements OnInit {
  testimonials: Testimonial[] = FALLBACK_TESTIMONIALS;

  private testimonialService = inject(TestimonialService);

  ngOnInit(): void {
    this.testimonialService.getPublicTestimonials().subscribe({
      next: (testimonials) => {
        if (testimonials && testimonials.length > 0) {
          this.testimonials = testimonials;
        }
      },
      error: () => {
        this.testimonials = FALLBACK_TESTIMONIALS;
      },
    });
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
