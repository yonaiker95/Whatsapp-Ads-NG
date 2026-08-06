import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Plan, PlanAddonPrice, PlanFormData } from '../models/plan.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class PlanService {
  constructor(private api: ApiService) {}

  getPublicPlans(): Observable<Plan[]> {
    return this.api.get<Plan[]>('/plans').pipe(map((res) => res.data));
  }

  getAllPlans(): Observable<Plan[]> {
    return this.api.get<Plan[]>('/plans/all').pipe(map((res) => res.data));
  }

  createPlan(data: PlanFormData): Observable<Plan> {
    return this.api.post<Plan>('/plans', data).pipe(map((res) => res.data));
  }

  updatePlan(id: string, data: Partial<PlanFormData>): Observable<Plan> {
    return this.api.put<Plan>(`/plans/${id}`, data).pipe(map((res) => res.data));
  }

  deletePlan(id: string): Observable<unknown> {
    return this.api.delete<unknown>(`/plans/${id}`).pipe(map((res) => res.data));
  }

  getAddonPrices(): Observable<PlanAddonPrice[]> {
    return this.api.get<PlanAddonPrice[]>('/plans/addons').pipe(map((res) => res.data));
  }

  updateAddonPrices(addons: { key: string; unitAmount: number }[]): Observable<PlanAddonPrice[]> {
    return this.api.put<PlanAddonPrice[]>('/plans/addons', { addons }).pipe(map((res) => res.data));
  }
}
