import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

// El panel (/app) exige onboarding completado: si el usuario aún no lo terminó
// se le redirige al asistente para que configure su espacio. El administrador
// global está exento.
export const onboardingGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.getAuthState().user;
  if (user?.role === 'admin' || user?.onboardingCompleted) {
    return true;
  }
  router.navigate(['/onboarding']);
  return false;
};

// La página de onboarding solo es útil mientras falta completarlo: un usuario
// que ya terminó (o es administrador) se va directo al panel.
export const onboardingCompleteGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.getAuthState().user;
  if (user?.role === 'admin') {
    router.navigate(['/app/dashboard']);
    return false;
  }
  if (!user?.onboardingCompleted) {
    return true;
  }
  router.navigate(['/app/dashboard']);
  return false;
};
