'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71717a]">
        Analytics
      </p>
      <h1 className="mt-2 text-[28px] font-bold">Couldn’t load the vault</h1>
      <p className="mt-3 text-[15px] text-[#a1a1aa]">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded-full bg-[#10b981] px-5 py-2 text-[14px] font-semibold text-[#04210f]"
      >
        Try again
      </button>
    </div>
  );
}
