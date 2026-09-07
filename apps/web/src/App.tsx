import { SearchForm } from './features/search/SearchForm';
import { SearchResult } from './features/search/SearchResult';
import { SearchStatus } from './features/search/SearchStatus';
import { useHotelSearch } from './features/search/useHotelSearch';

export function App() {
  const { state, submit, cancel } = useHotelSearch();
  const searching = state.phase === 'searching';

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-6 sm:px-6 md:py-10">
        <header>
          <p className="text-sm font-medium text-primary">
            Hotel Rate Comparator
          </p>
        </header>
        <main className="flex flex-1 flex-col gap-6 md:gap-8">
          <section className="flex flex-col gap-2 md:max-w-2xl">
            <h1 className="text-balance text-[28px] leading-[1.15] font-semibold md:text-[32px]">
              Find the best available hotel rate.
            </h1>
            <p className="text-pretty text-base text-muted-foreground">
              Compare two suppliers for your stay. Enter your city and dates to
              get the cheapest verified offer.
            </p>
          </section>

          <section
            aria-label="Hotel search"
            className="rounded-xl border bg-card p-4 shadow-sm md:p-6"
          >
            <SearchForm
              searching={searching}
              onSubmit={submit}
              onCancel={cancel}
            />
          </section>

          <section aria-label="Search results" className="flex flex-col gap-3">
            {state.phase === 'success' && (
              <SearchResult result={state.result} request={state.request} />
            )}
            <SearchStatus
              state={state}
              onRetry={() => {
                if (state.phase === 'error') submit(state.request);
              }}
            />
          </section>
        </main>
        <footer className="mt-8 flex flex-col items-center gap-1 border-t pt-4 text-xs text-muted-foreground md:mt-12">
          <p className="flex items-center gap-1.5">
            Built with
            <img
              src="/icons/react.svg"
              alt=""
              width={14}
              height={13}
              className="inline-block"
            />
            React · Hotel Rate Comparator
          </p>
          <p>Demo application. Prices come from local mock suppliers.</p>
        </footer>
      </div>
    </div>
  );
}
