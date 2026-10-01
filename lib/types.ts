export type Role = 'admin' | 'client';
export type ProjectStatus = 'active' | 'completed' | 'archived';
export type TaskStatus = 'draft' | 'active' | 'completed';
export type TaskType = 'standard' | 'form';
export type FeedbackState = 'not_configured' | 'pending' | 'waiting' | 'requested' | 'submitted' | 'cancelled';
export type FeedbackDelayUnit = 'minutes' | 'hours' | 'days';

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
  /** This viewer's membership flag, not a property of the project itself. */
  isPrimary: boolean;
};

/**
 * One openable conversation in the client Messages inbox. Every unread message
 * the navigation badge counts belongs to exactly one of these, so the badge can
 * never point at something the client has no route to.
 */
export type ConversationThread = {
  kind: 'project' | 'task';
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastSenderName?: string | null;
};

export type MessageWorkspaceThread = {
  key: string;
  kind: 'project' | 'task';
  resourceId: string;
  projectId: string;
  title: string;
  projectName: string;
  clientName: string | null;
  senderName: string | null;
  preview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type FormField = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'radio' | 'select' | 'checkbox';
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
  feedbackEnabled: boolean;
  feedbackDelayValue: number | null;
  feedbackDelayUnit: FeedbackDelayUnit | null;
  feedbackState: FeedbackState;
  feedbackScheduledFor: string | null;
  feedbackRequestedAt: string | null;
  feedbackSubmittedAt: string | null;
};

export type ClientTaskSummary = Pick<TaskRecord, 'id' | 'projectId' | 'title' | 'status' | 'feedbackState' | 'feedbackSubmittedAt' | 'requiresCompletion'> & {
  projectName: string;
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
  feedbackEnabled: boolean;
  feedbackDelayValue: number | null;
  feedbackDelayUnit: FeedbackDelayUnit | null;
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

export type FeedbackSubmission = {
  id: string;
  answers: Record<string, string | string[]>;
  submittedAt: string;
  submittedByName: string;
};

export type NotificationRecord = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  targetUrl: string;
};

export type AvailabilityRule = {
  weekday: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

export type AvailabilitySettings = {
  timezone: string;
  meetingDurationMinutes: number;
  bufferMinutes: number;
  minimumNoticeMinutes: number;
  maximumAdvanceDays: number;
  rules: AvailabilityRule[];
};

export type MeetingRecord = {
  id: string;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  ownerId: string;
  ownerName: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  timezone: string;
  durationMinutes: number;
  status: 'scheduled' | 'cancelled' | 'completed';
  googleEventHtmlLink: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
};

export type MeetingSlot = { startAt: string; endAt: string; label: string };

export type AdminConversationSummary = {
  kind: 'task' | 'project';
  resourceId: string;
  projectId: string;
  projectName: string;
  taskTitle: string | null;
  senderName: string;
  preview: string;
  lastMessageAt: string;
  unreadCount: number;
  href: string;
};
