import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { AutoReply, AutoReplyFormData } from '../models/auto-reply.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AutoReplyService {
  constructor(private api: ApiService) {}

  getAll(): Observable<AutoReply[]> {
    return this.api.get<AutoReply[]>('/auto-replies').pipe(map((res) => res.data));
  }

  getById(id: string): Observable<AutoReply> {
    return this.api.get<AutoReply>(`/auto-replies/${id}`).pipe(map((res) => res.data));
  }

  create(data: AutoReplyFormData): Observable<AutoReply> {
    return this.api.post<AutoReply>('/auto-replies', data).pipe(map((res) => res.data));
  }

  update(id: string, data: AutoReplyFormData): Observable<AutoReply> {
    return this.api.put<AutoReply>(`/auto-replies/${id}`, data).pipe(map((res) => res.data));
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/auto-replies/${id}`).pipe(map((res) => res.data));
  }
}