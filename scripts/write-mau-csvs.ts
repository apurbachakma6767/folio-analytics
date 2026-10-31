import fs from 'fs';
import path from 'path';
import { buildMauCsvs } from '../src/lib/mau-csv';

async function main() {
  const out = path.join(process.cwd(), 'public');
  fs.mkdirSync(out, { recursive: true });
  const csvs = await buildMauCsvs();
  fs.writeFileSync(path.join(out, 'mau-discarded.csv'), csvs.discarded);
  fs.writeFileSync(path.join(out, 'mau-users.csv'), csvs.users);
  fs.writeFileSync(path.join(out, 'mau-included.csv'), csvs.included);
  console.log(
    JSON.stringify(
      {
        snapshotUtc: csvs.snapshotUtc,
        discarded: csvs.discardedCount,
        included: csvs.includedCount,
        users: csvs.userCount,
        qualified30: csvs.qualified30,
        files: ['public/mau-discarded.csv', 'public/mau-users.csv', 'public/mau-included.csv'],
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
