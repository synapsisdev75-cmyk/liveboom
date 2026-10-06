import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationPin, type MapPerson } from './LocationPin';
import type { SceneCompanion } from './LocationScene';

const LocationScene = lazy(() => import('./LocationScene'));

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

type Props = {
  lat: number;
  lng: number;
  zoom?: number;
  interactive?: boolean;
  accuracy?: number;
  className?: string;
  person?: MapPerson | null;
  live?: boolean;
  /** card: mapa liviano inclinado (listas, chat). scene: mapa 3D con edificios (vista completa, vista previa). */
  variant?: 'card' | 'scene';
  /** Solo en el mapa 3D: tu posición unida a la principal. */
  companion?: SceneCompanion | null;
};

function canUseWebgl() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

let webglOk: boolean | null = null;

/** Mapa con el marcador de quien comparte. 3D cuando el dispositivo lo permite; si no, mapa clásico. */
export default function LocationMap(props: Props) {
  const { variant = 'card', className = '' } = props;
  const [sceneFailed, setSceneFailed] = useState(false);
  if (webglOk === null && typeof document !== 'undefined') webglOk = canUseWebgl();

  if (variant === 'scene' && webglOk && !sceneFailed) {
    return (
      <Suspense fallback={<div className={`animate-pulse bg-[color:var(--surface-primary)] ${className}`} />}>
        <LocationScene {...props} onFail={() => setSceneFailed(true)} />
      </Suspense>
    );
  }
  return <FlatLocationMap {...props} tilted={variant === 'card' && !props.interactive} />;
}

function FlatLocationMap({
  lat,
  lng,
  zoom = 15,
  interactive = false,
  accuracy,
  className = '',
  person = null,
  live = false,
  tilted,
}: Props & { tilted: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const startRef = useRef({ lat, lng, zoom });
  const [markerEl] = useState(() => (typeof document !== 'undefined' ? document.createElement('div') : null));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const start = startRef.current;
    const map = L.map(host, {
      center: [start.lat, start.lng],
      zoom: start.zoom,
      zoomControl: false,
      attributionControl: true,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: interactive,
      boxZoom: false,
      keyboard: interactive,
    });
    map.attributionControl.setPrefix(false);
    if (interactive) L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    accuracyRef.current = L.circle([start.lat, start.lng], {
      radius: 0,
      stroke: false,
      fillColor: '#22d3ee',
      fillOpacity: 0.14,
      interactive: false,
    }).addTo(map);
    if (!tilted && markerEl) {
      markerRef.current = L.marker([start.lat, start.lng], {
        icon: L.divIcon({ className: 'lb-loc-leaflet-marker', html: markerEl, iconSize: [0, 0], iconAnchor: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(map);
    }
    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(host);
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      accuracyRef.current = null;
    };
  }, [interactive, tilted, markerEl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const latLng = L.latLng(lat, lng);
    markerRef.current?.setLatLng(latLng);
    accuracyRef.current?.setLatLng(latLng).setRadius(Math.min(accuracy ?? 0, 2000));
    map.setView(latLng, map.getZoom(), { animate: false });
  }, [lat, lng, accuracy]);

  const pin = <LocationPin person={person} live={live} size={tilted ? 40 : 46} />;

  return (
    <div className={`lb-zone-map relative isolate overflow-hidden ${tilted ? 'lb-loc-card-map' : ''} ${className}`}>
      <div className={tilted ? 'lb-loc-card-map__tilt' : 'h-full w-full'}>
        <div ref={hostRef} className="h-full w-full" aria-label="Mapa de la ubicación" role="img" />
      </div>
      {tilted ? (
        <>
          <div className="lb-loc-card-map__pin">{pin}</div>
          <span className="lb-loc-card-map__attr">© OpenStreetMap</span>
        </>
      ) : markerEl ? (
        createPortal(pin, markerEl)
      ) : null}
    </div>
  );
}
