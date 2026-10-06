import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LocateFixed, Navigation } from 'lucide-react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocationPin, type MapPerson } from './LocationPin';

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

type Theme = keyof typeof STYLES;

type Props = {
  lat: number;
  lng: number;
  zoom?: number;
  interactive?: boolean;
  accuracy?: number;
  className?: string;
  person?: MapPerson | null;
  live?: boolean;
  onFail: () => void;
};

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-lb-theme') === 'light' ? 'light' : 'dark';
}

function accuracyFeature(lat: number, lng: number, radiusM: number) {
  const steps = 48;
  const r = Math.max(0, Math.min(radiusM, 2000));
  const coords: [number, number][] = [];
  const dLat = r / 111_320;
  const dLng = r / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [coords] },
  };
}

function decorate(map: MapLibreMap, theme: Theme, lat: number, lng: number, accuracy: number) {
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
        'fill-extrusion-opacity': 0.9,
      },
    });
  }
  if (!map.getSource('lb-accuracy')) {
    map.addSource('lb-accuracy', { type: 'geojson', data: accuracyFeature(lat, lng, accuracy) });
    map.addLayer({
      id: 'lb-accuracy-fill',
      type: 'fill',
      source: 'lb-accuracy',
      paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.14 },
    });
    map.addLayer({
      id: 'lb-accuracy-line',
      type: 'line',
      source: 'lb-accuracy',
      paint: { 'line-color': '#22d3ee', 'line-opacity': 0.55, 'line-width': 1.5 },
    });
  }
  try {
    map.setSky(
      theme === 'dark'
        ? {
            'sky-color': '#0b1022',
            'horizon-color': '#3b1d5c',
            'fog-color': '#0b0f19',
            'sky-horizon-blend': 0.6,
            'horizon-fog-blend': 0.7,
            'fog-ground-blend': 0.35,
          }
        : {
            'sky-color': '#bfe6ff',
            'horizon-color': '#f5e9ff',
            'fog-color': '#f3f6fb',
            'sky-horizon-blend': 0.6,
            'horizon-fog-blend': 0.7,
            'fog-ground-blend': 0.35,
          },
    );
  } catch {
    /* estilo sin soporte de cielo */
  }
}

/** Mapa 3D (edificios en relieve, inclinación y cielo) con el marcador de quien comparte. */
export default function LocationScene({
  lat,
  lng,
  zoom = 16,
  interactive = false,
  accuracy = 0,
  className = '',
  person = null,
  live = false,
  onFail,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const latestRef = useRef({ lat, lng, accuracy, zoom });
  const onFailRef = useRef(onFail);
  const [markerEl] = useState(() => {
    const el = document.createElement('div');
    el.className = 'lb-loc-scene-marker';
    return el;
  });
  latestRef.current = { lat, lng, accuracy, zoom };
  onFailRef.current = onFail;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const start = latestRef.current;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let theme = currentTheme();
    let loaded = false;
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: host,
        style: STYLES[theme],
        center: [start.lng, start.lat],
        zoom: reduceMotion ? start.zoom : start.zoom - 1.2,
        pitch: reduceMotion ? 55 : 10,
        bearing: reduceMotion ? -18 : 0,
        maxPitch: 75,
        interactive,
        attributionControl: { compact: true },
        fadeDuration: 150,
      });
    } catch {
      onFailRef.current();
      return;
    }
    mapRef.current = map;
    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'top-right');
    }
    markerRef.current = new maplibregl.Marker({
      element: markerEl,
      anchor: 'bottom',
      pitchAlignment: 'viewport',
      rotationAlignment: 'viewport',
    })
      .setLngLat([start.lng, start.lat])
      .addTo(map);

    map.on('style.load', () => {
      const cur = latestRef.current;
      decorate(map, theme, cur.lat, cur.lng, cur.accuracy);
    });
    map.once('load', () => {
      loaded = true;
      const attrib = host.querySelector('details.maplibregl-ctrl-attrib');
      attrib?.classList.remove('maplibregl-compact-show');
      attrib?.removeAttribute('open');
      if (!reduceMotion) {
        map.easeTo({ pitch: 55, bearing: -18, zoom: latestRef.current.zoom, duration: 1800 });
      }
    });
    map.on('error', () => {
      if (!loaded) onFailRef.current();
    });

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
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [interactive, markerEl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.setLngLat([lng, lat]);
    const source = map.getSource('lb-accuracy') as GeoJSONSource | undefined;
    source?.setData(accuracyFeature(lat, lng, accuracy));
    if (map.loaded()) map.easeTo({ center: [lng, lat], duration: 900 });
    else map.jumpTo({ center: [lng, lat] });
  }, [lat, lng, accuracy]);

  function recenter() {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: Math.max(zoom, 15), pitch: 55, bearing: -18, duration: 1200 });
  }

  return (
    <div className={`lb-loc-scene relative isolate overflow-hidden ${className}`}>
      <div ref={hostRef} className="h-full w-full" aria-label="Mapa 3D de la ubicación" role="img" />
      <span className="lb-loc-scene__brand" aria-hidden>
        <Navigation size={12} />
        Llega con LiveBoom
      </span>
      {interactive ? (
        <button type="button" onClick={recenter} className="lb-loc-scene__recenter" aria-label="Centrar en la ubicación">
          <LocateFixed size={18} />
        </button>
      ) : null}
      {createPortal(<LocationPin person={person} live={live} size={interactive ? 52 : 46} />, markerEl)}
    </div>
  );
}
