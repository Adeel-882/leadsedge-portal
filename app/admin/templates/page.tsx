import { TemplatesClient } from '@/components/admin/templates-client';
import { getTemplates } from '@/lib/queries';

export default async function TemplatesPage() {
  return <TemplatesClient templates={await getTemplates()} />;
}
