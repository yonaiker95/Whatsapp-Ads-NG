import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-status',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  templateUrl: './status.component.html',
  styleUrls: ['./status.component.scss'],
})
export class StatusComponent {
  services = [
    { name: 'API Principal', status: 'operational', uptime: '99.99%', latency: '45ms' },
    { name: 'Webhooks', status: 'operational', uptime: '99.95%', latency: '120ms' },
    { name: 'Panel web', status: 'operational', uptime: '100%', latency: '230ms' },
    { name: 'Base de datos', status: 'operational', uptime: '99.99%', latency: '8ms' },
    { name: 'Envío de mensajes', status: 'operational', uptime: '99.97%', latency: '350ms' },
    { name: 'API de reportes', status: 'degraded', uptime: '99.80%', latency: '890ms' },
  ];

  incidents = [
    { date: '28 jul 2026', title: 'Latencia elevada en API de reportes', status: 'investigating', desc: 'Estamos experimentando latencia superior a lo normal en la API de reportes. Estamos investigando.' },
    { date: '20 jul 2026', title: 'Mantenimiento programado', status: 'resolved', desc: 'Mantenimiento completado sin impacto en el servicio.' },
    { date: '15 jul 2026', title: 'Interrupción parcial en webhooks', status: 'resolved', desc: 'Los webhooks experimentaron retrasos de hasta 5 minutos. El problema fue resuelto.' },
  ];

  statusLabel(s: string): string {
    const map: Record<string, string> = { operational: 'Operativo', degraded: 'Degradado', investigating: 'Investigando', resolved: 'Resuelto', maintenance: 'Mantenimiento' };
    return map[s] || s;
  }
}
