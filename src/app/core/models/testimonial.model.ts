export interface Testimonial {
  id: string;
  author: string;
  role: string;
  company: string;
  quote: string;
  avatar: string;
  rating: number;
  result?: string;
  color: string;
  featured?: boolean;
  isActive?: boolean;
  sortOrder: number;
  createdAt?: string;
}

export interface TestimonialFormData {
  author: string;
  role?: string;
  company?: string;
  quote: string;
  avatar?: string;
  rating?: number;
  result?: string;
  color?: string;
  featured?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}
