import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Share2 } from 'lucide-react';

type Coords = { lat: number; lng: number; accuracy?: number };

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function validCoords(c: { lat: number; lng: number } | null | undefined): c is Coords {
  return Boolean(c && Number.isFinite(c.lat) && Number.isFinite(c.lng) && (c.lat !== 0 || c.lng !== 0));
}

/**
 * Mapa de "Tu zona": muestra la última ubicación guardada y, con permiso del navegador,
 * sigue la posición en tiempo real solo en este dispositivo (no se guarda cada movimiento).
 */
export default function ZoneLiveMap({
  saved,
  onShare,
}: {
  saved: { lat: number; lng: number } | null;
  onShare?: (pos: Coords) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const followRef = useRef(true);
  const [live, setLive] = useState<Coords | null>(null);
  const [watching, setWatching] = useState(false);
  const [error, setError] = useState('');

  const pos: Coords | null = live ?? (validCoords(saved) ? saved : null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const hasPos = Boolean(pos);

  useEffect(() => {
    const host = hostRef.current;
    const start = posRef.current;
    if (!host || !start || mapRef.current) return;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const map = L.map(host, {
      center: [start.lat, start.lng],
      zoom: 12,
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: finePointer,
      keyboard: false,
    });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(map);
    accuracyRef.current = L.circle([start.lat, start.lng], {
      radius: 0,
      stroke: false,
      fillColor: '#22d3ee',
      fillOpacity: 0.14,
      interactive: false,
    }).addTo(map);
    markerRef.current = L.marker([start.lat, start.lng], {
      icon: L.divIcon({
        className: 'lb-zone-map-pin',
        html: '<span class="lb-zone-map-pin__pulse"></span><span class="lb-zone-map-pin__dot"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      interactive: false,
      keyboard: false,
    }).addTo(map);
    map.on('dragstart', () => {
      followRef.current = false;
    });
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
  }, [hasPos]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pos) return;
    const latLng = L.latLng(pos.lat, pos.lng);
    markerRef.current?.setLatLng(latLng);
    accuracyRef.current?.setLatLng(latLng).setRadius(Math.min(pos.accuracy ?? 0, 2000));
    if (followRef.current) map.panTo(latLng, { animate: true });
  }, [pos?.lat, pos?.lng, pos?.accuracy]);

  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === 'granted') setWatching(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!watching || !navigator.geolocation) return;
    let id: number | null = null;
    const start = () => {
      if (id !== null) return;
      id = navigator.geolocation.watchPosition(
        (p) => {
          setError('');
          setLive({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setError('Permiso de ubicación denegado en el navegador.');
            setWatching(false);
          } else {
            setError('No se pudo actualizar la ubicación.');
          }
        },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
      );
    };
    const stop = () => {
      if (id !== null) navigator.geolocation.clearWatch(id);
      id = null;
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [watching]);

  function startLive() {
    if (!navigator.geolocation) {
      setError('Tu dispositivo no soporta ubicación.');
      return;
    }
    followRef.current = true;
    setWatching(true);
  }

  function recenter() {
    followRef.current = true;
    if (pos) mapRef.current?.setView([pos.lat, pos.lng], Math.max(mapRef.current.getZoom(), 15));
    if (!watching) startLive();
  }

  if (!pos) return null;

  return (
    <div className="mt-2">
      <div className="lb-zone-map relative isolate overflow-hidden rounded-xl border border-[#22d3ee]/25">
        <div ref={hostRef} className="h-[clamp(9rem,22vh,11rem)] w-full" aria-label="Mapa de tu zona" role="img" />
        <span
          className={`pointer-events-none absolute left-2 top-2 z-[500] inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider shadow ${
            live ? 'bg-[#052e1a]/85 text-[#4ade80]' : 'bg-[#0b0f19]/80 text-[#cbd5e1]'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-[#4ade80]' : 'bg-[#94a3b8]'}`}
          />
          {live ? 'En vivo' : 'Última ubicación'}
        </span>
        <button
          type="button"
          onClick={recenter}
          aria-label="Centrar en mi ubicación"
          className="absolute bottom-6 right-2 z-[500] flex h-9 w-9 items-center justify-center rounded-full border border-[#22d3ee]/40 bg-[#0b0f19]/85 text-[#67e8f9] shadow transition hover:bg-[#0b0f19]"
        >
          <LocateFixed size={16} />
        </button>
      </div>
      <div className={`mt-2 grid gap-2 ${!watching && onShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {!watching ? (
          <button
            type="button"
            onClick={startLive}
            className="min-h-9 w-full rounded-lg border border-cyan-400/30 text-[11px] font-semibold text-cyan-300"
          >
            Ver en tiempo real
          </button>
        ) : null}
        {onShare ? (
          <button
            type="button"
            onClick={() => onShare(pos)}
            className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#22d3ee] to-[#a78bfa] text-[11px] font-bold text-[#0b0f19]"
          >
            <Share2 size={13} style={{ color: '#0b0f19' }} />
            Compartir
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-[10px] text-rose-400">{error}</p> : null}
    </div>
  );
}
