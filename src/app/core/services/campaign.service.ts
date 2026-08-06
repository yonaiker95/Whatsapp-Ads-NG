import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Campaign, CampaignFormData } from '../models/campaign.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class CampaignService {
  constructor(private api: ApiService) {}

  getAll(): Observable<Campaign[]> {
    return this.api.get<Campaign[]>('/campaigns').pipe(map((res) => res.data));
  }

  getById(id: string): Observable<Campaign> {
    return this.api.get<Campaign>(`/campaigns/${id}`).pipe(map((res) => res.data));
  }

  create(data: CampaignFormData): Observable<Campaign> {
    return this.api.post<Campaign>('/campaigns', data).pipe(map((res) => res.data));
  }

  update(id: string, data: CampaignFormData): Observable<Campaign> {
    return this.api.put<Campaign>(`/campaigns/${id}`, data).pipe(map((res) => res.data));
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/campaigns/${id}`).pipe(map((res) => res.data));
  }

  send(id: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/campaigns/${id}/send`, {}).pipe(map((res) => res.data));
  }
}