import { CachedTask } from '@/components/cache/task';
import { requireRole } from '@/lib/auth';
import { getAuthorizedClientTask } from '@/lib/client-access';
import { initialScreen } from '@/lib/screen-data';
import { notFound } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ taskId: string }> }) {
  const viewer = await requireRole('client');
  const { taskId } = await params;
  const initial = await initialScreen('client', 'task', [taskId]);
  if (initial?.data === null) notFound();
  // Cold data includes the same assignment/disabled/visibility gate in its task
  // query. Warm navigation still revalidates access before exposing cached data.
  if (!initial && !await getAuthorizedClientTask(viewer.id, taskId)) notFound();
  return <CachedTask id={taskId} initial={initial} />;
}
