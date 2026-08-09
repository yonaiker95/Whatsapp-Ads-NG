import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface OnboardingStatus {
  completed: boolean;
  hasOrganization: boolean;
  isOwner: boolean;
  organization: { id: string; name: string; description?: string | null } | null;
}

export interface OnboardingCompleteResult {
  completed: boolean;
  organizationId: string;
  isOwner: boolean;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  constructor(private api: ApiService) {}

  getStatus(): Observable<OnboardingStatus> {
    return this.api.get<OnboardingStatus>('/onboarding').pipe(map((res) => res.data));
  }

  complete(data: { name?: string; description?: string } = {}): Observable<OnboardingCompleteResult> {
    return this.api.post<OnboardingCompleteResult>('/onboarding/complete', data).pipe(map((res) => res.data));
  }
}
