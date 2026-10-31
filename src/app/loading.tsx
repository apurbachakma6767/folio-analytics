export default function Loading() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-6 py-16">
      <div className="skel h-8 w-48 rounded-lg" />
      <div className="skel h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="skel h-28 rounded-2xl md:col-span-2" />
        <div className="skel h-28 rounded-2xl" />
      </div>
    </div>
  );
}
