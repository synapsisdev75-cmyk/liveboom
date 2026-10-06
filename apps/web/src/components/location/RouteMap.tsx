import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LocateFixed, Route as RouteIcon } from 'lucide-react';
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Route } from '../../lib/routing';
import { LocationPin, type MapPerson } from './LocationPin';

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

type Theme = keyof typeof STYLES;

export type NavUserPosition = { lat: number; lng: number; heading?: number | null; accuracy?: number };

type Props = {
  route: Route | null;
  user: NavUserPosition | null;
  destination: { lat: number; lng: number };
  person?: MapPerson | null;
  live?: boolean;
  className?: string;
  onFail: () => void;
};

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-lb-theme') === 'light' ? 'light' : 'dark';
}

function routeData(route: Route | null) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: route?.coords ?? [] },
  };
}

function routeBounds(route: Route, extra: [number, number][]): LngLatBoundsLike {
  const bounds = new maplibregl.LngLatBounds();
  for (const c of route.coords) bounds.extend(c);
  for (const c of extra) bounds.extend(c);
  return bounds;
}

function decorate(map: MapLibreMap, theme: Theme, route: Route | null) {
  if (!map.getLayer('building-3d') && !map.getLayer('lb-building-3d') && map.getSource('openmaptiles')) {
    map.addLayer({
      id: 'lb-building-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': theme === 'dark' ? '#2a3047' : '#dcdfe8',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.85,
      },
    });
  }
  if (!map.getSource('lb-route')) {
    map.addSource('lb-route', { type: 'geojson', data: routeData(route), lineMetrics: true });
    map.addLayer({
      id: 'lb-route-casing',
      type: 'line',
      source: 'lb-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': theme === 'dark' ? '#0b0f19' : '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 7, 18, 16],
        'line-opacity': 0.9,
      },
    });
    map.addLayer({
      id: 'lb-route-line',
      type: 'line',
      source: 'lb-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 18, 10],
        'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#22d3ee', 1, '#a78bfa'],
      },
    });
  }
  try {
    map.setSky(
      theme === 'dark'
        ? { 'sky-color': '#0b1022', 'horizon-color': '#3b1d5c', 'fog-color': '#0b0f19', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35 }
        : { 'sky-color': '#bfe6ff', 'horizon-color': '#f5e9ff', 'fog-color': '#f3f6fb', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35 },
    );
  } catch {
    /* estilo sin soporte de cielo */
  }
}

