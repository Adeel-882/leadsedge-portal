import type { ActivityEvent, ClientSummary, ConversationMessage, FormField, NotificationRecord, ProjectSummary, TaskRecord, TemplateSummary, Viewer } from './types';

export const demoAdmin: Viewer = { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.test', role: 'admin', fullName: 'Admin' };
export const demoClientViewer: Viewer = { id: '00000000-0000-4000-8000-000000000002', email: 'adeel@example.test', role: 'client', fullName: 'Adeel Ahmed' };
export const demoClient: ClientSummary = { id: '00000000-0000-4000-8000-000000000010', authUserId: demoClientViewer.id, fullName: 'Adeel Ahmed', email: demoClientViewer.email, company: 'Demo Client', status: 'active' };

export const demoProjects: ProjectSummary[] = [
  { id: '00000000-0000-4000-8000-000000000100', projectName: 'Adeel Ahmed', ownerName: 'Admin', clientName: 'Adeel Ahmed', clientId: demoClient.id, status: 'active', completedTasks: 0, totalTasks: 1, createdAt: '2026-08-25T10:00:00.000Z' },
  { id: '00000000-0000-4000-8000-000000000101', projectName: 'Northstar Realty', ownerName: 'Admin', clientName: 'Maya Chen', clientId: '00000000-0000-4000-8000-000000000011', status: 'active', completedTasks: 1, totalTasks: 4, createdAt: '2026-08-23T10:00:00.000Z' },
  { id: '00000000-0000-4000-8000-000000000102', projectName: 'Oak & Co.', ownerName: 'Admin', clientName: 'Jordan Bell', clientId: '00000000-0000-4000-8000-000000000012', status: 'completed', completedTasks: 4, totalTasks: 4, createdAt: '2026-08-18T10:00:00.000Z' },
];

export const leadFeedbackForm: FormField[] = [
  { id: 'lead-name', label: 'Lead Name', type: 'text', required: true },
  { id: 'feedback', label: 'Feedback', type: 'textarea', required: true },
  { id: 'rating', label: 'Rating', type: 'radio', options: ['Excellent', 'Good', 'Average', 'Poor'], required: true },
  { id: 'connection', label: 'Lead Connection', type: 'select', options: ['Yes', 'No'], required: true },
  { id: 'score', label: 'Lead Score', type: 'select', options: ['1', '2', '3', '4', '5'], required: true },
];

export const demoTasks: TaskRecord[] = [
  { id: '00000000-0000-4000-8000-000000000200', projectId: demoProjects[0].id, title: 'Lead Assignment - Adeel Ahmed', description: '<h2>Lead details</h2><p><strong>Name:</strong> John Smith</p><p><strong>Phone:</strong> +1 (555) 014-2277</p><p><strong>Email:</strong> john@example.com</p><p><strong>Property type:</strong> Residential</p><p><strong>Location:</strong> Austin, TX</p><p><strong>Budget:</strong> $650,000</p><p><strong>Timeline:</strong> 60–90 days</p><p><strong>Notes:</strong> Looking for a three-bedroom home near good schools.</p>', taskType: 'standard', status: 'active', clientVisible: true, requiresCompletion: true, assigneeId: demoClient.id, assigneeName: demoClient.fullName, dueAt: null, activatedAt: '2026-08-26T09:00:00.000Z', completedAt: null, createdAt: '2026-08-25T10:00:00.000Z', formSchema: leadFeedbackForm, feedbackEnabled: true, feedbackDelayValue: 1, feedbackDelayUnit: 'days', feedbackState: 'pending', feedbackScheduledFor: null, feedbackRequestedAt: null, feedbackSubmittedAt: null },
];

export const demoTemplates: TemplateSummary[] = [
  { id: '00000000-0000-4000-8000-000000000300', name: 'Lead Assignment', description: 'Assign a lead, collect feedback, and keep each conversation together.', taskCount: 1, archivedAt: null, updatedAt: '2026-08-25T10:00:00.000Z' },
];

export const demoTaskMessages: ConversationMessage[] = [
  { id: '00000000-0000-4000-8000-000000000400', senderId: demoAdmin.id, senderName: 'Admin', senderRole: 'admin', body: 'Hi Adeel — the lead details are ready. Let me know if you need anything before reaching out.', attachmentUrl: null, createdAt: '2026-08-26T09:10:00.000Z' },
  { id: '00000000-0000-4000-8000-000000000401', senderId: demoClientViewer.id, senderName: 'Adeel Ahmed', senderRole: 'client', body: 'Thanks, I have it. I’ll make contact this afternoon.', attachmentUrl: null, createdAt: '2026-08-26T09:22:00.000Z' },
];

export const demoProjectMessages: ConversationMessage[] = [
  { id: '00000000-0000-4000-8000-000000000410', senderId: demoAdmin.id, senderName: 'Admin', senderRole: 'admin', body: 'Welcome to Leadsedge Portal. This chat is for general project updates.', attachmentUrl: null, createdAt: '2026-08-25T11:00:00.000Z' },
  { id: '00000000-0000-4000-8000-000000000411', senderId: demoClientViewer.id, senderName: 'Adeel Ahmed', senderRole: 'client', body: 'Thanks — everything looks clear.', attachmentUrl: null, createdAt: '2026-08-25T11:08:00.000Z' },
];

export const demoActivity: ActivityEvent[] = [
  { id: '1', actorName: 'Admin', eventType: 'task.created', body: 'created this task', createdAt: '2026-08-25T10:00:00.000Z' },
  { id: '2', actorName: 'Admin', eventType: 'task.assigned', body: 'assigned Adeel Ahmed', createdAt: '2026-08-25T10:05:00.000Z' },
  { id: '3', actorName: 'Admin', eventType: 'task.activated', body: 'activated this task', createdAt: '2026-08-26T09:00:00.000Z' },
];

export const demoNotifications: NotificationRecord[] = [
  { id: '1', type: 'task.message', title: 'New task comment', body: 'Adeel Ahmed commented on Lead Assignment.', readAt: null, createdAt: '2026-08-26T09:22:00.000Z', targetUrl: `/admin/projects/${demoProjects[0].id}/tasks/${demoTasks[0]?.id || '00000000-0000-4000-8000-000000000200'}#conversation` },
  { id: '2', type: 'project.message', title: 'New project message', body: 'Adeel Ahmed sent a project message.', readAt: null, createdAt: '2026-08-25T11:08:00.000Z', targetUrl: `/admin/projects/${demoProjects[0].id}/chat` },
  { id: '3', type: 'task.activated', title: 'Task activated', body: 'Lead Assignment is ready.', readAt: '2026-08-26T09:05:00.000Z', createdAt: '2026-08-26T09:00:00.000Z', targetUrl: `/portal/tasks/${demoTasks[0]?.id || '00000000-0000-4000-8000-000000000200'}` },
];
