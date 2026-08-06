import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-templates',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, MatChipsModule],
  templateUrl: './templates.component.html',
  styleUrls: ['./templates.component.scss'],
})
export class TemplatesComponent {
  categories = ['Marketing', 'Ventas', 'Soporte', 'Recordatorios', 'Bienvenida', 'Promociones'];

  templates = [
    {
      name: 'Bienvenida personalizada',
      desc: 'Da la bienvenida a nuevos contactos con un mensaje cálido y presenta tu negocio.',
      category: 'Bienvenida',
      downloads: 345,
      premium: false,
    },
    {
      name: 'Oferta flash 24h',
      desc: 'Notifica a tus clientes sobre promociones por tiempo limitado con urgencia.',
      category: 'Promociones',
      downloads: 289,
      premium: true,
    },
    {
      name: 'Recordatorio de cita',
      desc: 'Reduce ausencias con recordatorios automáticos de citas y reservas.',
      category: 'Recordatorios',
      downloads: 512,
      premium: false,
    },
    {
      name: 'Carrito abandonado',
      desc: 'Recupera ventas perdidas con un seguimiento amigable del carrito abandonado.',
      category: 'Ventas',
      downloads: 198,
      premium: true,
    },
    {
      name: 'Encuesta de satisfacción',
      desc: 'Recoge feedback después de una compra o interacción con tu negocio.',
      category: 'Soporte',
      downloads: 167,
      premium: false,
    },
    {
      name: 'Lanzamiento de producto',
      desc: 'Genera expectativa y anuncia nuevos productos a tu base de contactos.',
      category: 'Marketing',
      downloads: 234,
      premium: false,
    },
    {
      name: 'Factura digital',
      desc: 'Envía facturas y recibos de forma automatizada tras cada compra.',
      category: 'Ventas',
      downloads: 156,
      premium: true,
    },
    {
      name: 'Seguimiento post-venta',
      desc: 'Da seguimiento a clientes recientes y aumenta la fidelización.',
      category: 'Soporte',
      downloads: 123,
      premium: false,
    },
  ];

  selectedCategory: string | null = null;

  get filteredTemplates() {
    if (!this.selectedCategory) return this.templates;
    return this.templates.filter(t => t.category === this.selectedCategory);
  }

  filterBy(cat: string | null): void {
    this.selectedCategory = cat;
  }
}
