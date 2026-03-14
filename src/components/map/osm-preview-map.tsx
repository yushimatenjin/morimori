import { useEffect, useRef } from "react";
import L from "leaflet";
import { GeoUtils } from "@/lib/geo-utils";

type MapCenter = {
  lat: number;
  lng: number;
};

type OSMPreviewMapProps = {
  center: MapCenter;
  widthKm: number;
  heightKm: number;
  onPickCenter: (center: MapCenter) => void;
};

export function OSMPreviewMap({ center, widthKm, heightKm, onPickCenter }: OSMPreviewMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const boundsRef = useRef<L.Rectangle | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true
    }).setView([center.lat, center.lng], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    const marker = L.circleMarker([center.lat, center.lng], {
      radius: 8,
      color: "#f97316",
      weight: 2,
      fillColor: "#fb923c",
      fillOpacity: 0.65
    }).addTo(map);

    const areaBounds = GeoUtils.calculateBounds(center.lat, center.lng, widthKm, heightKm);
    const rect = L.rectangle(
      [
        [areaBounds.south, areaBounds.west],
        [areaBounds.north, areaBounds.east]
      ],
      {
        color: "#22d3ee",
        weight: 2,
        fillColor: "#22d3ee",
        fillOpacity: 0.14
      }
    ).addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      onPickCenter({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    mapRef.current = map;
    markerRef.current = marker;
    boundsRef.current = rect;
  }, [center.lat, center.lng, heightKm, onPickCenter, widthKm]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !boundsRef.current) return;

    markerRef.current.setLatLng([center.lat, center.lng]);

    const areaBounds = GeoUtils.calculateBounds(center.lat, center.lng, widthKm, heightKm);
    boundsRef.current.setBounds([
      [areaBounds.south, areaBounds.west],
      [areaBounds.north, areaBounds.east]
    ]);

    mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom(), { animate: false });
  }, [center.lat, center.lng, heightKm, widthKm]);

  return <div className="h-60 w-full rounded-md border border-slate-700" ref={containerRef} />;
}
