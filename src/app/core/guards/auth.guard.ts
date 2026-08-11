import { Injectable } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (authService.getAuthState().isAuthenticated) {
    return true;
  }
  router.navigate(['/auth/login'], { queryParams: { returnUrl: state.url } });
  return false;
};

export const globalAdminGuard: CanActivateFn = (_route, _state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.getAuthState().user;
  if (user?.role === 'admin') {
    return true;
  }
  router.navigate(['/app/dashboard']);
  return false;
};

export const guestGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (!authService.getAuthState().isAuthenticated) {
    return true;
  }
  const user = authService.getAuthState().user;
  router.navigate([user?.role === 'admin' || user?.onboardingCompleted ? '/app/dashboard' : '/onboarding']);
  return false;
};