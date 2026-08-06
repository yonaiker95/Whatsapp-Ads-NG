import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-community',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  templateUrl: './community.component.html',
  styleUrls: ['./community.component.scss'],
})
export class CommunityComponent {
  channels = [
    {
      icon: 'forum',
      title: 'Foro de la comunidad',
      desc: 'Resuelve dudas, comparte experiencias y aprende de otros usuarios.',
      members: '2,400+',
      link: '#',
    },
    {
      icon: 'chat',
      title: 'Grupo de Discord',
      desc: 'Chat en tiempo real con desarrolladores y el equipo de WhatsApp Ads.',
      members: '1,800+',
      link: '#',
    },
    {
      icon: 'groups',
      title: 'Grupo de Telegram',
      desc: 'Canal oficial de anuncios y comunidad en español.',
      members: '3,200+',
      link: '#',
    },
    {
      icon: 'rss_feed',
      title: 'Blog',
      desc: 'Artículos, guías y casos de éxito sobre WhatsApp Business.',
      members: '—',
      link: '#',
    },
  ];

  highlights = [
    { stat: '5,000+', label: 'Usuarios activos' },
    { stat: '2M+', label: 'Mensajes enviados' },
    { stat: '98%', label: 'Satisfacción' },
    { stat: '50+', label: 'Países' },
  ];
}
