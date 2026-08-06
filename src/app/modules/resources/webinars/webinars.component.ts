import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-webinars',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, MatChipsModule],
  templateUrl: './webinars.component.html',
  styleUrls: ['./webinars.component.scss'],
})
export class WebinarsComponent {
  upcoming = [
    {
      title: 'WhatsApp Business API: De cero a profesional',
      date: '15 de agosto, 2026',
      time: '18:00 CEST',
      desc: 'Aprende a configurar tu primera instancia, enviar mensajes y gestionar plantillas.',
      tags: ['Principiante', 'API'],
    },
    {
      title: 'Automatización avanzada con chatbots',
      date: '22 de agosto, 2026',
      time: '18:00 CEST',
      desc: 'Crea flujos inteligentes con IA, auto-respuestas y envíos programados.',
      tags: ['Intermedio', 'Chatbot'],
    },
    {
      title: 'Métrica que importan: Analytics y optimización',
      date: '5 de septiembre, 2026',
      time: '17:00 CEST',
      desc: 'Interpreta tus reportes, mide ROI y optimiza campañas con datos reales.',
      tags: ['Avanzado', 'Analytics'],
    },
  ];

  recorded = [
    { title: 'Introducción a WhatsApp Ads', views: '1,200', duration: '45 min' },
    { title: 'Plantillas aprobadas por Meta', views: '890', duration: '38 min' },
    { title: 'Casos de éxito: e-commerce', views: '650', duration: '52 min' },
    { title: 'Integración con CRMs', views: '430', duration: '41 min' },
  ];
}
