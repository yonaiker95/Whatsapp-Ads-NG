import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Template, TemplateFormData } from '../models/template.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TemplateService {
  constructor(private api: ApiService) {}

  getAll(): Observable<Template[]> {
    return this.api.get<Template[]>('/templates').pipe(map((res) => res.data));
  }

  getById(id: string): Observable<Template> {
    return this.api.get<Template>(`/templates/${id}`).pipe(map((res) => res.data));
  }

  create(data: TemplateFormData): Observable<Template> {
    return this.api.post<Template>('/templates', data).pipe(map((res) => res.data));
  }

  update(id: string, data: TemplateFormData): Observable<Template> {
    return this.api.put<Template>(`/templates/${id}`, data).pipe(map((res) => res.data));
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/templates/${id}`).pipe(map((res) => res.data));
  }
}