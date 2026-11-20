import { appConfig } from "@/config/app.config";

export function AppHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-4 sm:px-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{appConfig.name}</h1>
        <p className="text-sm text-muted-foreground">{appConfig.tagline}</p>
      </div>
      {appConfig.sponsors.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Powered by</span>
          <ul className="flex flex-wrap items-center gap-4">
            {appConfig.sponsors.map((sponsor) => {
              const mark = sponsor.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- static logos from /public; no next/image config needed
                <img src={sponsor.logo} alt={sponsor.name} className="h-6 w-auto" />
              ) : (
                <span className="text-sm font-medium">{sponsor.name}</span>
              );
              return (
                <li key={sponsor.name}>
                  {sponsor.url ? (
                    <a href={sponsor.url} target="_blank" rel="noreferrer" className="opacity-80 transition-opacity hover:opacity-100">
                      {mark}
                    </a>
                  ) : (
                    mark
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </header>
  );
}
