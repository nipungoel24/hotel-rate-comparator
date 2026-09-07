import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { SearchUiState, SearchFailure } from './useHotelSearch';

export function failureCopy(failure: SearchFailure): string {
  if (failure.kind === 'network')
    return "We couldn't reach the search service. Please try again.";
  switch (failure.code) {
    case 'SUPPLIERS_UNAVAILABLE':
      return "We couldn't retrieve hotel rates. Please try again.";
    case 'SEARCH_TIMEOUT':
      return 'The search took too long. Please try again.';
    case 'SEARCH_SERVICE_UNAVAILABLE':
      return 'Hotel search is temporarily unavailable.';
    case 'VALIDATION_ERROR':
      return 'The search request was not valid. Please check your entries.';
    case 'INTERNAL_ERROR':
      return 'Something went wrong. Please try again.';
  }
}

interface SearchStatusProps {
  state: SearchUiState;
  onRetry: () => void;
}

export function SearchStatus({ state, onRetry }: SearchStatusProps) {
  switch (state.phase) {
    case 'searching':
      return (
        <Card
          className="search-region-enter rounded-xl"
          aria-busy="true"
          aria-label="Searching hotel rates"
        >
          <CardHeader className="gap-3">
            <CardTitle className="text-base font-medium">
              Comparing hotel rates…
            </CardTitle>
            <p role="status" className="sr-only">
              Searching hotel rates
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      );
    case 'cancelled':
      return (
        <p
          role="status"
          className="search-region-enter py-2 text-sm text-muted-foreground"
        >
          Search cancelled.
        </p>
      );
    case 'empty':
      return (
        <Card className="search-region-enter rounded-xl">
          <CardHeader>
            <CardTitle className="text-base font-medium">
              No hotels found
            </CardTitle>
            <CardDescription>
              Try a different city or change your dates, then search again.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    case 'error':
      return (
        <Alert variant="destructive" className="search-region-enter rounded-lg">
          <AlertTitle>{failureCopy(state.error)}</AlertTitle>
          {state.error.kind === 'api' && state.error.searchId !== undefined && (
            <AlertDescription>
              Search reference: {state.error.searchId}
            </AlertDescription>
          )}
          <AlertDescription>
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={onRetry}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      );
    default:
      return null;
  }
}
