import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
};

/** Mapa con un punto. Estático en tarjetas (chat, publicaciones) e interactivo en la vista completa. */
export default function LocationMap({ lat, lng, zoom = 15, interactive = false, accuracy, className = '' }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const startRef = useRef({ lat, lng, zoom });

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
  }, [interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const latLng = L.latLng(lat, lng);
    markerRef.current?.setLatLng(latLng);
    accuracyRef.current?.setLatLng(latLng).setRadius(Math.min(accuracy ?? 0, 2000));
    map.setView(latLng, map.getZoom(), { animate: false });
  }, [lat, lng, accuracy]);

  return (
    <div className={`lb-zone-map relative isolate overflow-hidden ${className}`}>
      <div ref={hostRef} className="h-full w-full" aria-label="Mapa de la ubicación" role="img" />
    </div>
  );
}
