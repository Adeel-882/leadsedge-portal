import { headers } from 'next/headers';
import { requireRole } from './auth';
import { getAdminClients, getAdminProjects, getClientProjects, getClientTaskList, getNotifications, getTemplates, getTask, getTaskMessages, getProjectMessages, getClientConversationThreads, getAdminMessageInbox } from './queries';
import { getPeople } from './people';
import { getMeetings, getNextMeeting } from './meetings';
import { canClientAccessTask } from './authorization';
import { adminWorkspaceThreads, clientWorkspaceThreads } from './message-workspace';
import type { Role } from './types';
export const screenLoaders = {
  dashboard: async () => { const [projects, clients, upcomingMeeting] = await Promise.all([getAdminProjects(), getAdminClients(), getNextMeeting()]); return { projects, clients, upcomingMeeting }; },
  people: async (args: string[]) => getPeople(args[0] || '', Math.max(1, Math.min(10000, Number(args[1]) || 1))),
  templates: async () => getTemplates(),
  home: async () => { const [projects, notifications, nextMeeting, allTasks] = await Promise.all([getClientProjects(), getNotifications(5), getNextMeeting(), getClientTaskList()]); return { projects, notifications, nextMeeting, allTasks }; },
  tasks: async () => getClientTaskList(),
  task: async (args: string[]) => {
    const viewer = await requireRole('client');
    const [task, messages, projects] = await Promise.all([getTask(args[0], viewer.id), getTaskMessages(args[0]), getClientProjects()]);
    const project = task && projects.find(item => item.id === task.projectId);
    if (!task || !project || !canClientAccessTask(task, project.clientId)) return null;
    return { task, messages, project };
  },
  meetings: async (_args: string[], role: Role) => { const [meetings, projects] = await Promise.all([getMeetings(), role === 'client' ? getClientProjects(true) : Promise.resolve([])]); return { meetings, projects }; },
  conversations: async (_args: string[], role: Role) => {
    if (role === 'client') return { threads: clientWorkspaceThreads(await getClientConversationThreads()), projects: [] };
    const [inbox, projects] = await Promise.all([getAdminMessageInbox(), getAdminProjects()]);
    return { threads: adminWorkspaceThreads(inbox, projects), projects: projects.filter(p => p.status === 'active') };
  },
};
export type ScreenName = keyof typeof screenLoaders;
export type ScreenData<K extends ScreenName> = Awaited<ReturnType<typeof screenLoaders[K]>>;
export function allowedScreen(role: Role, screen: string): screen is ScreenName {
  return (role === 'admin' ? ['dashboard','people','templates','meetings','conversations'] : ['home','tasks','task','meetings','conversations']).includes(screen);
}
export async function loadScreen<K extends ScreenName>(role: Role, screen: K, args: string[] = []): Promise<ScreenData<K>> {
  if (!allowedScreen(role, screen)) throw new Error('Unavailable screen.');
  return await screenLoaders[screen](args, role) as ScreenData<K>;
}
export async function initialScreen<K extends ScreenName>(role: Role, screen: K, args: string[] = []) {
  // Ordinary RSC navigation still runs the layout's authoritative role check.
  // Business data comes from the browser cache; document loads retain SSR.
  // Vinext's next/headers deliberately removes FLIGHT_HEADERS (including RSC).
  // The standard Accept header survives and is set by Vinext route navigation.
  if ((await headers()).get('accept')?.split(',').some(value => value.trim().split(';')[0] === 'text/x-component')) return undefined;
  return { data: await loadScreen(role, screen, args), updatedAt: Date.now() };
}
export { getProjectMessages, getTaskMessages };
