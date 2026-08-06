import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

interface Integration {
  icon: string;
  name: string;
  category: string;
  description: string;
  color: string;
}

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, MatCardModule],
  templateUrl: './integrations.component.html',
  styleUrls: ['./integrations.component.scss'],
})
export class IntegrationsComponent {
  categories = ['Todas', 'WhatsApp', 'Ecommerce', 'CRM', 'Automatización', 'Pagos'];

  selectedCategory = 'Todas';

  integrations: Integration[] = [
    { icon: 'wifi_tethering', name: 'WhatsApp Business API', category: 'WhatsApp', description: 'Conecta tu número oficial y envía mensajes a escala.', color: '#25D366' },
    { icon: 'campaign', name: 'Meta Business Suite', category: 'WhatsApp', description: 'Sincroniza campañas y audiencias con tu Meta Pixel.', color: '#1877F2' },
    { icon: 'shopping_bag', name: 'Shopify', category: 'Ecommerce', description: 'Automatiza carritos abandonados y confirmaciones de pedido.', color: '#96BF48' },
    { icon: 'storefront', name: 'WooCommerce', category: 'Ecommerce', description: 'Envía notificaciones de estado de pedido en tiempo real.', color: '#96588A' },
    { icon: 'hub', name: 'HubSpot', category: 'CRM', description: 'Sincroniza contactos y flujos de conversación con tu CRM.', color: '#FF7A59' },
    { icon: 'account_balance', name: 'Salesforce', category: 'CRM', description: 'Cierra leads directo en tu pipeline desde WhatsApp.', color: '#00A1E0' },
    { icon: 'rocket_launch', name: 'n8n', category: 'Automatización', description: 'Dispara flujos de trabajo con miles de nodos disponibles.', color: '#EA4B71' },
    { icon: 'bolt', name: 'Zapier', category: 'Automatización', description: 'Conecta WhatsApp Ads con más de 5,000 aplicaciones.', color: '#FF4F00' },
    { icon: 'credit_card', name: 'Stripe', category: 'Pagos', description: 'Cobra y gestiona suscripciones sin salir del chat.', color: '#635BFF' },
    { icon: 'payments', name: 'Mercado Pago', category: 'Pagos', description: 'Cobros en Latinoamérica con notificaciones automáticas.', color: '#009EE3' },
    { icon: 'table_chart', name: 'Google Sheets', category: 'Automatización', description: 'Registra cada conversación en una hoja de cálculo.', color: '#34A853' },
    { icon: 'send', name: 'Telegram', category: 'Automatización', description: 'Reenvía alertas y resúmenes a tu equipo por Telegram.', color: '#229ED9' },
  ];

  get filtered(): Integration[] {
    if (this.selectedCategory === 'Todas') return this.integrations;
    return this.integrations.filter((i) => i.category === this.selectedCategory);
  }

  selectCategory(category: string): void {
    this.selectedCategory = category;
  }
}
