import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

interface PressRelease {
  title: string;
  date: string;
  summary: string;
  category: string;
}

@Component({
  selector: 'app-press',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  templateUrl: './press.component.html',
  styleUrls: ['./press.component.scss'],
})
export class PressComponent {
  releases: PressRelease[] = [
    {
      title: 'WhatsApp Ads alcanza 2,000 empresas activas en su tercer año',
      date: '22 de julio de 2026',
      summary: 'La plataforma de automatización de WhatsApp cierra un primer semestre con crecimiento del 140% en ingresos recurrentes.',
      category: 'Crecimiento',
    },
    {
      title: 'Nuevo Centro de IA con modo BYOK para empresas con requisitos de datos',
      date: '8 de julio de 2026',
      summary: 'WhatsApp Ads ahora permite a las empresas conectar sus propias claves de modelos de lenguaje para cumplir políticas de datos estrictas.',
      category: 'Producto',
    },
    {
      title: 'Alianza con Shopify para automatizar carritos abandonados',
      date: '19 de junio de 2026',
      summary: 'La integración nativa permite a los comercios recuperar ventas con mensajes automatizados en tiempo real.',
      category: 'Partnership',
    },
    {
      title: 'WhatsApp Ads obtiene certificación SOC 2 Type II',
      date: '28 de mayo de 2026',
      summary: 'La auditoría independiente confirma los más altos estándares de seguridad, disponibilidad y confidencialidad.',
      category: 'Seguridad',
    },
    {
      title: 'Serie A de $12M para expandirse en Latinoamérica',
      date: '9 de abril de 2026',
      summary: 'La ronda liderada por fondo regional permitirá duplicar el equipo de ingeniería y abrir oficina en Ciudad de México.',
      category: 'Finanzas',
    },
  ];

  pressContacts = [
    { icon: 'campaign', label: 'Comunicación y prensa', value: 'prensa@whatsappads.com' },
    { icon: 'business_center', label: 'Alianzas estratégicas', value: 'partners@whatsappads.com' },
    { icon: 'record_voice_over', label: 'Entrevistas y podcasts', value: 'media@whatsappads.com' },
  ];

  logos = ['TechCrunch', 'Wired', 'Forbes', 'Bloomberg', 'El Economista', 'Business Insider'];
}
