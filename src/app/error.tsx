'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a1a1aa]">
        Analytics
      </p>
      <h1 className="mt-2 text-[28px] font-bold tracking-[-0.01em] text-pretty">
        Couldn’t load the latest data
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[#a1a1aa]">
        Try again in a minute.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 min-h-11 rounded-lg bg-[#10b981] px-5 text-[14px] font-semibold text-[#04210f] transition duration-150 hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10b981]"
      >
        Try again
      </button>
    </div>
  );
}
