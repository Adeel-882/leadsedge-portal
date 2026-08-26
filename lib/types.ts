export type Role = 'admin' | 'client';
export type ProjectStatus = 'active' | 'completed' | 'archived';
export type TaskStatus = 'draft' | 'active' | 'completed';
export type TaskType = 'standard' | 'form';

export type Viewer = {
  id: string;
  email: string;
  role: Role;
  fullName: string;
  avatarUrl?: string | null;
};

export type ClientSummary = {
  id: string;
  authUserId: string | null;
  fullName: string;
  email: string;
  company: string | null;
  status: 'invited' | 'active' | 'disabled';
};

export type ProjectSummary = {
  id: string;
  projectName: string;
  ownerName: string;
  clientName: string;
  clientId: string;
  status: ProjectStatus;
  completedTasks: number;
  totalTasks: number;
  createdAt: string;
};

export type FormField = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'radio';
  required?: boolean;
  options?: string[];
};

export type TaskRecord = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  taskType: TaskType;
  status: TaskStatus;
  clientVisible: boolean;
  requiresCompletion: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  formSchema: FormField[] | null;
};

export type TemplateSummary = {
  id: string;
  name: string;
  description: string;
  taskCount: number;
  archivedAt: string | null;
  updatedAt: string;
};

export type TemplateTaskRecord = {
  id: string;
  templateId: string;
  title: string;
  description: string;
  taskType: TaskType;
  sortOrder: number;
  clientVisible: boolean;
  requiresCompletion: boolean;
  formSchema: FormField[] | null;
};

export type ConversationMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: Role;
  body: string;
  attachmentUrl: string | null;
  createdAt: string;
};

export type ActivityEvent = {
  id: string;
  actorName: string;
  eventType: string;
  body: string;
  createdAt: string;
};

export type NotificationRecord = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};
