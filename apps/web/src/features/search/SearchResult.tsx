import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ApiSuccessResult } from '@/lib/api';
import type { SearchRequest } from '@hotel/contracts';
import { calendarDayDiff } from './validation';

const aud = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
});

interface SearchResultProps {
  result: ApiSuccessResult;
  request: SearchRequest;
}

export function SearchResult({ result, request }: SearchResultProps) {
  const nights = calendarDayDiff(request.checkIn, request.checkOut);
  return (
    <Card className="search-region-enter rounded-xl">
      <CardHeader className="gap-3">
        <Badge className="w-fit bg-accent text-accent-foreground">
          Best available rate
        </Badge>
        <div>
          <CardTitle className="text-pretty text-xl leading-[1.3] font-semibold">
            {result.bestOffer.name}
          </CardTitle>
          <CardDescription className="mt-1 text-sm">
            {result.bestOffer.hotelId} · Supplier {result.bestOffer.supplier}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-[32px] font-semibold tabular-nums tracking-normal">
          {aud.format(result.bestOffer.price)}
        </p>
        <p className="text-sm text-muted-foreground">
          AUD · total for {nights} {nights === 1 ? 'night' : 'nights'}
        </p>
        {result.partial ? (
          <div
            data-slot="alert"
            className="mt-1 flex items-start gap-2 rounded-lg border border-warning/30 bg-background px-2.5 py-2 text-sm text-warning"
          >
            <span>
              Best available rate — one supplier could not be checked.
            </span>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            All suppliers checked.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Demo prices from local mock suppliers.
        </p>
      </CardContent>
    </Card>
  );
}
