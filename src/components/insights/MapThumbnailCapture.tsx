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

            if (isComparison && insight.walkthrough?.length) {
              const compStep = insight.walkthrough.find(s => s.filters.comparisonMode);
              if (compStep?.filters.comparisonStartDate && compStep?.filters.comparisonEndDate) {
                // Fetch baseline for same direction
                const bestDir = bestSegData === dir0Data ? '0' : '1';
                const baseRes = await fetch(`/api/ridership/route/${fullRouteId}/segments?startDate=${compStep.filters.comparisonStartDate}&endDate=${compStep.filters.comparisonEndDate}&direction=${bestDir}`);
                if (baseRes.ok) {
                  const baseData: RouteSegmentsResponse = await baseRes.json();
                  const baselineMap = new Map<string, number>();
                  for (const seg of baseData.segments) {
                    baselineMap.set(`${seg.fromStopId}-${seg.toStopId}`, seg.avgLoad);
                  }
                  let minDiff = 0, maxDiff = 0;
                  const pctChanges = new Map<string, number>();
                  for (const seg of bestSegData.segments) {
                    const key = `${seg.fromStopId}-${seg.toStopId}`;
                    const baseline = baselineMap.get(key);
                    const pct = baseline && baseline > 0 ? ((seg.avgLoad - baseline) / baseline) * 100 : 0;
                    pctChanges.set(key, pct);
                    minDiff = Math.min(minDiff, pct);
                    maxDiff = Math.max(maxDiff, pct);
                  }
                  geojson = buildSegmentGeoJSON(bestSegData.segments, shapeCoords, (seg) => {
                    const pct = pctChanges.get(`${seg.fromStopId}-${seg.toStopId}`) || 0;
                    return rgbToHex(getComparisonColorRGB(pct, minDiff, maxDiff));
                  });
                } else {
                  geojson = buildSegmentGeoJSON(bestSegData.segments, shapeCoords, (seg) =>
                    rgbToHex(valueToColor(seg.maxLoad, segMin, segMax))
                  );
                }
              } else {
                geojson = buildSegmentGeoJSON(bestSegData.segments, shapeCoords, (seg) =>
                  rgbToHex(valueToColor(seg.maxLoad, segMin, segMax))
                );
              }
            } else {
              geojson = buildSegmentGeoJSON(bestSegData.segments, shapeCoords, (seg) =>
                rgbToHex(valueToColor(seg.maxLoad, bestSegData!.minLoad, bestSegData!.maxLoad))
              );
            }
          } else {
            // Fallback: single-color route
            geojson = {
              type: 'FeatureCollection',
              features: [{ type: 'Feature', properties: { color: '#ED7E22' }, geometry: { type: 'LineString', coordinates: shapeCoords } }],
            };
          }

          // Zoom to the most interesting 3-5 segments
          if (loadSegments.length > 5) {
            const sorted = [...loadSegments].sort((a, b) => b.maxLoad - a.maxLoad);
            const hotSegments = sorted.slice(0, 5);
            const hotBounds = segmentBounds(hotSegments);
            if (hotBounds) {
              bounds = hotBounds;
            }
          }

          // Fallback if no segments returned
          if (geojson.features.length === 0) {
            geojson = {
              type: 'FeatureCollection',
              features: paths.map((p, i) => ({
                type: 'Feature' as const,
                properties: { id: i, color: '#ED7E22' },
                geometry: { type: 'LineString' as const, coordinates: p.path },
              })),
            };
          }

          // Add or update source and layer
          const sourceId = 'thumb-route';
          const layerId = 'thumb-route-line';
          if (map.getSource(sourceId)) {
            (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(geojson);
          } else {
            map.addSource(sourceId, { type: 'geojson', data: geojson });
            map.addLayer({
              id: layerId,
              type: 'line',
              source: sourceId,
              paint: {
                'line-color': ['get', 'color'],
                'line-width': 6,
                'line-opacity': 0.9,
              },
              layout: {
                'line-cap': 'round',
                'line-join': 'round',
              },
            });
          }

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
                stopPoints.features.push({
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'Point', coordinates: [seg.fromLon, seg.fromLat] },
                });
              }
              if (!seen.has(seg.toStopId)) {
                seen.add(seg.toStopId);
                stopPoints.features.push({
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'Point', coordinates: [seg.toLon, seg.toLat] },
                });
              }
            }

            const stopsSourceId = 'thumb-stops';
            const stopsLayerId = 'thumb-stops-dots';
            if (map.getSource(stopsSourceId)) {
              (map.getSource(stopsSourceId) as mapboxgl.GeoJSONSource).setData(stopPoints);
            } else {
              map.addSource(stopsSourceId, { type: 'geojson', data: stopPoints });
              map.addLayer({
                id: stopsLayerId,
                type: 'circle',
                source: stopsSourceId,
                paint: {
                  'circle-radius': 3,
                  'circle-color': '#3D2817',
                  'circle-stroke-width': 1,
                  'circle-stroke-color': '#FFFFFF',
                },
              });
            }
          }

          // Fit to bounds
          map.fitBounds(bounds, { padding: 40, maxZoom: 40, animate: false });

          // Wait for map idle
          await new Promise<void>((resolve) => {
            const onIdle = () => { map.off('idle', onIdle); resolve(); };
            map.on('idle', onIdle);
            setTimeout(() => { map.off('idle', onIdle); resolve(); }, 3000);
          });

          // Capture
          const mapCanvas = map.getCanvas();
          const compositeCanvas = document.createElement('canvas');
          compositeCanvas.width = mapCanvas.width;
          compositeCanvas.height = mapCanvas.height;
          const ctx = compositeCanvas.getContext('2d');
          if (!ctx) return null;
          ctx.drawImage(mapCanvas, 0, 0);

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
