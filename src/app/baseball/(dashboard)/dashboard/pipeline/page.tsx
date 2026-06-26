import { requireRecruitingCoachRoute } from '@/lib/baseball/server-route-guards';
import PipelineClient from './PipelineClient';

export default async function PipelinePage() {
  await requireRecruitingCoachRoute();
  return <PipelineClient />;
}
