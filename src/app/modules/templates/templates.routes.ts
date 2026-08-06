import { Routes } from '@angular/router';
import { TemplateListComponent } from './components/template-list/template-list.component';

export const templatesRoutes: Routes = [
  { path: '', component: TemplateListComponent, data: { title: 'Plantillas' } },
  { path: 'new', redirectTo: '', pathMatch: 'full' },
  { path: ':id/edit', redirectTo: '', pathMatch: 'full' },
];
