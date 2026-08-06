import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';

interface Job {
  title: string;
  department: string;
  location: string;
  type: string;
  tags: string[];
  color: string;
}

@Component({
  selector: 'app-careers',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, MatChipsModule],
  templateUrl: './careers.component.html',
  styleUrls: ['./careers.component.scss'],
})
export class CareersComponent {
  benefits = [
    { icon: 'home_work', title: 'Remoto primero', description: 'Trabaja desde donde quieras, con presupuesto para coworking.' },
    { icon: 'savings', title: 'Compensación competitiva', description: 'Sueldo acorde al mercado + equity en la empresa.' },
    { icon: 'fitness_center', title: 'Salud y bienestar', description: 'Seguro médico, sesiones de terapia y gimnasio subvencionado.' },
    { icon: 'school', title: 'Presupuesto de aprendizaje', description: '$1,000/año para cursos, libros y conferencias.' },
    { icon: 'beach_access', title: 'Vacaciones ilimitadas', description: 'Tómate el descanso que necesites, con mínimo garantizado.' },
    { icon: 'laptop_mac', title: 'Equipo moderno', description: 'MacBook, monitor y todo lo que necesites para trabajar bien.' },
  ];

  jobs: Job[] = [
    { title: 'Ingeniero/a de Software Full-Stack', department: 'Ingeniería', location: 'Remoto', type: 'Tiempo completo', tags: ['Node.js', 'TypeScript', 'PostgreSQL'], color: '#25D366' },
    { title: 'Desarrollador/a Frontend (Angular)', department: 'Ingeniería', location: 'Remoto', type: 'Tiempo completo', tags: ['Angular', 'RxJS', 'SCSS'], color: '#128C7E' },
    { title: 'Product Designer', department: 'Producto', location: 'Remoto', type: 'Tiempo completo', tags: ['Figma', 'UI/UX', 'Design Systems'], color: '#6c63ff' },
    { title: 'Customer Success Manager', department: 'Éxito del cliente', location: 'Latam', type: 'Tiempo completo', tags: ['SaaS', 'Español/Inglés'], color: '#f59e0b' },
    { title: 'Especialista en Marketing de Contenidos', department: 'Marketing', location: 'Remoto', type: 'Tiempo completo', tags: ['SEO', 'Copywriting', 'Video'], color: '#06b6d4' },
    { title: 'Data Analyst', department: 'Datos', location: 'Remoto', type: 'Tiempo completo', tags: ['SQL', 'Looker Studio', 'Python'], color: '#ef4444' },
  ];
}
