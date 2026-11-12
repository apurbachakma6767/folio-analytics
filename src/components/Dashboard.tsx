'use client';

import { useMemo, useState } from 'react';
import type { ClassifiedTx, DashboardData, DayPoint, TxTab } from '@/lib/types';

const TABS: { id: TxTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'contract', label: 'Vault activity' },
  { id: 'spend', label: 'Spends' },
  { id: 'repay', label: 'Repayments' },
  { id: 'collateral', label: 'Collateral' },
];

const KIND_LABEL: Record<string, string> = {
  contract: 'Vault activity',
  spend: 'Spend',
  repay: 'Repay',
  collateral: 'Collateral',
};

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10b981]';

const TX_PAGE = 50;

export function Dashboard({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<TxTab>('all');
  const [q, setQ] = useState('');
  const [txLimit, setTxLimit] = useState(TX_PAGE);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.txs.filter((tx) => {
      if (tab !== 'all' && !tx.kinds.includes(tab)) return false;
      if (!needle) return true;
      const blob = [
        tx.id,
        tx.name,
        tx.method,
        tx.vaultId,
        tx.user?.accountId,
        tx.symbol,
        tx.amountLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [data.txs, tab, q]);

  const visible = rows.slice(0, txLimit);
  const totalShares = data.collateral.reduce((s, c) => s + c.shares, 0);
  const win = `${fmtDay(data.window.start)} → ${fmtDay(data.window.end)} UTC`;
  const previous = data.vaults.find((v) => v.role === 'previous');
  const live = data.vaults.find((v) => v.role === 'live');
  const networkLabel = data.network === 'mainnet' ? 'Mainnet' : 'Testnet';

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-[1200px] px-6 py-8">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">
              Folio · snapshot {fmtSnap(data.fetchedAt)}
            </p>
            <span className="rounded-full bg-[#f59e0b]/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#f59e0b]">
              {networkLabel}
            </span>
          </div>
          <h1 className="mt-2 text-[28px] font-bold tracking-[-0.01em] text-pretty text-[#f5f5f7]">
            Vault analytics
          </h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[#a1a1aa]">
            Who is using Folio, what is locked, and what has been repaid. Figures use closed UTC
            days only.
          </p>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-[1200px] space-y-10 px-6 py-10 focus:outline-none">
        <section
          aria-labelledby="mau-heading"
          className="rounded-2xl border border-white/[0.06] bg-[#161618] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.32)] md:p-6"
        >
          <h2 id="mau-heading" className="text-[20px] font-semibold text-[#f5f5f7]">
            Monthly active users
          </h2>
          <p className="mt-1 text-[13px] text-[#a1a1aa]">Both vaults · {win}</p>
          <div className="mt-5 grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">
                Users with 2+ deposits
              </p>
              <p className="mt-1 text-[44px] font-bold leading-none tracking-[-0.02em] tabular text-[#10b981]">
                {fmtInt(data.mau.qualified30)}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-[#f5f5f7]">
                People with at least 2 successful deposits in the window.
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">
                One deposit only
              </p>
              <p className="mt-1 text-[28px] font-bold tracking-[-0.02em] tabular text-[#f5f5f7]">
                {fmtInt(data.mau.single30)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">
                Any deposit
              </p>
              <p className="mt-1 text-[28px] font-bold tracking-[-0.02em] tabular text-[#f5f5f7]">
                {fmtInt(data.mau.d30)}
              </p>
            </div>
          </div>

          <dl className="mt-6 max-w-3xl divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#0c0c0e]/60 text-[13px] leading-relaxed">
            <RuleRow term="Window">
              Last {data.window.days} closed UTC days, {win}. Today is not counted.
            </RuleRow>
            <RuleRow term="What counts">
              Successful user deposits in that window. Repayments are not counted.
            </RuleRow>
            <RuleRow term="What is excluded">
              The operator account is left out. {fmtInt(data.mau.excludedCount)} deposits in this
              window are on the excluded list and are not counted. The Excluded transactions
              download is that list.
            </RuleRow>
            <RuleRow term="Headline number">
              Users with at least 2 successful deposits in the window (large figure above).
            </RuleRow>
          </dl>

          <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">
            Downloads
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CsvLink
              href="/mau-included.csv"
              filename="folio-mau-included.csv"
              title="Included transactions"
              hint="Deposits in MAU"
              primary
            />
            <CsvLink
              href="/mau-users.csv"
              filename="folio-mau-users.csv"
              title="User wallets"
              hint="Account IDs match the other downloads"
            />
            <CsvLink
              href="/mau-discarded.csv"
              filename="folio-mau-discarded.csv"
              title="Excluded transactions"
              hint="Not counted in MAU"
            />
            <CsvLink
              href="/deposit-attempts.csv"
              filename="folio-deposit-attempts.csv"
              title="Deposit attempt log"
              hint="Every deposit attempt"
            />
          </div>
        </section>

        {previous && live ? (
          <section
            aria-labelledby="vault-heading"
            className="rounded-2xl border border-white/[0.06] bg-[#161618] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.32)]"
          >
            <h2
              id="vault-heading"
              className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]"
            >
              Vault upgraded{data.cutoverDate ? ` · ${fmtDay(data.cutoverDate)}` : ''}
            </h2>
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[#f5f5f7]">
              Folio moved to a new vault and carried the collateral over. History from the previous
              vault still counts. The live vault is the current book.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <VaultCard book={previous} />
              <VaultCard book={live} />
            </div>
          </section>
        ) : live ? (
          <section className="flex justify-end">
            <a
              href={live.explorer}
              target="_blank"
              rel="noreferrer"
              className={`rounded-lg border border-white/[0.08] bg-[#161618] px-4 py-2 text-[13px] text-[#a1a1aa] transition duration-150 hover:border-[#10b981]/40 hover:text-[#f5f5f7] ${FOCUS}`}
            >
              View live vault ↗<NewTab />
            </a>
          </section>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.06] bg-[#161618] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.32)] md:col-span-2">
            <h2 className="text-[20px] font-semibold text-[#f5f5f7]">Locked in live vault</h2>
            <p className="mt-1 text-[13px] text-[#a1a1aa]">
              Equity held in the live vault right now
              {previous ? ', after the move from the previous vault' : ''}.
            </p>
            <CollateralTray slices={data.collateral} total={totalShares} />
          </div>
          <Stat
            label="Repayments released"
            value={fmtInt(data.notes.solidityReleaseSuccess30)}
            hint={`${fmtInt(data.notes.onChainRepayTxs)} repayment transactions · ${fmtInt(data.notes.repaid)} receipts`}
          />
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <ChartCard
            title="Daily unique depositors"
            caption="Unique people who deposited each day. Excluded deposits and the operator are left out."
            format="count"
            series={[{ label: 'Depositors', color: '#10b981', points: data.mau.series }]}
          />
          <ChartCard
            title="Spend volume"
            caption="Dollars advanced versus receipts marked repaid, per day."
            format="usd"
            series={[
              { label: 'Advanced', color: '#3b82f6', points: data.spendSeries },
              { label: 'Repaid', color: '#10b981', points: data.repaySeries },
            ]}
          />
          <div className="md:col-span-2">
            <ChartCard
              title="Repayment transactions"
              caption="Repayment transactions per day. Counts, not dollars."
              format="count"
              series={[{ label: 'Repayment transactions', color: '#3b82f6', points: data.repayChainSeries }]}
            />
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">
                Transactions
              </p>
              <h2 className="mt-1 text-[20px] font-semibold text-[#f5f5f7]">Ledger</h2>
              <p className="mt-1 text-[13px] text-[#a1a1aa]">
                Times in UTC, same as the window. Account IDs match the CSV downloads.
              </p>
            </div>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setTxLimit(TX_PAGE);
              }}
              aria-label="Filter transactions"
              name="ledger-filter"
              autoComplete="off"
              spellCheck={false}
              placeholder="Filter account, tx, type…"
              className={`h-11 w-full max-w-xs rounded-xl border border-white/[0.08] bg-transparent px-3 text-[13px] text-[#f5f5f7] placeholder:text-[#a1a1aa] ${FOCUS}`}
            />
          </div>

          <div className="mb-3 flex w-full snap-x gap-1 overflow-x-auto rounded-lg border border-white/[0.06] bg-[#161618] p-1">
            {TABS.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setTab(t.id);
                    setTxLimit(TX_PAGE);
                  }}
                  className={`min-h-11 shrink-0 snap-start rounded-lg px-4 text-[13px] font-medium transition duration-150 ${FOCUS} ${
                    on
                      ? 'bg-[#10b981] text-[#04210f]'
                      : 'text-[#a1a1aa] hover:text-[#f5f5f7]'
                  }`}
                >
                  {t.label}
                  <span className="ml-1.5 tabular opacity-70">{data.counts[t.id]}</span>
                </button>
              );
            })}
          </div>

          <TxTable rows={visible} />
          {rows.length > visible.length ? (
            <button
              type="button"
              onClick={() => setTxLimit((n) => n + TX_PAGE)}
              className={`mt-3 min-h-11 rounded-lg border border-white/[0.08] bg-[#1e1e21] px-4 text-[13px] font-semibold text-[#f5f5f7] transition duration-150 hover:-translate-y-px ${FOCUS}`}
            >
              Show more ({fmtInt(visible.length)} of {fmtInt(rows.length)})
            </button>
          ) : null}
          <p className="mt-3 text-[13px] text-[#a1a1aa]">
            Showing {fmtInt(visible.length)} of {fmtInt(rows.length)} · snapshot{' '}
            {fmtSnap(data.fetchedAt)}.
          </p>
        </section>
      </main>
    </div>
  );
}

