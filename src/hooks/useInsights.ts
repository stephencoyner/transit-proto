'use client';

import { useState, useCallback, useRef } from 'react';
import type { InsightsResponse } from '@/types/insights';

// Set to true to use mock data instead of calling the API
const USE_MOCK_DATA = true;

const MOCK_INSIGHTS: InsightsResponse = {
  generatedAt: new Date().toISOString(),
  dateRange: { start: '2025-06-22', end: '2025-09-18' },
  toolCallCount: 11,
  insights: [
    {
      id: 'mock-1',
      category: 'crowding',
      severity: 'critical',
      title: 'Route 62 Overcrowding on Weekday PM Peak',
      narrative: 'Route 62 is consistently exceeding 85% seat capacity during weekday PM peak hours (4–6 PM), particularly between U District and Downtown. Average load factor has increased 12% since July.',
      hypothesis: 'Increased university enrollment and return-to-office trends may be driving higher demand on this corridor.',
      investigationSteps: [
        'Check Route 62 by-period data for PM peak trends',
        'Compare weekday vs weekend loads',
        'Review stop-level boardings at U District stations',
      ],
      routeIds: ['62'],
      dateRange: { start: '2025-08-01', end: '2025-09-18' },
      sparklineData: [
        { label: 'Jun 22', value: 1820 },
        { label: 'Jul 6', value: 1950 },
        { label: 'Jul 20', value: 2100 },
        { label: 'Aug 3', value: 2280 },
        { label: 'Aug 17', value: 2450 },
        { label: 'Sep 1', value: 2580 },
        { label: 'Sep 15', value: 2640 },
      ],
      walkthrough: [
        {
          narrative: 'Route 62 is seeing higher ridership than usual. Let\'s start with an overview of the full summer period.',
          filters: { tab: 'routes', routeId: '62', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18' },
        },
        {
          narrative: 'The crowding is concentrated during PM peak hours (3–7 PM). Notice the spike in the by-period chart.',
          filters: { tab: 'routes', routeId: '62', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18', timeMode: 'custom', timePeriods: ['PM Peak'] },
        },
        {
          narrative: 'Weekdays are hit hardest, especially Tuesday through Thursday. Weekend ridership is normal.',
          filters: { tab: 'routes', routeId: '62', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18', timeMode: 'custom', timePeriods: ['PM Peak'], daysMode: 'custom', customDays: ['Tue', 'Wed', 'Thu'] },
        },
        {
          narrative: 'Here\'s how current ridership compares to earlier this summer. The increase is clear.',
          filters: { tab: 'routes', routeId: '62', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18', comparisonMode: true, comparisonStartDate: '2025-06-22', comparisonEndDate: '2025-07-31' },
        },
      ],
    },
    {
      id: 'mock-2',
      category: 'decline',
      severity: 'warning',
      title: 'Route 13 Weekend Ridership Dropping',
      narrative: 'Weekend ridership on Route 13 has declined 18% over the past 6 weeks. Saturday boardings are down from an average of 890 to 730 per day.',
      hypothesis: 'Construction on Queen Anne Ave may be deterring weekend riders who have more flexibility to avoid disrupted routes.',
      investigationSteps: [
        'Review Route 13 weekend-specific by-date trends',
        'Compare with nearby Route 1 and Route 8 for substitution patterns',
        'Check stop-level data for stops near construction zones',
      ],
      routeIds: ['13'],
      dateRange: { start: '2025-08-01', end: '2025-09-18' },
      sparklineData: [
        { label: 'Aug 2', value: 890 },
        { label: 'Aug 9', value: 860 },
        { label: 'Aug 16', value: 820 },
        { label: 'Aug 23', value: 780 },
        { label: 'Aug 30', value: 750 },
        { label: 'Sep 6', value: 740 },
        { label: 'Sep 13', value: 730 },
      ],
      walkthrough: [
        {
          narrative: 'Route 13 weekend ridership has been declining. Here\'s the full picture over the past 6 weeks.',
          filters: { tab: 'routes', routeId: '13', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18' },
        },
        {
          narrative: 'The drop is specifically on weekends. Weekday ridership has stayed relatively stable.',
          filters: { tab: 'routes', routeId: '13', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18', daysMode: 'weekends' },
        },
        {
          narrative: 'Saturday is worse than Sunday — down 18% versus 9%. Check the day-of-week breakdown.',
          filters: { tab: 'routes', routeId: '13', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18', daysMode: 'custom', customDays: ['Sat', 'Sun'] },
        },
      ],
    },
    {
      id: 'mock-3',
      category: 'trend',
      severity: 'positive',
      title: 'Route 44 Hitting Record Highs',
      narrative: 'Route 44 (Ballard–UW) has seen a steady 22% ridership increase since summer began, now averaging 3,400 daily boardings — the highest in 3 years.',
      hypothesis: 'New bike-bus integration at the Burke-Gilman Trail connections and increased density along the corridor are likely contributors.',
      investigationSteps: [
        'Examine Route 44 by-date trend for growth trajectory',
        'Identify highest-growth stops along the corridor',
        'Compare AM vs PM peak growth rates',
      ],
      routeIds: ['44'],
      dateRange: { start: '2025-06-22', end: '2025-09-18' },
      sparklineData: [
        { label: 'Jun 22', value: 2780 },
        { label: 'Jul 6', value: 2900 },
        { label: 'Jul 20', value: 3050 },
        { label: 'Aug 3', value: 3180 },
        { label: 'Aug 17', value: 3280 },
        { label: 'Sep 1', value: 3350 },
        { label: 'Sep 15', value: 3400 },
      ],
      walkthrough: [
        {
          narrative: 'Route 44 has been climbing steadily since June. It\'s now averaging 3,400 daily boardings.',
          filters: { tab: 'routes', routeId: '44', routeTab: 'Summary', startDate: '2025-06-22', endDate: '2025-09-18' },
        },
        {
          narrative: 'Growth is strongest during the AM peak. Morning commuters are driving most of the increase.',
          filters: { tab: 'routes', routeId: '44', routeTab: 'Summary', startDate: '2025-06-22', endDate: '2025-09-18', timeMode: 'custom', timePeriods: ['AM Peak'] },
        },
        {
          narrative: 'Compared to June, current ridership is up 22%. Here\'s the side-by-side view.',
          filters: { tab: 'routes', routeId: '44', routeTab: 'Summary', startDate: '2025-08-18', endDate: '2025-09-18', comparisonMode: true, comparisonStartDate: '2025-06-22', comparisonEndDate: '2025-07-20' },
        },
      ],
    },
    {
      id: 'mock-4',
      category: 'anomaly',
      severity: 'info',
      title: 'Unusual Spike on Route 70 Last Tuesday',
      narrative: 'Route 70 (Eastlake) saw a 45% ridership spike last Tuesday compared to the prior 4-week Tuesday average. The spike was concentrated at the Fairview & Campus Dr stop.',
      hypothesis: 'A special event at South Lake Union or a nearby office reopening may have caused the temporary surge.',
      investigationSteps: [
        'Check Route 70 stop-level data for Fairview & Campus Dr',
        'Compare with other Tuesdays in September',
        'Look for similar spikes on adjacent routes (40, 62)',
      ],
      routeIds: ['70'],
      dateRange: { start: '2025-09-09', end: '2025-09-16' },
      sparklineData: [
        { label: 'Tue 8/19', value: 1200 },
        { label: 'Tue 8/26', value: 1180 },
        { label: 'Tue 9/2', value: 1220 },
        { label: 'Tue 9/9', value: 1740 },
        { label: 'Tue 9/16', value: 1190 },
      ],
      walkthrough: [
        {
          narrative: 'Route 70 saw an unusual 45% ridership spike last Tuesday. Let\'s look at the recent trend.',
          filters: { tab: 'routes', routeId: '70', routeTab: 'Summary', startDate: '2025-09-01', endDate: '2025-09-18' },
        },
        {
          narrative: 'The spike happened specifically on Tuesday. Other days were normal.',
          filters: { tab: 'routes', routeId: '70', routeTab: 'Summary', startDate: '2025-09-01', endDate: '2025-09-18', daysMode: 'custom', customDays: ['Tue'] },
        },
        {
          narrative: 'Here\'s the spike week compared to the prior month\'s Tuesday baseline.',
          filters: { tab: 'routes', routeId: '70', routeTab: 'Summary', startDate: '2025-09-09', endDate: '2025-09-16', daysMode: 'custom', customDays: ['Tue'], comparisonMode: true, comparisonStartDate: '2025-08-12', comparisonEndDate: '2025-09-02' },
        },
      ],
    },
    {
      id: 'mock-5',
      category: 'trend',
      severity: 'info',
      title: 'System-Wide AM Peak Shift',
      narrative: 'Across all 10 routes, the AM peak is shifting 15 minutes later compared to June. Peak boarding time has moved from 7:45 AM to 8:00 AM on average.',
      hypothesis: 'Flexible work schedules and hybrid return-to-office policies may be contributing to a gradual shift in commute timing.',
      investigationSteps: [
        'Review system-level by-period data for AM trends',
        'Compare early AM (6-7) vs late AM (8-9) boarding ratios',
        'Check if the shift is uniform or concentrated on specific routes',
      ],
      routeIds: ['1', '8', '10', '11', '13', '14', '40', '44', '62', '70'],
      dateRange: { start: '2025-06-22', end: '2025-09-18' },
      sparklineData: [
        { label: 'Jun', value: 8200 },
        { label: 'Jul', value: 8350 },
        { label: 'Aug', value: 8500 },
        { label: 'Sep', value: 8420 },
      ],
      walkthrough: [
        {
          narrative: 'Across all 10 routes, the AM peak is shifting later. Let\'s look at system-wide trends.',
          filters: { tab: 'system', startDate: '2025-06-22', endDate: '2025-09-18' },
        },
        {
          narrative: 'Early AM ridership (before 9 AM) is declining while late AM grows. Look at the period breakdown.',
          filters: { tab: 'system', startDate: '2025-06-22', endDate: '2025-09-18', timeMode: 'custom', timePeriods: ['AM Peak'] },
        },
        {
          narrative: 'The shift has accelerated since August. Compare August–September to the earlier summer months.',
          filters: { tab: 'system', startDate: '2025-08-01', endDate: '2025-09-18', timeMode: 'custom', timePeriods: ['AM Peak'], comparisonMode: true, comparisonStartDate: '2025-06-22', comparisonEndDate: '2025-07-31' },
        },
      ],
    },
  ],
};

interface UseInsightsResult {
  data: InsightsResponse | null;
  isLoading: boolean;
  error: Error | null;
  generate: () => void;
  refetch: () => void;
}

export function useInsights(): UseInsightsResult {
  const [data, setData] = useState<InsightsResponse | null>(USE_MOCK_DATA ? MOCK_INSIGHTS : null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (refresh: boolean = false) => {
    if (USE_MOCK_DATA) {
      setData(MOCK_INSIGHTS);
      return;
    }

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
