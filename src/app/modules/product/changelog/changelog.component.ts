import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';

interface Release {
  version: string;
  date: string;
  title: string;
  type: 'feature' | 'improvement' | 'fix';
  highlights: string[];
}

@Component({
  selector: 'app-changelog',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, MatChipsModule],
  templateUrl: './changelog.component.html',
  styleUrls: ['./changelog.component.scss'],
})
export class ChangelogComponent {
  releases: Release[] = [
    {
      version: 'v2.4.0',
      date: '15 de julio de 2026',
      title: 'Centro de IA mejorado',
      type: 'feature',
      highlights: [
        'Nuevo modo BYOK para conectar tu propia clave de Gemini o Azure.',
        'Panel de consumo con cuotas mensuales y alertas configurables.',
        'Soporte para respuestas del chatbot con contexto multi-vuelta.',
      ],
    },
    {
      version: 'v2.3.1',
      date: '2 de julio de 2026',
      title: 'Correcciones de estabilidad',
      type: 'fix',
      highlights: [
        'Se corrigió un error que impedía reconectar instancias tras un timeout.',
        'Los archivos adjuntos grandes ahora se suben en bloques.',
        'Mejoras de rendimiento en la bandeja de conversaciones.',
      ],
    },
    {
      version: 'v2.3.0',
      date: '18 de junio de 2026',
      title: 'Campañas programadas',
      type: 'feature',
      highlights: [
        'Programa campañas con calendario y zonas horarias.',
        'Segmentación por etiquetas, estado y última interacción.',
        'Informes de entrega en tiempo real con métricas clave.',
      ],
    },
    {
      version: 'v2.2.0',
      date: '30 de mayo de 2026',
      title: 'Nuevo módulo de plantillas',
      type: 'feature',
      highlights: [
        'Editor visual de plantillas con variables dinámicas.',
        'Biblioteca de plantillas aprobadas para Meta.',
        'Duplicación y control de versiones por plantilla.',
      ],
    },
    {
      version: 'v2.1.3',
      date: '12 de mayo de 2026',
      title: 'Optimizaciones de velocidad',
      type: 'improvement',
      highlights: [
        'El dashboard ahora carga 40% más rápido.',
        'Nueva caché de sesiones para reducir latencia en API.',
        'Rediseño del panel de reportes.',
      ],
    },
    {
      version: 'v2.0.0',
      date: '20 de abril de 2026',
      title: 'Multi-instancia y webhooks',
      type: 'feature',
      highlights: [
        'Soporte para múltiples números de WhatsApp por cuenta.',
        'Webhooks firmados para eventos de mensajes e instancias.',
        'Nueva API REST v1 con SDK oficial.',
      ],
    },
    {
      version: 'v1.5.0',
      date: '1 de marzo de 2026',
      title: 'Auto-respuestas inteligentes',
      type: 'feature',
      highlights: [
        'Reglas de auto-respuesta con palabras clave y horarios.',
        'Chatbot básico con flujos configurables.',
        'Respuestas fuera de horario personalizables.',
      ],
    },
  ];
}
