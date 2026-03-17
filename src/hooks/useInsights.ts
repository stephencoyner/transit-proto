'use client';

import { useState, useCallback, useRef } from 'react';
import type { InsightsResponse } from '@/types/insights';

interface UseInsightsResult {
  data: InsightsResponse | null;
  isLoading: boolean;
  error: Error | null;
  generate: () => void;
  refetch: () => void;
}

export function useInsights(): UseInsightsResult {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (refresh: boolean = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const refreshParam = refresh ? '?refresh=true' : '';

      const response = await fetch(`/api/insights${refreshParam}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result: InsightsResponse = await response.json();
      setData(result);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const generate = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  const refetch = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  return { data, isLoading, error, generate, refetch };
}
