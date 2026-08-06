export interface AutoReply {
  id: string;
  instanceId: string;
  instanceName?: string;
  name: string;
  trigger: string;
  response: string;
  isActive: boolean;
  useAi?: boolean;
  aiInstructions?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutoReplyFormData {
  instanceId: string;
  name: string;
  trigger: string;
  response: string;
  isActive: boolean;
  useAi?: boolean;
  aiInstructions?: string | null;
}