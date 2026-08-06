import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

interface Stat {
  value: string;
  label: string;
}

interface Value {
  icon: string;
  title: string;
  description: string;
}

interface TeamMember {
  name: string;
  role: string;
  initials: string;
  color: string;
}

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss'],
})
export class AboutComponent {
  stats: Stat[] = [
    { value: '2,000+', label: 'Empresas activas' },
    { value: '40+', label: 'Integraciones' },
    { value: '98%', label: 'Satisfacción' },
    { value: '24/7', label: 'Soporte' },
  ];

  values: Value[] = [
    { icon: 'rocket_launch', title: 'Velocidad', description: 'Lanzamos rápido, iteramos con datos y movemos el producto cada semana.' },
    { icon: 'emoji_objects', title: 'Simplicidad', description: 'Herramientas poderosas pero tan fáciles de usar que cualquiera puede automatizar.' },
    { icon: 'verified_user', title: 'Confianza', description: 'Tus datos y los de tus clientes están seguros. Cumplimos SOC 2 y RGPD.' },
    { icon: 'groups', title: 'Cliente primero', description: 'Cada decisión empieza con una pregunta: ¿cómo ayuda esto a nuestros clientes?' },
  ];

  team: TeamMember[] = [
    { name: 'Andrés Vega', role: 'CEO & Co-fundador', initials: 'AV', color: '#075E54' },
    { name: 'Lucía Paredes', role: 'CTO & Co-fundadora', initials: 'LP', color: '#128C7E' },
    { name: 'Martín Ríos', role: 'Head of Product', initials: 'MR', color: '#25D366' },
    { name: 'Valentina Cruz', role: 'Head of Growth', initials: 'VC', color: '#6c63ff' },
    { name: 'Diego Salas', role: 'Ingeniero Líder', initials: 'DS', color: '#f59e0b' },
    { name: 'Camila Torres', role: 'Diseñadora de Producto', initials: 'CT', color: '#ef4444' },
  ];

  textColor(color: string): string {
    const h = (color || '#25D366').replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.179 ? '#052e1f' : '#ffffff';
  }
}
