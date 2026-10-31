import { csvResponse, mauIncludedCsv } from '@/lib/mau-csv';

export const revalidate = 60;

export async function GET() {
  return csvResponse(await mauIncludedCsv(), 'mau-included.csv');
}
