import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-resources-overview',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss'],
})
export class OverviewComponent {
  resources = [
    {
      icon: 'help_center',
      title: 'Centro de ayuda',
      description: 'Encuentra respuestas a preguntas frecuentes, guías paso a paso y tutoriales.',
      link: '/help',
      color: '#25D366',
    },
    {
      icon: 'groups',
      title: 'Comunidad',
      description: 'Únete a nuestra comunidad de desarrolladores y expertos en automatización.',
      link: '/community',
      color: '#3B82F6',
    },
    {
      icon: 'play_circle',
      title: 'Webinars',
      description: 'Aprende con sesiones en vivo y grabadas sobre WhatsApp Business y marketing.',
      link: '/webinars',
      color: '#8B5CF6',
    },
    {
      icon: 'view_column',
      title: 'Plantillas',
      description: 'Descarga plantillas gratuitas para campañas, mensajes y flujos de trabajo.',
      link: '/templates',
      color: '#F59E0B',
    },
    {
      icon: 'monitor_heart',
      title: 'Estado del sistema',
      description: 'Consulta el estado en tiempo real de nuestros servicios y APIs.',
      link: '/status',
      color: '#EF4444',
    },
  ];
}
