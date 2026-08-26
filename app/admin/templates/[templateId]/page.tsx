import { notFound } from 'next/navigation';
import { TemplateEditor } from '@/components/admin/template-editor';
import { getTemplateDetail } from '@/lib/queries';

export default async function TemplateEditorPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const detail = await getTemplateDetail(templateId);
  if (!detail) notFound();
  return <TemplateEditor template={detail.template} tasks={detail.tasks} />;
}
