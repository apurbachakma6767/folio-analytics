import { csvResponse, mauDiscardedCsv } from '@/lib/mau-csv';

export const revalidate = 60;

export async function GET() {
  return csvResponse(await mauDiscardedCsv(), 'mau-discarded.csv');
}
