'use client';

import { useState, useCallback, useRef } from 'react';
import type { InsightsResponse } from '@/types/insights';

// Set to true to use mock data instead of calling the API
const USE_MOCK_DATA = true;

// When true, only the first insight is AI-generated; the rest are mock data
const HYBRID_MODE = true;

const MOCK_INSIGHTS: InsightsResponse = {
  generatedAt: new Date().toISOString(),
  dateRange: { start: '2025-06-22', end: '2025-09-18' },
  toolCallCount: 11,
  summary: 'Good morning! I looked across all 10 routes over the past 3 months and found a few things worth your attention. Route 62 is hitting capacity during PM peak, and Route 13 weekend ridership is trending down. Overall system ridership is up 4% since July.',
  insights: [
    {
      id: 'mock-1',
      category: 'crowding',
      severity: 'critical',
      title: 'Route 62: PM Peak Under Pressure',
      narrative: 'Route 62\u2019s PM peak window is carrying 39% of all daily ridership in just 4 hours \u2014 more than AM Peak and Midday combined. The week of September 8th surged 11% above the summer average, and Tue\u2013Thu are consistently the highest-pressure days.',
      hypothesis: 'UW fall orientation and return-to-office patterns are concentrating demand into PM Peak on midweek days. The September surge may signal a new baseline heading into fall.',
      analysisSteps: [
        'Break down ridership by time period to confirm PM Peak concentration',
        'Identify the September surge week and potential UW-related drivers',
        'Compare Tue\u2013Thu vs Mon/Fri to isolate the commuter pattern',
        'Review trip-level loads to find specific trips needing relief',
      ],
      routeIds: ['62'],
      dateRange: { start: '2025-06-22', end: '2025-09-18' },
      sparklineData: [
        { label: 'Jun 23', value: 5999 },
        { label: 'Jul 7', value: 6102 },
        { label: 'Jul 21', value: 6081 },
        { label: 'Aug 4', value: 6043 },
        { label: 'Aug 18', value: 6056 },
        { label: 'Sep 1', value: 5897 },
        { label: 'Sep 8', value: 6655 },
      ],
      walkthrough: [
        {
          pageName: 'Route 62 at a Glance',
          filterSummary: 'Jun 22 \u2013 Sep 18, 2025 \u00b7 All days \u00b7 All periods',
          narrative: 'Route 62 connects Sand Point, Green Lake, and Downtown \u2014 one of Seattle\u2019s busiest crosstown corridors. Over the full summer, it averaged 6,225 daily boardings. But the weekly trend tells a bigger story: look at the September spike.',
          filters: { tab: 'routes', routeId: '62', routeTab: 'Summary', startDate: '2025-06-22', endDate: '2025-09-18' },
          charts: [
            { id: 'r62-avg', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '6,225', metricLabel: 'Avg Daily Boardings (Summer 2025)' },
            { id: 'r62-trend', type: 'area', title: 'Weekly Avg Daily Boardings', data: [{ week: 'Jun 23', value: 5999 }, { week: 'Jun 30', value: 6034 }, { week: 'Jul 7', value: 6102 }, { week: 'Jul 14', value: 6101 }, { week: 'Jul 21', value: 6081 }, { week: 'Aug 4', value: 6043 }, { week: 'Aug 11', value: 6091 }, { week: 'Aug 18', value: 6056 }, { week: 'Aug 25', value: 6123 }, { week: 'Sep 1', value: 5897 }, { week: 'Sep 8', value: 6655 }], xKey: 'week', yKey: 'value' },
          ],
        },
        {
          pageName: 'PM Peak Dominates',
          filterSummary: 'Aug 1 \u2013 Sep 18, 2025 \u00b7 Weekdays \u00b7 PM Peak',
          narrative: 'PM Peak is carrying 39% of all daily ridership in just 4 hours \u2014 more than AM Peak and Midday combined. The busiest trips cluster between 3:00 and 5:30 PM, with max loads hitting 35 passengers.',
          narrativeByMetric: {
            'Average daily boardings': 'PM Peak averages 2,418 daily boardings across all trips. The period chart shows how dramatically it outpaces every other window. Below, the busiest individual trips \u2014 the 3:04, 3:19, and 3:30 PM departures each average 33 boardings per run.',
            'Maxload': 'Max load tells the crowding story. The 5:04 PM and 3:05 PM trips both hit 35 passengers at their most loaded segment \u2014 that\u2019s standing-room territory on a standard bus. Six trips regularly exceed 30.',
          },
          filters: { tab: 'routes', routeId: '62', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18', daysMode: 'weekdays', timeMode: 'custom', timePeriods: ['PM Peak'] },
          relevantMetrics: ['Average daily boardings', 'Maxload'],
          charts: [
            { id: 'r62-pm-metric', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '2,418', metricLabel: 'PM Peak Avg Daily Boardings' },
            { id: 'r62-period', type: 'bar', title: 'Avg Daily Boardings by Period', data: [{ period: 'Early AM', value: 71 }, { period: 'AM Peak', value: 1630 }, { period: 'Midday', value: 1574 }, { period: 'PM Peak', value: 2418 }, { period: 'Evening', value: 438 }, { period: 'Night', value: 94 }], xKey: 'period', yKey: 'value' },
            { id: 'r62-trips', type: 'bar', title: 'Busiest PM Peak Trips \u2014 Avg Boardings', data: [{ trip: '3:04', value: 33 }, { trip: '3:19', value: 33 }, { trip: '3:30', value: 33 }, { trip: '4:34', value: 32 }, { trip: '4:49', value: 32 }, { trip: '5:22', value: 32 }, { trip: '5:30', value: 32 }, { trip: '5:34', value: 32 }], xKey: 'trip', yKey: 'value' },
          ],
          chartsByMetric: {
            'Average daily boardings': [
              { id: 'r62-pm-metric-b', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '2,418', metricLabel: 'PM Peak Avg Daily Boardings' },
              { id: 'r62-period-b', type: 'bar', title: 'Avg Daily Boardings by Period', data: [{ period: 'Early AM', value: 71 }, { period: 'AM Peak', value: 1630 }, { period: 'Midday', value: 1574 }, { period: 'PM Peak', value: 2418 }, { period: 'Evening', value: 438 }, { period: 'Night', value: 94 }], xKey: 'period', yKey: 'value' },
              { id: 'r62-trips-b', type: 'bar', title: 'Busiest PM Peak Trips \u2014 Avg Boardings', data: [{ trip: '3:04', value: 33 }, { trip: '3:19', value: 33 }, { trip: '3:30', value: 33 }, { trip: '4:34', value: 32 }, { trip: '4:49', value: 32 }, { trip: '5:22', value: 32 }, { trip: '5:30', value: 32 }, { trip: '5:34', value: 32 }], xKey: 'trip', yKey: 'value' },
            ],
            'Maxload': [
              { id: 'r62-maxload-m', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '35', metricLabel: 'Highest Max Load (PM Peak)' },
              { id: 'r62-period-ml', type: 'bar', title: 'Max Load by Period', data: [{ period: 'Early AM', value: 10 }, { period: 'AM Peak', value: 36 }, { period: 'Midday', value: 27 }, { period: 'PM Peak', value: 35 }, { period: 'Evening', value: 17 }, { period: 'Night', value: 12 }], xKey: 'period', yKey: 'value' },
              { id: 'r62-trips-ml', type: 'bar', title: 'Highest Max Load by Trip', data: [{ trip: '5:04', value: 35 }, { trip: '5:49', value: 35 }, { trip: '3:05', value: 35 }, { trip: '5:00', value: 34 }, { trip: '4:15', value: 34 }, { trip: '5:52', value: 32 }, { trip: '3:13', value: 32 }, { trip: '6:37', value: 31 }], xKey: 'trip', yKey: 'value' },
            ],
          },
        },
        {
          pageName: 'September Surge',
          filterSummary: 'Jun 22 \u2013 Sep 18, 2025 \u00b7 Weekdays \u00b7 PM Peak',
          narrative: 'The week of September 8th saw a sharp jump \u2014 PM Peak boardings hit 3,165 per day, up 11% from the summer average. This coincides with UW\u2019s fall orientation week and likely signals a new demand baseline.',
          filters: { tab: 'routes', routeId: '62', routeTab: 'Summary', startDate: '2025-06-22', endDate: '2025-09-18', daysMode: 'weekdays', timeMode: 'custom', timePeriods: ['PM Peak'] },
          charts: [
            { id: 'r62-surge-metric', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '3,165', metricLabel: 'PM Peak Daily Boardings (Sep 8 Week)' },
            { id: 'r62-pm-trend', type: 'area', title: 'Weekday PM Peak \u2014 Weekly Avg Daily Boardings', data: [{ week: 'Jun 23', value: 2802 }, { week: 'Jun 30', value: 2860 }, { week: 'Jul 7', value: 2874 }, { week: 'Jul 14', value: 2886 }, { week: 'Jul 21', value: 2865 }, { week: 'Jul 28', value: 2849 }, { week: 'Aug 4', value: 2865 }, { week: 'Aug 11', value: 2927 }, { week: 'Aug 18', value: 2874 }, { week: 'Aug 25', value: 2889 }, { week: 'Sep 1', value: 2763 }, { week: 'Sep 8', value: 3165 }], xKey: 'week', yKey: 'value' },
          ],
        },
        {
          pageName: 'Tue\u2013Thu Pressure',
          filterSummary: 'Aug 1 \u2013 Sep 18, 2025 \u00b7 Tue\u2013Thu \u00b7 PM Peak',
          narrative: 'The midweek crunch is real. Tuesday through Thursday each average over 3,000 PM Peak boardings \u2014 8% higher than Monday and Friday. This is a commuter-driven pattern, not an all-week problem.',
          filters: { tab: 'routes', routeId: '62', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18', daysMode: 'custom', customDays: ['Tue', 'Wed', 'Thu'], timeMode: 'custom', timePeriods: ['PM Peak'] },
          charts: [
            { id: 'r62-wed-metric', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '3,052', metricLabel: 'Wed PM Peak Avg Daily Boardings' },
            { id: 'r62-byday', type: 'bar', title: 'PM Peak Avg Daily Boardings by Day', data: [{ day: 'Mon', value: 2912 }, { day: 'Tue', value: 3029 }, { day: 'Wed', value: 3052 }, { day: 'Thu', value: 3022 }, { day: 'Fri', value: 2793 }], xKey: 'day', yKey: 'value' },
          ],
        },
        {
          pageName: 'What to Watch',
          filterSummary: 'Aug 1 \u2013 Sep 18, 2025 \u00b7 Weekdays \u00b7 PM Peak',
          narrative: 'Three things to investigate:\n\n**1. Add PM Peak frequency Tue\u2013Thu.** The 3:00\u20135:30 PM window is seeing the highest loads (max 36 passengers on Sep 11). Consider adding a trip between the 3:13 and 3:30 departures.\n\n**2. Monitor September closely.** The Sep 8 surge may signal a new normal as UW returns. If sustained into October, this route needs a service adjustment.\n\n**3. Rebalance from Midday.** Midday runs at 1,574 daily boardings \u2014 well below PM Peak\u2019s 2,418. Shifting one Midday trip to PM Peak could relieve pressure without adding cost.',
          filters: { tab: 'routes', routeId: '62', routeTab: 'Trips', startDate: '2025-08-01', endDate: '2025-09-18', daysMode: 'weekdays', timeMode: 'custom', timePeriods: ['PM Peak'] },
          charts: [],
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
      analysisSteps: [
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
          pageName: 'Route 13 Overview',
          filterSummary: 'Aug 1 – Sep 18, 2025 · All days',
          narrative: 'Route 13 weekend ridership has been declining. Here\'s the full picture over the past 6 weeks.',
          filters: { tab: 'routes', routeId: '13', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18' },
          relevantMetrics: ['Average daily boardings', 'Total boardings', 'Average daily alightings'],
          charts: [
            { id: 'r13-trend', type: 'area', title: 'Weekend Ridership Trend', data: [{ week: 'Aug 2', value: 890 }, { week: 'Aug 9', value: 860 }, { week: 'Aug 16', value: 820 }, { week: 'Aug 23', value: 780 }, { week: 'Aug 30', value: 750 }, { week: 'Sep 6', value: 740 }, { week: 'Sep 13', value: 730 }], xKey: 'week', yKey: 'value' },
          ],
          chartsByMetric: {
            'Average daily boardings': [
              { id: 'r13-trend-b', type: 'area', title: 'Weekend Avg Daily Boardings', data: [{ week: 'Aug 2', value: 890 }, { week: 'Aug 9', value: 860 }, { week: 'Aug 16', value: 820 }, { week: 'Aug 23', value: 780 }, { week: 'Aug 30', value: 750 }, { week: 'Sep 6', value: 740 }, { week: 'Sep 13', value: 730 }], xKey: 'week', yKey: 'value' },
            ],
            'Total boardings': [
              { id: 'r13-trend-t', type: 'area', title: 'Weekend Total Boardings', data: [{ week: 'Aug 2', value: 1780 }, { week: 'Aug 9', value: 1720 }, { week: 'Aug 16', value: 1640 }, { week: 'Aug 23', value: 1560 }, { week: 'Aug 30', value: 1500 }, { week: 'Sep 6', value: 1480 }, { week: 'Sep 13', value: 1460 }], xKey: 'week', yKey: 'value' },
              { id: 'r13-total-m', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '10,140', metricLabel: 'Total Weekend Boardings' },
            ],
            'Average daily alightings': [
              { id: 'r13-trend-a', type: 'area', title: 'Weekend Avg Daily Alightings', data: [{ week: 'Aug 2', value: 870 }, { week: 'Aug 9', value: 840 }, { week: 'Aug 16', value: 800 }, { week: 'Aug 23', value: 760 }, { week: 'Aug 30', value: 730 }, { week: 'Sep 6', value: 720 }, { week: 'Sep 13', value: 710 }], xKey: 'week', yKey: 'value' },
            ],
          },
        },
        {
          pageName: 'Weekend Focus',
          filterSummary: 'Aug 1 – Sep 18, 2025 · Weekends only',
          narrative: 'The drop is specifically on weekends. Weekday ridership has stayed relatively stable.',
          filters: { tab: 'routes', routeId: '13', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18', daysMode: 'weekends' },
          charts: [
            { id: 'r13-day', type: 'bar', title: 'Weekday vs Weekend', data: [{ type: 'Weekday Avg', value: 1120 }, { type: 'Saturday', value: 730 }, { type: 'Sunday', value: 680 }], xKey: 'type', yKey: 'value' },
            { id: 'r13-drop', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '-18%', metricLabel: 'Saturday Decline (6 wks)' },
          ],
        },
        {
          pageName: 'Sat vs Sun Breakdown',
          filterSummary: 'Aug 1 – Sep 18, 2025 · Sat & Sun',
          narrative: 'Saturday is worse than Sunday — down 18% versus 9%. Check the day-of-week breakdown.',
          filters: { tab: 'routes', routeId: '13', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18', daysMode: 'custom', customDays: ['Sat', 'Sun'] },
          charts: [
            { id: 'r13-satvsun', type: 'bar', title: 'Saturday vs Sunday Trend', data: [{ week: 'Aug 2', sat: 520, sun: 370 }, { week: 'Aug 16', sat: 470, sun: 350 }, { week: 'Aug 30', sat: 430, sun: 320 }, { week: 'Sep 13', sat: 410, sun: 320 }], xKey: 'week', yKey: 'sat' },
          ],
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
      analysisSteps: [
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
          pageName: 'Route 44 Growth',
          filterSummary: 'Jun 22 – Sep 18, 2025 · All days',
          narrative: 'Route 44 has been climbing steadily since June. It\'s now averaging 3,400 daily boardings.',
          filters: { tab: 'routes', routeId: '44', routeTab: 'Summary', startDate: '2025-06-22', endDate: '2025-09-18' },
          relevantMetrics: ['Average daily boardings', 'Average daily activity', 'Average load'],
          charts: [
            { id: 'r44-trend', type: 'area', title: 'Daily Ridership', data: [{ date: 'Jun 22', value: 2780 }, { date: 'Jul 6', value: 2900 }, { date: 'Jul 20', value: 3050 }, { date: 'Aug 3', value: 3180 }, { date: 'Aug 17', value: 3280 }, { date: 'Sep 1', value: 3350 }, { date: 'Sep 15', value: 3400 }], xKey: 'date', yKey: 'value' },
            { id: 'r44-high', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '3,400', metricLabel: 'Current Avg Daily Boardings' },
          ],
          chartsByMetric: {
            'Average daily boardings': [
              { id: 'r44-trend-b', type: 'area', title: 'Daily Boardings', data: [{ date: 'Jun 22', value: 2780 }, { date: 'Jul 6', value: 2900 }, { date: 'Jul 20', value: 3050 }, { date: 'Aug 3', value: 3180 }, { date: 'Aug 17', value: 3280 }, { date: 'Sep 1', value: 3350 }, { date: 'Sep 15', value: 3400 }], xKey: 'date', yKey: 'value' },
              { id: 'r44-high-b', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '3,400', metricLabel: 'Current Avg Daily Boardings' },
            ],
            'Average daily activity': [
              { id: 'r44-trend-act', type: 'area', title: 'Daily Activity', data: [{ date: 'Jun 22', value: 5420 }, { date: 'Jul 6', value: 5660 }, { date: 'Jul 20', value: 5950 }, { date: 'Aug 3', value: 6210 }, { date: 'Aug 17', value: 6400 }, { date: 'Sep 1', value: 6530 }, { date: 'Sep 15', value: 6630 }], xKey: 'date', yKey: 'value' },
              { id: 'r44-high-act', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '6,630', metricLabel: 'Current Avg Daily Activity' },
            ],
            'Average load': [
              { id: 'r44-trend-l', type: 'area', title: 'Avg Load Factor', data: [{ date: 'Jun 22', value: 52 }, { date: 'Jul 6', value: 55 }, { date: 'Jul 20', value: 58 }, { date: 'Aug 3', value: 61 }, { date: 'Aug 17', value: 63 }, { date: 'Sep 1', value: 65 }, { date: 'Sep 15', value: 66 }], xKey: 'date', yKey: 'value' },
              { id: 'r44-high-l', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '66%', metricLabel: 'Current Avg Load Factor' },
            ],
          },
        },
        {
          pageName: 'AM Peak Growth',
          filterSummary: 'Jun 22 – Sep 18, 2025 · AM Peak',
          narrative: 'Growth is strongest during the AM peak. Morning commuters are driving most of the increase.',
          filters: { tab: 'routes', routeId: '44', routeTab: 'Summary', startDate: '2025-06-22', endDate: '2025-09-18', timeMode: 'custom', timePeriods: ['AM Peak'] },
          charts: [
            { id: 'r44-period', type: 'bar', title: 'Growth by Period', data: [{ period: 'AM Peak', value: 28 }, { period: 'Midday', value: 15 }, { period: 'PM Peak', value: 19 }, { period: 'Evening', value: 12 }], xKey: 'period', yKey: 'value' },
          ],
        },
        {
          pageName: 'June vs Now',
          filterSummary: 'Aug 18 – Sep 18 vs Jun 22 – Jul 20, 2025',
          narrative: 'Compared to June, current ridership is up 22%. Here\'s the side-by-side view.',
          filters: { tab: 'routes', routeId: '44', routeTab: 'Summary', startDate: '2025-08-18', endDate: '2025-09-18', comparisonMode: true, comparisonStartDate: '2025-06-22', comparisonEndDate: '2025-07-20' },
          charts: [
            { id: 'r44-change', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '+22%', metricLabel: 'Ridership Growth Since June' },
            { id: 'r44-comp', type: 'area', title: 'Period Comparison', data: [{ week: 'Wk 1', current: 3280, earlier: 2780 }, { week: 'Wk 2', current: 3320, earlier: 2850 }, { week: 'Wk 3', current: 3360, earlier: 2900 }, { week: 'Wk 4', current: 3400, earlier: 2950 }], xKey: 'week', yKey: 'current', yKey2: 'earlier' },
          ],
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
      analysisSteps: [
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
          pageName: 'Route 70 Recent',
          filterSummary: 'Sep 1 – Sep 18, 2025 · All days',
          narrative: 'Route 70 saw an unusual 45% ridership spike last Tuesday. Let\'s look at the recent trend.',
          filters: { tab: 'routes', routeId: '70', routeTab: 'Summary', startDate: '2025-09-01', endDate: '2025-09-18' },
          charts: [
            { id: 'r70-trend', type: 'area', title: 'Daily Ridership', data: [{ date: 'Sep 1', value: 1180 }, { date: 'Sep 3', value: 1200 }, { date: 'Sep 5', value: 1190 }, { date: 'Sep 8', value: 1210 }, { date: 'Sep 9', value: 1740 }, { date: 'Sep 10', value: 1220 }, { date: 'Sep 12', value: 1180 }, { date: 'Sep 15', value: 1190 }], xKey: 'date', yKey: 'value' },
          ],
        },
        {
          pageName: 'Tuesday Isolation',
          filterSummary: 'Sep 1 – Sep 18, 2025 · Tuesdays only',
          narrative: 'The spike happened specifically on Tuesday. Other days were normal.',
          filters: { tab: 'routes', routeId: '70', routeTab: 'Summary', startDate: '2025-09-01', endDate: '2025-09-18', daysMode: 'custom', customDays: ['Tue'] },
          charts: [
            { id: 'r70-tues', type: 'bar', title: 'Tuesday Boardings', data: [{ date: 'Sep 2', value: 1200 }, { date: 'Sep 9', value: 1740 }, { date: 'Sep 16', value: 1190 }], xKey: 'date', yKey: 'value' },
            { id: 'r70-spike', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '+45%', metricLabel: 'Spike on Sep 9 vs Avg' },
          ],
        },
        {
          pageName: 'Baseline Comparison',
          filterSummary: 'Sep 9–16 vs Aug 12 – Sep 2 · Tuesdays',
          narrative: 'Here\'s the spike week compared to the prior month\'s Tuesday baseline.',
          filters: { tab: 'routes', routeId: '70', routeTab: 'Summary', startDate: '2025-09-09', endDate: '2025-09-16', daysMode: 'custom', customDays: ['Tue'], comparisonMode: true, comparisonStartDate: '2025-08-12', comparisonEndDate: '2025-09-02' },
          charts: [
            { id: 'r70-comp', type: 'bar', title: 'Spike vs Baseline', data: [{ label: 'Tuesday', current: 1740, baseline: 1200 }], xKey: 'label', yKey: 'current', yKey2: 'baseline' },
          ],
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
      analysisSteps: [
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
          pageName: 'System Overview',
          filterSummary: 'Jun 22 – Sep 18, 2025 · All routes',
          narrative: 'Across all 10 routes, the AM peak is shifting later. Let\'s look at system-wide trends.',
          filters: { tab: 'system', startDate: '2025-06-22', endDate: '2025-09-18' },
          charts: [
            { id: 'sys-am', type: 'area', title: 'System AM Ridership', data: [{ month: 'Jun', value: 8200 }, { month: 'Jul', value: 8350 }, { month: 'Aug', value: 8500 }, { month: 'Sep', value: 8420 }], xKey: 'month', yKey: 'value' },
          ],
        },
        {
          pageName: 'AM Peak Shift',
          filterSummary: 'Jun 22 – Sep 18, 2025 · AM Peak',
          narrative: 'Early AM ridership (before 9 AM) is declining while late AM grows. Look at the period breakdown.',
          filters: { tab: 'system', startDate: '2025-06-22', endDate: '2025-09-18', timeMode: 'custom', timePeriods: ['AM Peak'] },
          charts: [
            { id: 'sys-earlyam', type: 'bar', title: 'Early vs Late AM', data: [{ slot: '6–7 AM', value: 2100 }, { slot: '7–8 AM', value: 3400 }, { slot: '8–9 AM', value: 3800 }, { slot: '9–10 AM', value: 2200 }], xKey: 'slot', yKey: 'value' },
            { id: 'sys-shift', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '+15 min', metricLabel: 'Peak Shift Since June' },
          ],
        },
        {
          pageName: 'August vs June',
          filterSummary: 'Aug 1 – Sep 18 vs Jun 22 – Jul 31 · AM Peak',
          narrative: 'The shift has accelerated since August. Compare August–September to the earlier summer months.',
          filters: { tab: 'system', startDate: '2025-08-01', endDate: '2025-09-18', timeMode: 'custom', timePeriods: ['AM Peak'], comparisonMode: true, comparisonStartDate: '2025-06-22', comparisonEndDate: '2025-07-31' },
          charts: [
            { id: 'sys-comp', type: 'bar', title: 'AM Period Comparison', data: [{ slot: '6–7 AM', current: 2100, earlier: 2400 }, { slot: '7–8 AM', current: 3400, earlier: 3600 }, { slot: '8–9 AM', current: 3800, earlier: 3200 }, { slot: '9–10 AM', current: 2200, earlier: 1800 }], xKey: 'slot', yKey: 'current', yKey2: 'earlier' },
          ],
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
  updateInsightImage: (insightId: string, previewImage: string) => void;
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

      if (HYBRID_MODE) {
        // Take only the first AI-generated insight, pad rest with mock data
        const aiInsight = result.insights[0];
        const mockPadding = MOCK_INSIGHTS.insights.filter(
          m => !aiInsight || m.routeIds?.[0] !== aiInsight.routeIds?.[0]
        ).slice(0, 4);
        setData({
          ...result,
          insights: aiInsight ? [aiInsight, ...mockPadding] : mockPadding,
        });
      } else {
        setData(result);
      }
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

  const updateInsightImage = useCallback((insightId: string, previewImage: string) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        insights: prev.insights.map(i =>
          i.id === insightId ? { ...i, previewImage } : i
        ),
      };
    });
  }, []);

  return { data, isLoading, error, generate, refetch, updateInsightImage };
}
