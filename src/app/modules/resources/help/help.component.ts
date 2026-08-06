import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatExpansionModule, MatButtonModule],
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.scss'],
})
export class HelpComponent {
  categories = [
    {
      icon: 'power_settings_new',
      title: 'Primeros pasos',
      desc: 'Configura tu cuenta, conecta WhatsApp y crea tu primera campaña.',
    },
    {
      icon: 'campaign',
      title: 'Campañas',
      desc: 'Todo sobre envíos masivos, segmentación y programación.',
    },
    {
      icon: 'auto_awesome',
      title: 'Automatización',
      desc: 'Chatbots, auto-respuestas y flujos inteligentes.',
    },
    {
      icon: 'analytics',
      title: 'Reportes',
      desc: 'Interpreta métricas, exporta datos y optimiza resultados.',
    },
    {
      icon: 'credit_card',
      title: 'Facturación',
      desc: 'Planes, pagos, facturas y cambios de suscripción.',
    },
    {
      icon: 'api',
      title: 'API y desarrolladores',
      desc: 'Documentación técnica, webhooks e integraciones.',
    },
  ];

  faqs = [
    { q: '¿Cómo conecto mi número de WhatsApp?', a: 'Ve a Instancias > Nueva instancia, ingresa la URL de tu API y la clave. Luego escanea el código QR con WhatsApp.' },
    { q: '¿Cuánto tiempo tarda en procesarse un envío masivo?', a: 'Depende del volumen. Campañas de hasta 10,000 mensajes se procesan en minutos. Para volúmenes mayores, programa el envío en horas de baja demanda.' },
    { q: '¿Puedo usar mis propias plantillas de Meta?', a: 'Sí. Puedes importar plantillas aprobadas por Meta desde el panel de Plantillas o crear nuevas siguiendo la política de WhatsApp Business.' },
    { q: '¿Cómo cancelo mi suscripción?', a: 'Ve a Facturación > Cancelar suscripción. El servicio continúa hasta el final del período facturado. No hay reembolsos parciales.' },
    { q: '¿Ofrecen período de prueba?', a: 'Sí. Todos los planes incluyen 7 días de prueba gratuita sin compromiso. No necesitas tarjeta para empezar.' },
    { q: '¿Cómo exporto mis reportes?', a: 'En Reportes, selecciona el rango de fechas y haz clic en Exportar. Disponible en CSV, PDF y Excel.' },
  ];

  panelOpenState = false;
}
