export default function AppLoading() {
  return (
    <div className="space-y-7" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading this screen…</span>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2.5">
          <div className="h-8 w-64 animate-pulse-soft rounded-sm bg-paper-deep" />
          <div className="h-3 w-80 animate-pulse-soft rounded-sm bg-paper-deep/70" />
        </div>
        <div className="h-9 w-32 animate-pulse-soft rounded-sm bg-paper-deep" />
      </div>

      <div className="metric-band -mx-4 sm:-mx-6 lg:-mx-8">
        {[0, 1, 2, 3].map((cell) => (
          <div key={cell} className="metric-cell px-4 sm:px-6 lg:px-8">
            <div className="h-2.5 w-20 animate-pulse-soft rounded-sm bg-paper-deep" />
            <div className="mt-3 h-6 w-24 animate-pulse-soft rounded-sm bg-paper-deep" />
            <div className="mt-2.5 h-2.5 w-28 animate-pulse-soft rounded-sm bg-paper-deep/60" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <div className="h-80 animate-pulse-soft rounded-lg border border-line bg-paper-deep/30" />
        <div className="space-y-4">
          <div className="h-24 animate-pulse-soft rounded-lg border border-line bg-paper-deep/30" />
          <div className="h-24 animate-pulse-soft rounded-lg border border-line bg-paper-deep/30" />
        </div>
      </div>
    </div>
  );
}
