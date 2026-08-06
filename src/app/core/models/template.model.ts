export interface TemplateButton {
  type: 'reply' | 'url' | 'call' | 'copy';
  text: string;
  value: string;
}

export interface TemplateContent {
  text: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  buttons?: TemplateButton[];
}

export interface Template {
  id: string;
  name: string;
  category?: string;
  content: TemplateContent;
  variables: string[];
  preview?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateFormData {
  name: string;
  category?: string;
  content: TemplateContent;
  variables: string[];
}