import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { ForgotComponent } from './components/forgot/forgot.component';

export const authRoutes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    data: { title: 'Iniciar sesión' },
  },
  {
    path: 'register',
    component: RegisterComponent,
    data: { title: 'Crear cuenta' },
  },
  {
    path: 'forgot',
    component: ForgotComponent,
    data: { title: 'Recuperar contraseña' },
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];