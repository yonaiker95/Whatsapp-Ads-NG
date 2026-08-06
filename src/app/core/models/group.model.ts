export interface Group {
  id: string;
  instanceId: string;
  instanceName?: string;
  jid: string;
  name: string;
  description?: string;
  participants?: number;
  tags: string[];
  excluded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GroupFormData {
  instanceId: string;
  jid: string;
  name: string;
  description?: string;
  tags: string[];
  excluded: boolean;
}