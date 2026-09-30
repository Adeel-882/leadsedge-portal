import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEEDBACK_DELAY_MAX, FEEDBACK_DELAY_MIN, clampFeedbackDelay, describeFeedbackDelay, feedbackAvailableAt } from '@/lib/scheduling';
import { feedbackConfigurationSchema } from '@/lib/validation';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const queries = read('../lib/queries.ts');
const templatesPage = read('../app/admin/templates/page.tsx');
const templatesClient = read('../components/admin/templates-client.tsx');
const templateEditor = read('../components/admin/template-editor.tsx');
const tasksClient = read('../components/admin/tasks-client.tsx');
const defaultRoute = read('../app/api/admin/templates/default/route.ts');
const workflow = read('../supabase/migrations/202608270001_single_lead_workflow.sql');
const phase2 = read('../supabase/migrations/202608270003_phase2_automation_and_meetings.sql');
const phase1 = read('../supabase/migrations/202608260001_phase1.sql');

describe('reusable templates are visible to an administrator', () => {
  it('lists every template without an owner, project, or archived filter', () => {
    // An empty page must mean an empty table, never a filter quietly hiding rows.
    const listQuery = queries.slice(queries.indexOf('export async function getTemplates()'), queries.indexOf('export async function getTemplateTasks'));
    expect(listQuery).toContain(".from('templates')");
    // archived_at is selected for display; what matters is that nothing narrows
    // the result set -- no equality, null, or negation filter of any kind.
    expect(listQuery).not.toContain('.eq(');
    expect(listQuery).not.toContain('.is(');
    expect(listQuery).not.toContain('.not(');
    expect(listQuery).not.toContain('.filter(');
    expect(templatesPage).toContain("initialScreen('admin','templates')");
    expect(read('../lib/screen-data.ts')).toContain('templates: async () => getTemplates()');
  });

  it('scopes template access to administrators through row level security', () => {
    expect(phase1).toContain('create policy "admins manage templates" on public.templates for all using (public.is_admin())');
    expect(phase1).toContain('create policy "admins manage template tasks" on public.template_tasks for all using (public.is_admin())');
  });

  it('offers a way back when the table really is empty', () => {
    expect(templatesClient).toContain('No templates yet');
    expect(templatesClient).toContain('restoreDefaultTemplate');
    expect(templatesClient).toContain('Restore Lead Assignment workflow');
  });
});

describe('restoring the default Lead Assignment workflow', () => {
  it('calls the products own idempotent seeder rather than inventing rows', () => {
    expect(defaultRoute).toContain("supabase.rpc('seed_default_template')");
    expect(defaultRoute).not.toContain(".from('templates').insert");
    expect(defaultRoute).not.toContain(".from('template_tasks').insert");
  });

  it('cannot create a duplicate template or a duplicate task', () => {
    const seeder = workflow.slice(workflow.indexOf('create or replace function public.seed_default_template'));
    expect(seeder).toContain("select id into template_uuid from public.templates where name = 'Lead Assignment' and archived_at is null");
    expect(seeder).toContain('if template_uuid is null then');
    expect(seeder).toContain('if not exists(select 1 from public.template_tasks where template_id = template_uuid) then');
  });

  it('requires an administrator at both the route and the database', () => {
    expect(defaultRoute).toContain("requireApiRole('admin')");
    const seeder = workflow.slice(workflow.indexOf('create or replace function public.seed_default_template'));
    expect(seeder).toContain("if not public.is_admin() then raise exception 'Administrator access required'; end if;");
  });

  it('seeds the workflow with a configured relative delay', () => {
    const seeder = workflow.slice(workflow.indexOf('create or replace function public.seed_default_template'));
    expect(seeder).toContain('feedback_enabled, feedback_delay_value, feedback_delay_unit');
    expect(seeder).toContain("true, 1, 'days'");
  });
});

describe('configurable relative timing', () => {
  it('keeps the numeric amount editable rather than offering fixed presets', () => {
    expect(templateEditor).toContain('type="number"');
    expect(templateEditor).toContain('aria-label="Delay amount"');
    expect(templateEditor).toContain('clampFeedbackDelay(Number(event.target.value))');
    expect(templateEditor).not.toContain('value={7}');
  });

  it('shows the configured timing on the task row, without opening the editor', () => {
    // The complaint was that existing data was not exposed: the drawer only
    // mounts on click, so the row itself has to state the schedule.
    expect(templateEditor).toContain('describeFeedbackDelay(task.feedbackDelayValue, task.feedbackDelayUnit)');
    expect(templateEditor).toContain("'No follow-up step'");
  });

  it('exposes the unit and the trigger the schedule is measured from', () => {
    expect(templateEditor).toContain('aria-label="Delay unit"');
    expect(templateEditor).toContain('aria-label="Timing reference"');
    expect(templateEditor).toContain('After the previous task is completed');
  });

  it('preserves any supported numeric delay value', () => {
    for (const value of [1, 2, 3, 7, 10]) {
      expect(clampFeedbackDelay(value)).toBe(value);
      expect(feedbackConfigurationSchema.safeParse({ enabled: true, delayValue: value, delayUnit: 'days', formSchema: [{ id: 'a', label: 'A', type: 'text', required: true }] }).success).toBe(true);
    }
  });

  it('clamps to the bounds the database constraint enforces', () => {
    expect(clampFeedbackDelay(0)).toBe(FEEDBACK_DELAY_MIN);
    expect(clampFeedbackDelay(-4)).toBe(FEEDBACK_DELAY_MIN);
    expect(clampFeedbackDelay(999)).toBe(FEEDBACK_DELAY_MAX);
    expect(clampFeedbackDelay(Number.NaN)).toBe(FEEDBACK_DELAY_MIN);
  });

  it('keeps the editor, the request schema and the CHECK constraint on one bound', () => {
    expect(workflow).toContain('check (feedback_delay_value is null or feedback_delay_value between 1 and 10)');
    expect(FEEDBACK_DELAY_MIN).toBe(1);
    expect(FEEDBACK_DELAY_MAX).toBe(10);
    expect(read('../lib/validation.ts')).toContain('z.number().int().min(FEEDBACK_DELAY_MIN).max(FEEDBACK_DELAY_MAX)');
  });

  it('describes the delay in the trigger-relative language the admin configured', () => {
    expect(describeFeedbackDelay(7, 'days')).toBe('7 days after the previous task is completed');
    expect(describeFeedbackDelay(1, 'days')).toBe('1 day after the previous task is completed');
    expect(describeFeedbackDelay(null, null)).toBe('Immediately after completion');
  });
});

