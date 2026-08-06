import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Testimonial, TestimonialFormData } from '../models/testimonial.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TestimonialService {
  constructor(private api: ApiService) {}

  getPublicTestimonials(): Observable<Testimonial[]> {
    return this.api.get<Testimonial[]>('/testimonials').pipe(map((res) => res.data));
  }

  getAllTestimonials(): Observable<Testimonial[]> {
    return this.api.get<Testimonial[]>('/testimonials/all').pipe(map((res) => res.data));
  }

  createTestimonial(data: TestimonialFormData): Observable<Testimonial> {
    return this.api.post<Testimonial>('/testimonials', data).pipe(map((res) => res.data));
  }

  updateTestimonial(id: string, data: Partial<TestimonialFormData>): Observable<Testimonial> {
    return this.api.put<Testimonial>(`/testimonials/${id}`, data).pipe(map((res) => res.data));
  }

  deleteTestimonial(id: string): Observable<unknown> {
    return this.api.delete<unknown>(`/testimonials/${id}`).pipe(map((res) => res.data));
  }
}
