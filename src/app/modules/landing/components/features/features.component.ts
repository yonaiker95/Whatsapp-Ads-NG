import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';

interface Feature {
  icon: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-features',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatCardModule],
  templateUrl: './features.component.html',
  styleUrls: ['./features.component.scss'],
})
export class FeaturesComponent {
  featureColors = ['#25D366', '#128C7E', '#075E54', '#6c63ff', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

  features: Feature[] = [
    {
      icon: 'campaign',
      title: 'Campañas masivas',
      description: 'Envía mensajes personalizados a miles de contactos simultáneamente con variables dinámicas y plantillas aprobadas por Meta.'
    },
    {
      icon: 'smart_toy',
      title: 'Chatbot con IA',
      description: 'Responde automáticamente 24/7 con un asistente inteligente impulsado por modelos de lenguaje avanzados.'
    },
    {
      icon: 'auto_awesome',
      title: 'Respuestas automáticas',
      description: 'Configura triggers por palabras clave, horarios o eventos para responder al instante sin intervención manual.'
    },
    {
      icon: 'groups',
      title: 'Gestión de grupos',
      description: 'Sincroniza, filtra y segmenta tus grupos de WhatsApp por etiquetas, participantes o actividad para campañas dirigidas.'
    },
    {
      icon: 'analytics',
      title: 'Analytics en tiempo real',
      description: 'Dashboards con métricas de entrega, lectura, respuesta y conversión. Exporta reportes y optimiza tus campañas.'
    },
    {
      icon: 'phone_android',
      title: 'Multi-instancia',
      description: 'Conecta múltiples números de WhatsApp Business y gestiona todo desde un solo panel centralizado.'
    },
    {
      icon: 'schedule',
      title: 'Programación y recurrencia',
      description: 'Programa envíos únicos o recurrentes (diario, semanal, mensual). Define horarios, intervalos y concurrencia.'
    },
    {
      icon: 'chat_bubble',
      title: 'Bandeja de conversaciones',
      description: 'Visualiza y gestiona todos tus chats entrantes. Historial completo, búsqueda, filtros y respuesta manual.'
    },
    {
      icon: 'security',
      title: 'Seguridad y cumplimiento',
      description: 'Cumplimos con políticas de Meta. Encriptación TLS, webhooks seguros, control de acceso por roles y logs de auditoría.'
    }
  ];
}