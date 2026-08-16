import { loadDashboard } from '@/lib/data';
import { Dashboard } from '@/components/Dashboard';

export const revalidate = 60;

export default async function Page() {
  const data = await loadDashboard();
  return <Dashboard data={data} />;
}