describe('the schedule is measured from actual completion', () => {
  it('turns a 10 September completion with a 7 day delay into 17 September', () => {
    const available = feedbackAvailableAt('2026-09-10T14:30:00.000Z', 7, 'days');

    expect(available!.toISOString()).toBe('2026-09-17T14:30:00.000Z');
  });

  it('uses the completion moment, not the import, project, or current date', () => {
    const early = feedbackAvailableAt('2026-01-05T00:00:00.000Z', 3, 'days');
    const late = feedbackAvailableAt('2026-06-05T00:00:00.000Z', 3, 'days');

    expect(early!.toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(late!.toISOString()).toBe('2026-06-08T00:00:00.000Z');
  });

  it('handles hour delays and rejects an unusable completion timestamp', () => {
    expect(feedbackAvailableAt('2026-09-10T14:00:00.000Z', 2, 'hours')!.toISOString()).toBe('2026-09-10T16:00:00.000Z');
    expect(feedbackAvailableAt('not-a-date', 7, 'days')).toBeNull();
  });

  it('matches how the database computes it on completion', () => {
    // complete_project_task() sets feedback_scheduled_for = now() + interval, so
    // the anchor is the completion itself.
    expect(phase2).toContain('scheduled_for := now() + case task_row.feedback_delay_unit');
    expect(phase2).toContain('else make_interval(days => coalesce(task_row.feedback_delay_value, 1))');
    expect(phase2).toContain("status = 'completed', completed_at = now()");
    expect(phase2).toContain('feedback_scheduled_for = scheduled_for');
  });

  it('releases the follow-up only once the scheduled moment has passed', () => {
    expect(phase2).toContain("feedback_state = 'waiting' and feedback_scheduled_for <= now()");
  });
});

describe('import creates an independent project copy', () => {
  it('copies the template timing into new project task rows', () => {
    const importer = workflow.slice(workflow.indexOf('create or replace function public.import_template_tasks'));
    expect(importer).toContain('insert into public.project_tasks(');
    expect(importer).toContain('template_task_row.feedback_delay_value, template_task_row.feedback_delay_unit');
    expect(importer).toContain('feedback_delay_value, feedback_delay_unit, feedback_state');
  });

  it('never updates existing project tasks when a template changes', () => {
    const importer = workflow.slice(workflow.indexOf('create or replace function public.import_template_tasks'), workflow.indexOf('create or replace function public.complete_project_task'));
    expect(importer).not.toContain('update public.project_tasks');
    // The editor states the same contract to the administrator.
    expect(templateEditor).toContain('Changes affect future imports only. Existing project tasks remain independent.');
    expect(templateEditor).toContain('Existing project tasks will not be changed.');
  });

  it('requires an administrator to import', () => {
    const importer = workflow.slice(workflow.indexOf('create or replace function public.import_template_tasks'));
    expect(importer).toContain("if not public.is_admin() then raise exception 'Administrator access required'; end if;");
  });
});

describe('the import selector', () => {
  it('offers the available templates and preselects the first', () => {
    expect(tasksClient).toContain('useState(templates[0]?.id || \'\')');
    expect(tasksClient).toContain('templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)');
    expect(tasksClient).toContain('<option value="">Select a template</option>');
  });

  it('preselects that template workflow steps so a single template imports cleanly', () => {
    expect(tasksClient).toContain('useState<string[]>(templateTasks[templates[0]?.id]?.map((task) => task.id) || [])');
    expect(tasksClient).toContain('function selectTemplate(id: string) { setSelectedTemplate(id); setSelectedTaskIds((templateTasks[id] || []).map((task) => task.id)); }');
  });
});

describe('client exposure is unchanged', () => {
  it('shows a client only active, visible, unarchived tasks assigned to them', () => {
    const taskList = queries.slice(queries.indexOf('export async function getClientTaskList'));
    expect(taskList).toContain(".eq('assignee.auth_user_id', viewer.id)");
    expect(taskList).toContain(".neq('assignee.status', 'disabled')");
    expect(taskList).toContain(".eq('client_visible', true)");
    expect(taskList).toContain(".neq('status', 'draft')");
    expect(taskList).toContain(".is('archived_at', null)");
  });

  it('imports as a draft by default so nothing reaches the client unreviewed', () => {
    expect(workflow).toContain("initial_task_status public.task_status default 'draft'");
    expect(tasksClient).toContain("useState<'draft' | 'active'>('draft')");
  });

  it('lets only the assigned client complete a lead, which is what starts the clock', () => {
    expect(phase2).toContain('task_row.assignee_id <> public.current_client_id()');
  });
});
