'use client';

import { useState, useCallback, useRef } from 'react';
import type { InsightsResponse } from '@/types/insights';

// Set to true to use mock data instead of calling the API
const USE_MOCK_DATA = false;

// When true, only the first insight is AI-generated; the rest are mock data
const HYBRID_MODE = true;

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
      analysisSteps: [
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
          pageName: 'Route 62 Overview',
          filterSummary: 'Aug 1 – Sep 18, 2025 · All days · All periods',
          narrative: 'Route 62 is seeing higher ridership than usual. Let\'s start with an overview of the full summer period.',
          narrativeByMetric: {
            'Average daily boardings': 'Route 62 averaged 2,487 daily boardings over this period — a 15% increase over the prior summer. The trend has been climbing steadily since early August.',
            'Average daily alightings': 'Daily alightings averaged 2,394, tracking closely with boardings. The consistent ratio suggests most riders are completing full trips on this route.',
            'Average daily activity': 'Total daily activity (boardings + alightings) averaged 4,861 per day. This combined view shows the full demand picture for Route 62.',
          },
          filters: { tab: 'routes', routeId: '62', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18' },
          relevantMetrics: ['Average daily boardings', 'Average daily alightings', 'Average daily activity'],
          charts: [
            { id: 'r62-trend', type: 'area', title: 'Daily Ridership Trend', data: [{ date: 'Aug 1', value: 2280 }, { date: 'Aug 8', value: 2320 }, { date: 'Aug 15', value: 2450 }, { date: 'Aug 22', value: 2480 }, { date: 'Aug 29', value: 2520 }, { date: 'Sep 5', value: 2580 }, { date: 'Sep 12', value: 2640 }], xKey: 'date', yKey: 'value' },
            { id: 'r62-avg', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '2,487', metricLabel: 'Avg Daily Boardings' },
          ],
          chartsByMetric: {
            'Average daily boardings': [
              { id: 'r62-trend-b', type: 'area', title: 'Daily Boarding Trend', data: [{ date: 'Aug 1', value: 2280 }, { date: 'Aug 8', value: 2320 }, { date: 'Aug 15', value: 2450 }, { date: 'Aug 22', value: 2480 }, { date: 'Aug 29', value: 2520 }, { date: 'Sep 5', value: 2580 }, { date: 'Sep 12', value: 2640 }], xKey: 'date', yKey: 'value' },
              { id: 'r62-avg-b', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '2,487', metricLabel: 'Avg Daily Boardings' },
            ],
            'Average daily alightings': [
              { id: 'r62-trend-a', type: 'area', title: 'Daily Alighting Trend', data: [{ date: 'Aug 1', value: 2190 }, { date: 'Aug 8', value: 2240 }, { date: 'Aug 15', value: 2380 }, { date: 'Aug 22', value: 2410 }, { date: 'Aug 29', value: 2460 }, { date: 'Sep 5', value: 2510 }, { date: 'Sep 12', value: 2570 }], xKey: 'date', yKey: 'value' },
              { id: 'r62-avg-a', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '2,394', metricLabel: 'Avg Daily Alightings' },
            ],
            'Average daily activity': [
              { id: 'r62-trend-act', type: 'area', title: 'Daily Activity Trend', data: [{ date: 'Aug 1', value: 4470 }, { date: 'Aug 8', value: 4560 }, { date: 'Aug 15', value: 4830 }, { date: 'Aug 22', value: 4890 }, { date: 'Aug 29', value: 4980 }, { date: 'Sep 5', value: 5090 }, { date: 'Sep 12', value: 5210 }], xKey: 'date', yKey: 'value' },
              { id: 'r62-avg-act', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '4,861', metricLabel: 'Avg Daily Activity' },
            ],
          },
        },
        {
          pageName: 'PM Peak Concentration',
          filterSummary: 'Aug 1 – Sep 18, 2025 · All days · PM Peak',
          narrative: 'The crowding is concentrated during PM peak hours (3–7 PM). Notice the spike in the by-period chart.',
          filters: { tab: 'routes', routeId: '62', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18', timeMode: 'custom', timePeriods: ['PM Peak'] },
          relevantMetrics: ['Average daily boardings', 'Average load', 'Maxload'],
          charts: [
            { id: 'r62-period', type: 'bar', title: 'Boardings by Period', data: [{ period: 'Early AM', value: 320 }, { period: 'AM Peak', value: 680 }, { period: 'Midday', value: 450 }, { period: 'PM Peak', value: 890 }, { period: 'Evening', value: 210 }], xKey: 'period', yKey: 'value' },
            { id: 'r62-load', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '87%', metricLabel: 'PM Peak Avg Load Factor' },
          ],
          chartsByMetric: {
            'Average daily boardings': [
              { id: 'r62-period-b', type: 'bar', title: 'Boardings by Period', data: [{ period: 'Early AM', value: 320 }, { period: 'AM Peak', value: 680 }, { period: 'Midday', value: 450 }, { period: 'PM Peak', value: 890 }, { period: 'Evening', value: 210 }], xKey: 'period', yKey: 'value' },
              { id: 'r62-board-m', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '2,550', metricLabel: 'PM Peak Avg Daily Boardings' },
            ],
            'Average load': [
              { id: 'r62-period-l', type: 'bar', title: 'Avg Load by Period', data: [{ period: 'Early AM', value: 42 }, { period: 'AM Peak', value: 71 }, { period: 'Midday', value: 55 }, { period: 'PM Peak', value: 87 }, { period: 'Evening', value: 38 }], xKey: 'period', yKey: 'value' },
              { id: 'r62-load-m', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '87%', metricLabel: 'PM Peak Avg Load Factor' },
            ],
            'Maxload': [
              { id: 'r62-period-mx', type: 'bar', title: 'Max Load by Period', data: [{ period: 'Early AM', value: 58 }, { period: 'AM Peak', value: 89 }, { period: 'Midday', value: 72 }, { period: 'PM Peak', value: 104 }, { period: 'Evening', value: 51 }], xKey: 'period', yKey: 'value' },
              { id: 'r62-maxload-m', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '104%', metricLabel: 'PM Peak Max Load' },
            ],
          },
        },
        {
          pageName: 'Weekday Breakdown',
          filterSummary: 'Aug 1 – Sep 18, 2025 · Tue–Thu · PM Peak',
          narrative: 'Weekdays are hit hardest, especially Tuesday through Thursday. Weekend ridership is normal.',
          filters: { tab: 'routes', routeId: '62', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18', timeMode: 'custom', timePeriods: ['PM Peak'], daysMode: 'custom', customDays: ['Tue', 'Wed', 'Thu'] },
          charts: [
            { id: 'r62-day', type: 'bar', title: 'Avg Boardings by Day', data: [{ day: 'Mon', value: 780 }, { day: 'Tue', value: 920 }, { day: 'Wed', value: 940 }, { day: 'Thu', value: 910 }, { day: 'Fri', value: 720 }, { day: 'Sat', value: 430 }, { day: 'Sun', value: 380 }], xKey: 'day', yKey: 'value' },
          ],
        },
        {
          pageName: 'Summer Comparison',
          filterSummary: 'Aug 1 – Sep 18 vs Jun 22 – Jul 31, 2025',
          narrative: 'Here\'s how current ridership compares to earlier this summer. The increase is clear.',
          filters: { tab: 'routes', routeId: '62', routeTab: 'Summary', startDate: '2025-08-01', endDate: '2025-09-18', comparisonMode: true, comparisonStartDate: '2025-06-22', comparisonEndDate: '2025-07-31' },
          charts: [
            { id: 'r62-comp', type: 'area', title: 'Ridership Comparison', data: [{ week: 'Wk 1', current: 2280, earlier: 1820 }, { week: 'Wk 2', current: 2370, earlier: 1950 }, { week: 'Wk 3', current: 2450, earlier: 2050 }, { week: 'Wk 4', current: 2520, earlier: 2100 }, { week: 'Wk 5', current: 2580, earlier: 2080 }, { week: 'Wk 6', current: 2640, earlier: 2120 }], xKey: 'week', yKey: 'current', yKey2: 'earlier' },
            { id: 'r62-change', type: 'metric', title: '', data: [], xKey: '', yKey: '', metricValue: '+12%', metricLabel: 'Increase vs Early Summer' },
          ],
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

  return { data, isLoading, error, generate, refetch };
}
