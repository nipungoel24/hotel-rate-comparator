import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiErrorCode, SearchRequest } from '@hotel/contracts';
import { searchHotels } from '@/lib/api';
import type { ApiSuccessResult } from '@/lib/api';

export type SearchFailure =
  { kind: 'api'; code: ApiErrorCode; searchId?: string } | { kind: 'network' };

export type SearchUiState =
  | { phase: 'idle' }
  | { phase: 'searching'; request: SearchRequest }
  | { phase: 'success'; request: SearchRequest; result: ApiSuccessResult }
  | { phase: 'empty'; request: SearchRequest }
  | { phase: 'error'; request: SearchRequest; error: SearchFailure }
  | { phase: 'cancelled'; request: SearchRequest };

export interface HotelSearchController {
  state: SearchUiState;
  submit(request: SearchRequest): void;
  cancel(): void;
}

export function useHotelSearch(): HotelSearchController {
  const [state, setState] = useState<SearchUiState>({ phase: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const submit = useCallback((request: SearchRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setState({ phase: 'searching', request });

    searchHotels(request, controller.signal).then(
      (result) => {
        if (generation !== generationRef.current) return;
        // Cancellation is authoritative: a response that resolves while the
        // user has already cancelled must never overwrite the cancelled state.
        if (controller.signal.aborted) return;
        switch (result.kind) {
          case 'success':
            setState({ phase: 'success', request, result });
            break;
          case 'empty':
            setState({ phase: 'empty', request });
            break;
          case 'error':
            setState({
              phase: 'error',
              request,
              error: {
                kind: 'api',
                code: result.code,
                ...(result.searchId !== undefined
                  ? { searchId: result.searchId }
                  : {}),
              },
            });
            break;
        }
      },
      (error: unknown) => {
        if (generation !== generationRef.current) return;
        if (controller.signal.aborted) {
          // Aborting is a user intent, not a failure. `cancel()` already
          // moved the state; this branch only guards late rejections.
          setState((current) =>
            current.phase === 'searching'
              ? { phase: 'cancelled', request }
              : current,
          );
          return;
        }
        void error;
        setState({ phase: 'error', request, error: { kind: 'network' } });
      },
    );
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setState((current) =>
      current.phase === 'searching'
        ? { phase: 'cancelled', request: current.request }
        : current,
    );
  }, []);

  // Unmounting while a request is in flight aborts it; the generation guard
  // keeps the late rejection from touching state.
  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  return { state, submit, cancel };
}
