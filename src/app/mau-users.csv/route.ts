import { csvResponse, mauUsersCsv } from '@/lib/mau-csv';

export const revalidate = 60;

export async function GET() {
  return csvResponse(await mauUsersCsv(), 'mau-users.csv');
}
