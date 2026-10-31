import { csvResponse, depositAttemptsCsv } from '@/lib/mau-csv';

export const revalidate = 60;

export async function GET() {
  return csvResponse(await depositAttemptsCsv(), 'deposit-attempts.csv');
}
