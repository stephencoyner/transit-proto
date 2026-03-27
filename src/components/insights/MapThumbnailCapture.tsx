'use client';

import React, { useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import MapboxMap, { MapRef } from 'react-map-gl/mapbox';
import { flattenPaths } from '@/lib/mapUtils';
import { valueToColor } from '@/lib/utils/colorScale';
import { getComparisonColorRGB } from '@/utils/comparisonColors';
import type { RouteFeature } from '@/lib/mapUtils';
import type { InsightCard } from '@/types/insights';
import type { RouteSegmentsResponse, SegmentBreakdown } from '@/types/ridership';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
const MAP_STYLE = 'mapbox://styles/stephencoynerseattle/cmgifl16g001u01s6699hg7iv';

const THUMB_WIDTH = 800;
const THUMB_HEIGHT = 500;

function rgbToHex(rgb: [number, number, number] | number[]): string {
  return `#${rgb.slice(0, 3).map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Find the index of the closest point on a shape to a given coordinate */
function findClosestPointIndex(coord: [number, number], shapeCoords: number[][]): number {
  let minDist = Infinity;
  let closestIndex = 0;
  shapeCoords.forEach((c, i) => {
    const dx = c[0] - coord[0];
    const dy = c[1] - coord[1];
    const dist = dx * dx + dy * dy;
    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
    }
  });
  return closestIndex;
}

/** Build colored segment GeoJSON by snapping segment endpoints to route shape geometry */
function buildSegmentGeoJSON(
  segments: SegmentBreakdown[],
  shapeCoords: number[][],
  getColor: (seg: SegmentBreakdown) => string
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const seg of segments) {
    const fromCoord: [number, number] = [seg.fromLon, seg.fromLat];
    const toCoord: [number, number] = [seg.toLon, seg.toLat];

    const fromIdx = findClosestPointIndex(fromCoord, shapeCoords);
    const toIdx = findClosestPointIndex(toCoord, shapeCoords);

    let path: number[][];
    if (fromIdx < toIdx) {
      path = shapeCoords.slice(fromIdx, toIdx + 1);
    } else if (fromIdx > toIdx) {
      // Reverse direction — still extract the sub-path
      path = shapeCoords.slice(toIdx, fromIdx + 1).reverse();
    } else {
      path = [fromCoord, toCoord];
    }

    if (path.length >= 2) {
      features.push({
        type: 'Feature',
        properties: { color: getColor(seg) },
        geometry: { type: 'LineString', coordinates: path },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}

/** Snap a point [lon, lat] to the nearest point on a LineString coordinate array */
function snapToLine(point: [number, number], line: number[][]): [number, number] {
  let minDist = Infinity;
  let closest: [number, number] = point;

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lenSq));
    }

    const proj: [number, number] = [a[0] + t * dx, a[1] + t * dy];
    const distSq = (point[0] - proj[0]) ** 2 + (point[1] - proj[1]) ** 2;

    if (distSq < minDist) {
      minDist = distSq;
      closest = proj;
    }
  }

  return closest;
}

export interface MapThumbnailCaptureHandle {
  captureRoute: (insight: InsightCard, shapes: RouteFeature[]) => Promise<string | null>;
}

export const MapThumbnailCapture = forwardRef<MapThumbnailCaptureHandle>(
  function MapThumbnailCapture(_, ref) {
    const mapRef = useRef<MapRef>(null);
    const [isReady, setIsReady] = useState(false);

    const handleMapLoad = useCallback(() => {
      const map = mapRef.current?.getMap();
      if (map) {
        // Disable all labels from the basemap standard import
        try {
          map.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
          map.setConfigProperty('basemap', 'showTransitLabels', false);
          map.setConfigProperty('basemap', 'showPlaceLabels', false);
          map.setConfigProperty('basemap', 'showRoadLabels', false);
        } catch {
          // Fallback: hide all symbol layers directly
          const style = map.getStyle();
          if (style?.layers) {
            for (const layer of style.layers) {
              if (layer.type === 'symbol') {
                try { map.setLayoutProperty(layer.id, 'visibility', 'none'); } catch {}
              }
            }
          }
        }
        const onIdle = () => { map.off('idle', onIdle); setIsReady(true); };
        map.on('idle', onIdle);
      } else {
        setIsReady(true);
      }
    }, []);

    useImperativeHandle(ref, () => ({
      async captureRoute(insight: InsightCard, shapes: RouteFeature[]): Promise<string | null> {
        const map = mapRef.current?.getMap();
        if (!map || !isReady) return null;

        try {
          const routeShortName = insight.routeIds?.[0];
          if (!routeShortName) return null;

          // Resolve short name to full route ID
          const matchingShape = shapes.find(s => s.properties.route_short_name === routeShortName);
          const fullRouteId = matchingShape?.properties.route_id;
          if (!fullRouteId) return null;

          const allRouteShapes = shapes.filter(s => s.properties.route_id === fullRouteId);
          if (allRouteShapes.length === 0) return null;

          const { start, end } = insight.dateRange;
          const isComparison = insight.category === 'decline' || insight.category === 'comparison';
          const isBoardingViz = insight.category === 'anomaly' || (insight.category === 'trend' && insight.severity === 'positive');

          // ─── BOARDING VISUALIZATION MODE ───
          if (isBoardingViz) {
            // Fetch stop-level boarding data for one direction only
            const stopsRes = await fetch(`/api/ridership/route/${fullRouteId}/stops?startDate=${start}&endDate=${end}&direction=0`);
            if (stopsRes.ok) {
              const stopsData = await stopsRes.json() as {
                stops: Array<{ stopId: string; stopName: string; lat: number; lon: number; totalBoardings: number; avgDailyBoardings: number }>;
                maxBoardings: number;
              };

              if (stopsData.stops.length > 0) {
                // Use shape geometry
                const allPaths = flattenPaths(allRouteShapes);
                const shapeCoords = allPaths[0]?.path || [];

                // Draw route as thin neutral line
                const routeGeojson: GeoJSON.FeatureCollection = {
                  type: 'FeatureCollection',
                  features: [{ type: 'Feature', properties: { color: '#A8A39C' }, geometry: { type: 'LineString', coordinates: shapeCoords } }],
                };

                const sourceId = 'thumb-route';
                const layerId = 'thumb-route-line';
                // Remove old route layer to ensure correct line-width
                if (map.getLayer(layerId)) map.removeLayer(layerId);
                if (map.getSource(sourceId)) map.removeSource(sourceId);

                map.addSource(sourceId, { type: 'geojson', data: routeGeojson });
                map.addLayer({
                  id: layerId, type: 'line', source: sourceId,
                  paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 1 },
                  layout: { 'line-cap': 'round', 'line-join': 'round' },
                });

                // Build graduated circle features for stops
                const maxB = stopsData.maxBoardings || 1;
                const stopFeatures: GeoJSON.Feature[] = stopsData.stops
                  .filter(s => s.lat && s.lon && s.totalBoardings > 0)
                  .map(s => {
                    const snapped = snapToLine([s.lon, s.lat], shapeCoords);
                    return {
                      type: 'Feature' as const,
                      properties: { boardings: s.totalBoardings },
                      geometry: { type: 'Point' as const, coordinates: snapped },
                    };
                  });

                const stopsGeojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: stopFeatures };

                const stopsSourceId = 'thumb-stops';
                const borderLayerId = 'thumb-stops-border';
                const centerLayerId = 'thumb-stops-center';
                // Remove old stop layers/source to ensure correct paint properties
                if (map.getLayer('thumb-stops-dots')) map.removeLayer('thumb-stops-dots');
                if (map.getLayer(borderLayerId)) map.removeLayer(borderLayerId);
                if (map.getLayer(centerLayerId)) map.removeLayer(centerLayerId);
                if (map.getSource(stopsSourceId)) map.removeSource(stopsSourceId);

                map.addSource(stopsSourceId, { type: 'geojson', data: stopsGeojson });
                // Outer ring — colored by boarding value, fixed size
                map.addLayer({
                  id: borderLayerId, type: 'circle', source: stopsSourceId,
                  paint: {
                    'circle-radius': 14,
                    'circle-color': ['interpolate', ['linear'], ['get', 'boardings'],
                      0, '#ED7E22',
                      maxB * 0.25, '#E8683A',
                      maxB * 0.5, '#D94E52',
                      maxB * 0.75, '#B13C8C',
                      maxB, '#7B2D8E',
                    ],
                    'circle-opacity': 0.85,
                  },
                });
                // Inner center — white dot
                map.addLayer({
                  id: centerLayerId, type: 'circle', source: stopsSourceId,
                  paint: {
                    'circle-radius': 5,
                    'circle-color': '#FFFFFF',
                    'circle-opacity': 1,
                  },
                });

                // Zoom to show the top 6 highest-boarding stops for good visual density
                const topStops = [...stopsData.stops]
                  .filter(s => s.lat && s.lon)
                  .sort((a, b) => b.totalBoardings - a.totalBoardings)
                  .slice(0, 6);

                if (topStops.length > 0) {
                  const lons = topStops.map(s => s.lon);
                  const lats = topStops.map(s => s.lat);
                  const stopBounds: [[number, number], [number, number]] = [
                    [Math.min(...lons), Math.min(...lats)],
                    [Math.max(...lons), Math.max(...lats)],
                  ];
                  map.fitBounds(stopBounds, { padding: 20, maxZoom: 40, minZoom: 15, animate: false });
                } else {
                  const routeBounds = computePathBounds(shapeCoords);
                  if (routeBounds) map.fitBounds(routeBounds, { padding: 10, maxZoom: 40, minZoom: 16, animate: false });
                }

                // Wait for idle, hide labels, wait again, capture
                await new Promise<void>((resolve) => {
                  const onIdle = () => { map.off('idle', onIdle); resolve(); };
                  map.on('idle', onIdle);
                  setTimeout(() => { map.off('idle', onIdle); resolve(); }, 3000);
                });

                const allLayers = map.getStyle()?.layers || [];
                const hiddenIds: string[] = [];
                for (const layer of allLayers) {
                  if (layer.type === 'symbol') {
                    try { map.setLayoutProperty(layer.id, 'visibility', 'none'); hiddenIds.push(layer.id); } catch {}
                  }
                }

                await new Promise<void>((resolve) => {
                  const onIdle = () => { map.off('idle', onIdle); resolve(); };
                  map.on('idle', onIdle);
                  setTimeout(() => { map.off('idle', onIdle); resolve(); }, 1000);
                });

                const mapCanvas = map.getCanvas();
                const compositeCanvas = document.createElement('canvas');
                compositeCanvas.width = mapCanvas.width;
                compositeCanvas.height = mapCanvas.height;
                const ctx = compositeCanvas.getContext('2d');
                if (!ctx) return null;
                ctx.drawImage(mapCanvas, 0, 0);

                for (const id of hiddenIds) {
                  try { map.setLayoutProperty(id, 'visibility', 'visible'); } catch {}
                }

                return compositeCanvas.toDataURL('image/jpeg', 0.9);
              }
            }
            // Fall through to segment visualization if boarding data fails
          }

          // ─── SEGMENT LOAD VISUALIZATION MODE ───
          // Fetch segments for both directions and pick the one that best shows the insight
          const [resDir0, resDir1] = await Promise.all([
            fetch(`/api/ridership/route/${fullRouteId}/segments?startDate=${start}&endDate=${end}&direction=0`),
            fetch(`/api/ridership/route/${fullRouteId}/segments?startDate=${start}&endDate=${end}&direction=1`),
          ]);

          let bestSegData: RouteSegmentsResponse | null = null;
          const dir0Data = resDir0.ok ? await resDir0.json() as RouteSegmentsResponse : null;
          const dir1Data = resDir1.ok ? await resDir1.json() as RouteSegmentsResponse : null;

          if (dir0Data && dir1Data) {
            if (insight.category === 'crowding') {
              // Pick direction with worst crowding
              bestSegData = dir0Data.maxLoad >= dir1Data.maxLoad ? dir0Data : dir1Data;
            } else if (insight.category === 'decline') {
              // Pick direction with lowest ridership (most decline)
              bestSegData = dir0Data.avgLoad <= dir1Data.avgLoad ? dir0Data : dir1Data;
            } else if (insight.category === 'trend' && insight.severity === 'positive') {
              // Pick direction with highest ridership (most growth)
              bestSegData = dir0Data.avgLoad >= dir1Data.avgLoad ? dir0Data : dir1Data;
            } else {
              // Default: pick direction with most variation (most interesting)
              const range0 = dir0Data.maxLoad - dir0Data.minLoad;
              const range1 = dir1Data.maxLoad - dir1Data.minLoad;
              bestSegData = range0 >= range1 ? dir0Data : dir1Data;
            }
          } else {
            bestSegData = dir0Data || dir1Data;
          }

          // Use the shape geometry that best matches the chosen direction's segments
          const allPaths = flattenPaths(allRouteShapes);
          // Find shape whose geometry best covers the chosen segments
          let shapeCoords = allPaths[0]?.path || [];
          if (bestSegData && bestSegData.segments.length > 0 && allPaths.length > 1) {
            // Pick the shape whose start is closest to the first segment's fromStop
            const firstSeg = bestSegData.segments[0];
            const fromCoord: [number, number] = [firstSeg.fromLon, firstSeg.fromLat];
            let bestDist = Infinity;
            for (const p of allPaths) {
              if (p.path.length === 0) continue;
              const dx = p.path[0][0] - fromCoord[0];
              const dy = p.path[0][1] - fromCoord[1];
              const dist = dx * dx + dy * dy;
              if (dist < bestDist) {
                bestDist = dist;
                shapeCoords = p.path;
              }
            }
          }

          // Compute bounds from the chosen shape only
          let bounds = computePathBounds(shapeCoords);
          if (!bounds) return null;

          // Build colored GeoJSON
          let geojson: GeoJSON.FeatureCollection;
          let loadSegments: SegmentBreakdown[] = [];

          if (bestSegData && bestSegData.segments.length > 0) {
            loadSegments = bestSegData.segments;

            // Compute actual min/max from displayed segments for better color spread
            const maxLoads = loadSegments.map(s => s.maxLoad);
            const segMin = Math.min(...maxLoads);
            const segMax = Math.max(...maxLoads);

            // Build percentile rank map for guaranteed color variety
            const sortedByLoad = [...loadSegments].sort((a, b) => a.maxLoad - b.maxLoad);
            const percentileMap = new Map<string, number>();
            sortedByLoad.forEach((seg, i) => {
              const percentile = sortedByLoad.length > 1 ? i / (sortedByLoad.length - 1) : 0.5;
              percentileMap.set(`${seg.fromStopId}-${seg.toStopId}`, percentile);
            });

            if (isComparison) {
              // Find comparison dates from walkthrough, or auto-split the date range
              let compStart: string | undefined;
              let compEnd: string | undefined;

              if (insight.walkthrough?.length) {
                const compStep = insight.walkthrough.find(s => s.filters.comparisonMode);
                compStart = compStep?.filters.comparisonStartDate;
                compEnd = compStep?.filters.comparisonEndDate;
              }

              // Fallback: split date range — first half = baseline, second half = current
              if (!compStart || !compEnd) {
                const startMs = new Date(start).getTime();
                const endMs = new Date(end).getTime();
                const midMs = startMs + (endMs - startMs) / 2;
                const midDate = new Date(midMs);
                compStart = start;
                compEnd = midDate.toISOString().slice(0, 10);
              }

              if (compStart && compEnd) {
                const bestDir = bestSegData === dir0Data ? '0' : '1';
                // Fetch baseline (earlier period)
                const baseRes = await fetch(`/api/ridership/route/${fullRouteId}/segments?startDate=${compStart}&endDate=${compEnd}&direction=${bestDir}`);
                // Fetch current period (after baseline end to insight end)
                const currentStart = new Date(new Date(compEnd).getTime() + 86400000).toISOString().slice(0, 10);
                const currentRes = await fetch(`/api/ridership/route/${fullRouteId}/segments?startDate=${currentStart}&endDate=${end}&direction=${bestDir}`);

                if (baseRes.ok && currentRes.ok) {
                  const baseData: RouteSegmentsResponse = await baseRes.json();
                  const currentData: RouteSegmentsResponse = await currentRes.json();
                  const baselineMap = new Map<string, number>();
                  for (const seg of baseData.segments) {
                    baselineMap.set(`${seg.fromStopId}-${seg.toStopId}`, seg.avgLoad);
                  }
                  let minDiff = 0, maxDiff = 0;
                  const pctChanges = new Map<string, number>();
                  const compareSegs = currentData.segments.length > 0 ? currentData.segments : bestSegData.segments;
                  // For decline insights, flip sign so declining = red (negative)
                  const sign = insight.category === 'decline' ? -1 : 1;
                  for (const seg of compareSegs) {
                    const key = `${seg.fromStopId}-${seg.toStopId}`;
                    const baseline = baselineMap.get(key);
                    const pct = baseline && baseline > 0 ? sign * ((seg.avgLoad - baseline) / baseline) * 100 : 0;
                    pctChanges.set(key, pct);
                    minDiff = Math.min(minDiff, pct);
                    maxDiff = Math.max(maxDiff, pct);
                  }
                  geojson = buildSegmentGeoJSON(bestSegData.segments, shapeCoords, (seg) => {
                    const pct = pctChanges.get(`${seg.fromStopId}-${seg.toStopId}`) || 0;
                    return rgbToHex(getComparisonColorRGB(pct, minDiff, maxDiff));
                  });
                } else {
                  geojson = buildSegmentGeoJSON(bestSegData.segments, shapeCoords, (seg) => {
                    const p = percentileMap.get(`${seg.fromStopId}-${seg.toStopId}`) ?? 0.5;
                    return rgbToHex(valueToColor(p, 0, 1));
                  });
                }
              }
            } else {
              // Use percentile-based coloring for full color spread
              geojson = buildSegmentGeoJSON(bestSegData.segments, shapeCoords, (seg) => {
                const pct = percentileMap.get(`${seg.fromStopId}-${seg.toStopId}`) ?? 0.5;
                return rgbToHex(valueToColor(pct, 0, 1));
              });
            }
          } else {
            // Fallback: single-color route
            geojson = {
              type: 'FeatureCollection',
              features: [{ type: 'Feature', properties: { color: '#ED7E22' }, geometry: { type: 'LineString', coordinates: shapeCoords } }],
            };
          }

          // Zoom to a contiguous run of 5 segments centered on the hottest one
          // This shows color variety since adjacent segments have different loads
          if (loadSegments.length > 5) {
            // Find the index of the hottest segment in the original order
            let hotIdx = 0;
            let hotMax = -Infinity;
            for (let i = 0; i < loadSegments.length; i++) {
              if (loadSegments[i].maxLoad > hotMax) {
                hotMax = loadSegments[i].maxLoad;
                hotIdx = i;
              }
            }
            // Take 5 contiguous segments centered on the hottest
            const startIdx = Math.max(0, Math.min(hotIdx - 2, loadSegments.length - 5));
            const windowSegments = loadSegments.slice(startIdx, startIdx + 5);
            const windowBounds = segmentBounds(windowSegments);
            if (windowBounds) {
              bounds = windowBounds;
            }
          }

          // Fallback if no segments returned
          if (geojson.features.length === 0) {
            geojson = {
              type: 'FeatureCollection',
              features: allPaths.map((p, i) => ({
                type: 'Feature' as const,
                properties: { id: i, color: '#ED7E22' },
                geometry: { type: 'LineString' as const, coordinates: p.path },
              })),
            };
          }

          // Add or update source and layer
          const sourceId = 'thumb-route';
          const layerId = 'thumb-route-line';
          // Remove old route layer to ensure correct paint properties
          if (map.getLayer(layerId)) map.removeLayer(layerId);
          if (map.getSource(sourceId)) map.removeSource(sourceId);

          map.addSource(sourceId, { type: 'geojson', data: geojson });
          map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': ['get', 'color'],
              'line-width': 12,
              'line-opacity': 1,
            },
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
          });

          // Add stop dots layer from segment endpoints
          if (loadSegments.length > 0) {
            const stopPoints: GeoJSON.FeatureCollection = {
              type: 'FeatureCollection',
              features: [],
            };
            const seen = new Set<string>();
            for (const seg of loadSegments) {
              if (!seen.has(seg.fromStopId)) {
                seen.add(seg.fromStopId);
                const snapped = snapToLine([seg.fromLon, seg.fromLat], shapeCoords);
                stopPoints.features.push({
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'Point', coordinates: snapped },
                });
              }
              if (!seen.has(seg.toStopId)) {
                seen.add(seg.toStopId);
                const snapped = snapToLine([seg.toLon, seg.toLat], shapeCoords);
                stopPoints.features.push({
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'Point', coordinates: snapped },
                });
              }
            }

            const stopsSourceId = 'thumb-stops';
            const stopsLayerId = 'thumb-stops-dots';
            // Remove old stop layers to ensure correct paint properties
            if (map.getLayer(stopsLayerId)) map.removeLayer(stopsLayerId);
            if (map.getLayer('thumb-stops-border')) map.removeLayer('thumb-stops-border');
            if (map.getLayer('thumb-stops-center')) map.removeLayer('thumb-stops-center');
            if (map.getSource(stopsSourceId)) map.removeSource(stopsSourceId);

            map.addSource(stopsSourceId, { type: 'geojson', data: stopPoints });
            map.addLayer({
              id: stopsLayerId,
              type: 'circle',
              source: stopsSourceId,
              paint: {
                'circle-radius': 5,
                'circle-color': '#3D2817',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#FFFFFF',
              },
            });
          }

          // Fit to bounds
          map.fitBounds(bounds, { padding: 10, maxZoom: 40, minZoom: 16, animate: false });

          // Wait for map to finish rendering tiles
          await new Promise<void>((resolve) => {
            const onIdle = () => { map.off('idle', onIdle); resolve(); };
            map.on('idle', onIdle);
            setTimeout(() => { map.off('idle', onIdle); resolve(); }, 3000);
          });

          // Now hide ALL symbol layers (after tiles have loaded)
          const allLayers = map.getStyle()?.layers || [];
          const hiddenIds: string[] = [];
          for (const layer of allLayers) {
            if (layer.type === 'symbol') {
              try {
                map.setLayoutProperty(layer.id, 'visibility', 'none');
                hiddenIds.push(layer.id);
              } catch {}
            }
          }

          // Wait for another idle so the hidden labels are actually gone from the canvas
          await new Promise<void>((resolve) => {
            const onIdle = () => { map.off('idle', onIdle); resolve(); };
            map.on('idle', onIdle);
            setTimeout(() => { map.off('idle', onIdle); resolve(); }, 1000);
          });

          // Capture
          const mapCanvas = map.getCanvas();
          const compositeCanvas = document.createElement('canvas');
          compositeCanvas.width = mapCanvas.width;
          compositeCanvas.height = mapCanvas.height;
          const ctx = compositeCanvas.getContext('2d');
          if (!ctx) return null;
          ctx.drawImage(mapCanvas, 0, 0);

          // Restore labels for next capture
          for (const id of hiddenIds) {
            try { map.setLayoutProperty(id, 'visibility', 'visible'); } catch {}
          }

          return compositeCanvas.toDataURL('image/jpeg', 0.9);
        } catch (err) {
          console.error('[ThumbnailCapture] Failed for insight', insight.id, err);
          return null;
        }
      },
    }), [isReady]);

    return (
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: THUMB_WIDTH,
          height: THUMB_HEIGHT,
          overflow: 'hidden',
          pointerEvents: 'none',
          opacity: 0,
          zIndex: -1,
        }}
      >
        <MapboxMap
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MAP_STYLE}
          onLoad={handleMapLoad}
          preserveDrawingBuffer={true}
          initialViewState={{ longitude: -122.27, latitude: 47.6456, zoom: 12 }}
          style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        />
      </div>
    );
  }
);

/** Compute bounds from a single path's coordinates */
function computePathBounds(coords: number[][]): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const c of coords) {
    if (Number.isFinite(c[0]) && Number.isFinite(c[1])) {
      minLng = Math.min(minLng, c[0]);
      minLat = Math.min(minLat, c[1]);
      maxLng = Math.max(maxLng, c[0]);
      maxLat = Math.max(maxLat, c[1]);
    }
  }
  if (minLng === Infinity) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

/** Fetch segments and build load-colored GeoJSON snapped to route shape */
async function fetchAndBuildLoadGeoJSON(
  routeId: string,
  startDate: string,
  endDate: string,
  shapeCoords: number[][]
): Promise<{ geojson: GeoJSON.FeatureCollection; segments: SegmentBreakdown[] }> {
  try {
    const res = await fetch(`/api/ridership/route/${routeId}/segments?startDate=${startDate}&endDate=${endDate}`);
    if (!res.ok) return { geojson: { type: 'FeatureCollection', features: [] }, segments: [] };
    const data: RouteSegmentsResponse = await res.json();

    // Compute actual min/max from segments for better color spread
    const maxLoads = data.segments.map(s => s.maxLoad);
    const actualMin = Math.min(...maxLoads);
    const actualMax = Math.max(...maxLoads);

    const geojson = buildSegmentGeoJSON(data.segments, shapeCoords, (seg) => {
      return rgbToHex(valueToColor(seg.maxLoad, actualMin, actualMax));
    });
    return { geojson, segments: data.segments };
  } catch {
    return { geojson: { type: 'FeatureCollection', features: [] }, segments: [] };
  }
}

/** Compute bounds from an array of segments' coordinates */
function segmentBounds(segs: SegmentBreakdown[]): [[number, number], [number, number]] | null {
  if (segs.length === 0) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const s of segs) {
    minLng = Math.min(minLng, s.fromLon, s.toLon);
    minLat = Math.min(minLat, s.fromLat, s.toLat);
    maxLng = Math.max(maxLng, s.fromLon, s.toLon);
    maxLat = Math.max(maxLat, s.fromLat, s.toLat);
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}
