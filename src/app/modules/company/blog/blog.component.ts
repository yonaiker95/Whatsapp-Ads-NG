import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

interface BlogPost {
  title: string;
  excerpt: string;
  category: string;
  author: string;
  date: string;
  readTime: string;
  color: string;
  featured?: boolean;
}

@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  templateUrl: './blog.component.html',
  styleUrls: ['./blog.component.scss'],
})
export class BlogComponent {
  posts: BlogPost[] = [
    {
      title: 'Cómo el carrito abandonado se convirtió en tu mayor fuente de ingresos',
      excerpt: 'El 70% de los carritos se abandonan, pero la mayoría de negocios no hace nada. Aprende a recuperar esas ventas con WhatsApp en menos de 10 minutos.',
      category: 'Ventas',
      author: 'Valentina Cruz',
      date: '28 de julio de 2026',
      readTime: '8 min',
      color: '#25D366',
      featured: true,
    },
    {
      title: 'Chatbots con IA: guía práctica para pequeñas empresas',
      excerpt: 'No necesitas un equipo técnico para tener un asistente 24/7. Te mostramos cómo configurar un chatbot con inteligencia artificial hoy mismo.',
      category: 'Inteligencia Artificial',
      author: 'Martín Ríos',
      date: '21 de julio de 2026',
      readTime: '6 min',
      color: '#128C7E',
    },
    {
      title: '5 métricas de WhatsApp que debes seguir esta semana',
      excerpt: 'Deja de mirar solo "mensajes enviados". Estas son las métricas que realmente predicen el crecimiento de tu negocio.',
      category: 'Analítica',
      author: 'Diego Salas',
      date: '14 de julio de 2026',
      readTime: '5 min',
      color: '#6c63ff',
    },
    {
      title: 'Multi-instancia: gestiona 5 números sin perder el control',
      excerpt: 'Agencias y ecommerce ya manejan varios números de WhatsApp. Cómo organizar equipos, mensajes y campañas por instancia.',
      category: 'Productividad',
      author: 'Camila Torres',
      date: '7 de julio de 2026',
      readTime: '7 min',
      color: '#f59e0b',
    },
    {
      title: 'Casos de éxito: 3 pymes que escalaron con automatización',
      excerpt: 'De 20 ventas a 120 por mes. Historias reales de negocios que automatizaron su WhatsApp sin presupuestos gigantes.',
      category: 'Casos de éxito',
      author: 'Andrés Vega',
      date: '30 de junio de 2026',
      readTime: '9 min',
      color: '#ef4444',
    },
    {
      title: 'Plantillas de WhatsApp: la guía definitiva de Meta',
      excerpt: 'Qué son, cómo aprobarlas y los errores que hacen que las rechacen. Todo lo que necesitas saber sobre templates.',
      category: 'WhatsApp',
      author: 'Lucía Paredes',
      date: '23 de junio de 2026',
      readTime: '6 min',
      color: '#06b6d4',
    },
  ];

  get featuredPost(): BlogPost {
    return this.posts.find((p) => p.featured) || this.posts[0];
  }

  get regularPosts(): BlogPost[] {
    const query = this.searchQuery.trim().toLowerCase();
    return this.posts.filter((p) => !p.featured && (!query || `${p.title} ${p.excerpt} ${p.category}`.toLowerCase().includes(query)));
  }

  searchQuery = '';

  onSearch(event: Event): void {
    this.searchQuery = (event.target as HTMLInputElement).value;
  }

  textColor(color: string): string {
    const h = (color || '#25D366').replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.179 ? '#052e1f' : '#ffffff';
  }
}