/** Mapa de navegación: ruta, tu posición (con dirección) y el destino con la foto de quien comparte. */
export default function RouteMap({ route, user, destination, person = null, live = false, className = '', onFail }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const latestRef = useRef({ route, user, destination });
  const onFailRef = useRef(onFail);
  const followRef = useRef(true);
  const fittedRouteRef = useRef<Route | null>(null);
  const [follow, setFollow] = useState(true);
  const [destEl] = useState(() => {
    const el = document.createElement('div');
    el.className = 'lb-loc-scene-marker';
    return el;
  });
  const [userEl] = useState(() => {
    const el = document.createElement('div');
    el.className = 'lb-nav-user';
    el.innerHTML = '<span class="lb-nav-user__halo"></span><span class="lb-nav-user__arrow"></span><span class="lb-nav-user__dot"></span>';
    return el;
  });
  latestRef.current = { route, user, destination };
  onFailRef.current = onFail;

  function setFollowing(next: boolean) {
    followRef.current = next;
    setFollow(next);
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const start = latestRef.current;
    let theme = currentTheme();
    let loaded = false;
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: host,
        style: STYLES[theme],
        center: [start.destination.lng, start.destination.lat],
        zoom: 15,
        pitch: 50,
        maxPitch: 75,
        attributionControl: { compact: true },
        fadeDuration: 150,
      });
    } catch {
      onFailRef.current();
      return;
    }
    mapRef.current = map;
    destMarkerRef.current = new maplibregl.Marker({ element: destEl, anchor: 'bottom', pitchAlignment: 'viewport', rotationAlignment: 'viewport' })
      .setLngLat([start.destination.lng, start.destination.lat])
      .addTo(map);
    userMarkerRef.current = new maplibregl.Marker({ element: userEl, anchor: 'center', pitchAlignment: 'map', rotationAlignment: 'map' });

    map.on('style.load', () => decorate(map, theme, latestRef.current.route));
    map.once('load', () => {
      loaded = true;
    });
    map.on('error', () => {
      if (!loaded) onFailRef.current();
    });
    const stopFollow = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) setFollowing(false);
    };
    map.on('dragstart', stopFollow);
    map.on('rotatestart', stopFollow);
    map.on('pitchstart', stopFollow);

    const observer = new MutationObserver(() => {
      const next = currentTheme();
      if (next === theme) return;
      theme = next;
      map.setStyle(STYLES[theme]);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lb-theme'] });
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(host);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      destMarkerRef.current?.remove();
      userMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [destEl, userEl]);

  useEffect(() => {
    destMarkerRef.current?.setLngLat([destination.lng, destination.lat]);
  }, [destination.lat, destination.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (map.getSource('lb-route') as GeoJSONSource | undefined)?.setData(routeData(route));
    const cur = latestRef.current.user;
    if (route && !fittedRouteRef.current && !followRef.current) {
      map.fitBounds(routeBounds(route, cur ? [[cur.lng, cur.lat]] : []), { padding: 60, duration: 900, maxZoom: 17 });
    }
    if (route) fittedRouteRef.current = route;
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = userMarkerRef.current;
    if (!map || !marker) return;
    if (!user) {
      marker.remove();
      return;
    }
    marker.setLngLat([user.lng, user.lat]);
    if (!marker.getElement().isConnected) marker.addTo(map);
    const hasHeading = typeof user.heading === 'number' && Number.isFinite(user.heading);
    userEl.classList.toggle('has-heading', hasHeading);
    if (hasHeading) marker.setRotation(user.heading as number);
    if (followRef.current) {
      const height = map.getContainer().clientHeight;
      map.easeTo({
        center: [user.lng, user.lat],
        zoom: Math.max(map.getZoom(), 16.5),
        pitch: 58,
        bearing: hasHeading ? (user.heading as number) : map.getBearing(),
        padding: { top: Math.round(height * 0.32), bottom: 0, left: 0, right: 0 },
        duration: 900,
      });
    }
  }, [user, userEl]);

  function recenter() {
    setFollowing(true);
    const map = mapRef.current;
    const cur = latestRef.current.user;
    if (map && cur) {
      map.easeTo({ center: [cur.lng, cur.lat], zoom: 17, pitch: 58, duration: 900 });
    }
  }

  function overview() {
    const map = mapRef.current;
    const cur = latestRef.current;
    if (!map) return;
    setFollowing(false);
    map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, pitch: 30, bearing: 0, duration: 0 });
    if (cur.route) {
      map.fitBounds(routeBounds(cur.route, cur.user ? [[cur.user.lng, cur.user.lat]] : []), { padding: 60, duration: 900, maxZoom: 17 });
    } else {
      map.flyTo({ center: [cur.destination.lng, cur.destination.lat], zoom: 15, duration: 900 });
    }
  }

  return (
    <div className={`lb-loc-scene relative isolate overflow-hidden ${className}`}>
      <div ref={hostRef} className="h-full w-full" aria-label="Mapa de la ruta" role="img" />
      <div className="lb-nav-map-actions">
        <button type="button" onClick={overview} className="lb-nav-map-actions__btn" aria-label="Ver toda la ruta">
          <RouteIcon size={18} />
        </button>
        {!follow ? (
          <button type="button" onClick={recenter} className="lb-nav-map-actions__btn" aria-label="Seguir mi ubicación">
            <LocateFixed size={18} />
          </button>
        ) : null}
      </div>
      {createPortal(<LocationPin person={person} live={live} size={48} />, destEl)}
    </div>
  );
}