function CsvLink({
  href,
  filename,
  title,
  hint,
  primary,
}: {
  href: string;
  filename: string;
  title: string;
  hint: string;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      download={filename}
      className={`flex min-h-11 flex-col justify-center rounded-lg px-4 py-3 transition duration-150 hover:-translate-y-px ${FOCUS} ${
        primary
          ? 'bg-[#10b981] text-[#04210f] shadow-[0_8px_24px_rgba(16,185,129,0.18)] hover:bg-[#059669]'
          : 'border border-white/[0.08] bg-[#1e1e21] text-[#f5f5f7] hover:border-[#10b981]/40'
      }`}
    >
      <span className="text-[14px] font-semibold">↓ {title}</span>
      <span className={`text-[12px] ${primary ? 'text-[#04210f]/70' : 'text-[#a1a1aa]'}`}>{hint}</span>
    </a>
  );
}

function VaultCard({ book }: { book: DashboardData['vaults'][number] }) {
  const label = book.role === 'live' ? 'Live vault' : 'Previous vault';
  return (
    <a
      href={book.explorer}
      target="_blank"
      rel="noreferrer"
      className={`block rounded-xl border border-white/[0.08] bg-[#0c0c0e]/60 p-4 transition duration-200 hover:border-[#10b981]/40 ${FOCUS}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">{label}</p>
      <p className="mt-1 text-[13px] text-[#10b981]">
        View on explorer ↗<NewTab />
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
        <div>
          <dt className="text-[#a1a1aa]">Deposits (30d)</dt>
          <dd className="tabular text-[#f5f5f7]">{fmtInt(book.deposits30)}</dd>
        </div>
        <div>
          <dt className="text-[#a1a1aa]">Unique depositors (30d)</dt>
          <dd className="tabular text-[#f5f5f7]">{fmtInt(book.uniqueDepositors30)}</dd>
        </div>
        <div>
          <dt className="text-[#a1a1aa]">Repayments released (30d)</dt>
          <dd className="tabular text-[#10b981]">{fmtInt(book.releasesSuccess30)}</dd>
        </div>
        <div>
          <dt className="text-[#a1a1aa]">Failed releases (30d)</dt>
          <dd
            className={`tabular ${book.releasesFailed30 > 0 ? 'text-[#ef4444]' : 'text-[#f5f5f7]'}`}
          >
            {fmtInt(book.releasesFailed30)}
          </dd>
        </div>
      </dl>
    </a>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#161618] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.32)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">{label}</p>
      <p
        className={`mt-2 text-[28px] font-bold tracking-[-0.02em] tabular ${
          accent ? 'text-[#10b981]' : 'text-[#f5f5f7]'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[13px] text-[#a1a1aa]">{hint}</p>
    </div>
  );
}

function CollateralTray({
  slices,
  total,
}: {
  slices: DashboardData['collateral'];
  total: number;
}) {
  if (!slices.length) {
    return (
      <div className="mt-3 rounded-xl border border-white/[0.06] bg-[#0c0c0e]/60 px-5 py-8 text-[15px] text-[#a1a1aa]">
        No equity sitting in the vault right now.
      </div>
    );
  }
  const palette = ['#10b981', '#059669', '#3b82f6', '#a1a1aa', '#f59e0b', '#ef4444', '#71717a'];
  return (
    <div className="mt-3">
      <div className="flex h-10 overflow-hidden rounded-lg">
        {slices.map((s, i) => (
          <div
            key={s.tokenId}
            role="img"
            aria-label={`${s.symbol} ${s.shares.toFixed(4)}`}
            title={`${s.symbol} ${s.shares.toFixed(4)}`}
            style={{
              width: `${Math.max(2, (s.shares / total) * 100)}%`,
              background: palette[i % palette.length],
            }}
          />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
        {slices.map((s, i) => (
          <li key={s.tokenId} className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="flex items-center gap-2 text-[#a1a1aa]">
              <i
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: palette[i % palette.length] }}
                aria-hidden="true"
              />
              {s.symbol}
            </span>
            <span className="tabular text-[#f5f5f7]">{s.shares.toFixed(4)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartCard({
  title,
  caption,
  series,
  format,
}: {
  title: string;
  caption: string;
  series: { label: string; color: string; points: DayPoint[] }[];
  format: 'usd' | 'count';
}) {
  const days = series[0]?.points ?? [];
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const w = 640;
  const h = 160;
  const pad = 8;
  const toPts = (points: DayPoint[]) =>
    points.map((s, i) => {
      const x = pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
      const y = h - pad - (s.value / max) * (h - pad * 2);
      return `${x},${y}`;
    });
  const lastOf = (points: DayPoint[]) => points[points.length - 1];
  const fmtVal = (v: number) => (format === 'usd' ? usd(v) : fmtInt(v));
  const fmt = (s: { points: DayPoint[] }) => fmtVal(lastOf(s.points)?.value ?? 0);
  const summary = series
    .map((s) => {
      const last = lastOf(s.points);
      if (!last) return `${s.label}: no data.`;
      const peak = s.points.reduce((m, p) => (p.value > m.value ? p : m), s.points[0]);
      const lo = Math.min(...s.points.map((p) => p.value));
      return `${s.label}: latest ${fmtVal(last.value)} on ${fmtDay(last.day)}, range ${fmtVal(lo)} to ${fmtVal(peak.value)}, peak on ${fmtDay(peak.day)}.`;
    })
    .join(' ');
  const rangeText = days.length
    ? `${fmtDay(days[0].day)} to ${fmtDay(days[days.length - 1].day)}, ${days.length} days.`
    : 'No data.';

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#161618] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.32)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[20px] font-semibold text-pretty text-[#f5f5f7]">{title}</h2>
          <p className="mt-1 text-[13px] text-[#a1a1aa]">{caption}</p>
          {series.length > 1 ? (
            <ul className="mt-3 flex flex-wrap gap-4">
              {series.map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-[13px] text-[#a1a1aa]">
                  <i
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: s.color }}
                    aria-hidden="true"
                  />
                  {s.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {series.map((s) => (
            <div key={s.label} className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">
                {series.length > 1 ? s.label : 'Latest'}
              </p>
              <p className="tabular text-[20px] font-semibold text-[#f5f5f7]">{fmt(s)}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">
        {title}. {rangeText} {summary}
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-40 w-full" aria-hidden="true" focusable="false">
        {series.map((s) => {
          const pts = toPts(s.points);
          const area = `${pad},${h - pad} ${pts.join(' ')} ${w - pad},${h - pad}`;
          return (
            <g key={s.label}>
              <polyline fill={`${s.color}22`} stroke="none" points={area} />
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                points={pts.join(' ')}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
      {days.length ? (
        <p className="mt-2 text-[11px] uppercase tracking-[0.06em] text-[#a1a1aa]">
          {fmtDay(days[0].day)} – {fmtDay(days[days.length - 1].day)}
        </p>
      ) : null}
    </div>
  );
}

function ResultText({ tx }: { tx: ClassifiedTx }) {
  return (
    <span className={tx.result === 'SUCCESS' ? 'text-[#10b981]' : 'text-[#ef4444]'}>
      {tx.result === 'SUCCESS' ? 'Success' : tx.result === 'REVERT' ? 'Reverted' : tx.result}
    </span>
  );
}

function KindChips({ tx }: { tx: ClassifiedTx }) {
  return (
    <div className="flex flex-wrap gap-1">
      {tx.kinds.map((k) => (
        <span
          key={k}
            className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]"
        >
          {KIND_LABEL[k] || k}
        </span>
      ))}
    </div>
  );
}

function vaultText(tx: ClassifiedTx) {
  return tx.vaultRole === 'previous' ? 'Previous' : tx.vaultRole === 'live' ? 'Live' : '—';
}

function ReceiptLink({ tx, className }: { tx: ClassifiedTx; className: string }) {
  return (
    <a
      href={tx.explorerUrl}
      target="_blank"
      rel="noreferrer"
      className={`${className} ${FOCUS}`}
    >
      View receipt ↗<NewTab />
    </a>
  );
}

function TxTable({ rows }: { rows: ClassifiedTx[] }) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#161618] px-5 py-12 text-center text-[15px] text-[#a1a1aa]">
        No transactions in this tab.
      </div>
    );
  }
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {rows.map((tx) => (
          <li
            key={tx.id + tx.consensus}
            className="rounded-2xl border border-white/[0.06] bg-[#161618] p-4 text-[13px]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="tabular text-[#a1a1aa]">{fmtWhen(tx.at)} UTC</span>
              <ResultText tx={tx} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <KindChips tx={tx} />
              <span className="text-[#a1a1aa]">{vaultText(tx)} vault</span>
            </div>
            <p className="mt-2 text-[#f5f5f7]">
              {detailLabel(tx)}
              {tx.symbol ? <span className="ml-2 text-[#a1a1aa]">{tx.symbol}</span> : null}
            </p>
            <p className="mt-1 break-all font-mono text-[11px] tabular text-[#a1a1aa]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">Account · </span>
              {tx.user?.accountId || '—'}
            </p>
            <ReceiptLink
              tx={tx}
              className="mt-2 inline-flex min-h-11 items-center font-medium text-[#10b981] underline underline-offset-2 hover:text-[#059669]"
            />
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#161618] md:block">
        <table className="w-full min-w-[860px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-white/[0.06] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">
              <th scope="col" className="px-4 py-3">When (UTC)</th>
              <th scope="col" className="px-4 py-3">Type</th>
              <th scope="col" className="px-4 py-3">Vault</th>
              <th scope="col" className="px-4 py-3">Account (CSV match)</th>
              <th scope="col" className="px-4 py-3">Detail</th>
              <th scope="col" className="px-4 py-3">Result</th>
              <th scope="col" className="px-4 py-3 text-right">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tx) => (
              <tr key={tx.id + tx.consensus} className="border-b border-white/[0.04] last:border-0">
                <td className="px-4 py-3 whitespace-nowrap tabular text-[#a1a1aa]">{fmtWhen(tx.at)}</td>
                <td className="px-4 py-3">
                  <KindChips tx={tx} />
                </td>
                <td className="px-4 py-3 text-[#a1a1aa]">{vaultText(tx)}</td>
                <td className="px-4 py-3 font-mono text-[11px] tabular text-[#a1a1aa]">
                  {tx.user?.accountId || '—'}
                </td>
                <td className="px-4 py-3 text-[#a1a1aa]">
                  <span className="text-[#f5f5f7]">{detailLabel(tx)}</span>
                  {tx.symbol ? <span className="ml-2 text-[#a1a1aa]">{tx.symbol}</span> : null}
                </td>
                <td className="px-4 py-3">
                  <ResultText tx={tx} />
                </td>
                <td className="px-4 py-3 text-right">
                  <ReceiptLink
                    tx={tx}
                    className="inline-flex min-h-11 items-center px-3 font-medium text-[#10b981] underline underline-offset-2 hover:text-[#059669]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function NewTab() {
  return <span className="sr-only"> (opens in a new tab)</span>;
}

function RuleRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">{term}</dt>
      <dd className="text-[#f5f5f7]">{children}</dd>
    </div>
  );
}

function detailLabel(tx: ClassifiedTx): string {
  const raw = (tx.amountLabel || tx.method || tx.name || '').trim();
  const key = raw.toLowerCase().replace(/\(\)$/, '');
  const plain: Record<string, string> = {
    deposit: 'Deposit',
    release: 'Repayment released',
    call: 'Vault activity',
    contractcall: 'Vault activity',
    cryptotransfer: 'Transfer',
    tokenassociate: 'Account setup',
  };
  return plain[key] ?? raw;
}

function usd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(d);
}

function fmtDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

function fmtSnap(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const stamp = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(d);
  return `${stamp} UTC`;
}
