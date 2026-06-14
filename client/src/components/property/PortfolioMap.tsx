/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from "react";
import { ensureGoogleMaps, useGoogleMapsKey, MapView } from "@/components/Map";

type Property = Record<string, any>;

interface PortfolioMapProps {
  properties: Property[];
  selectedId?: number | null;
  className?: string;
  /** Select a property when its marker is clicked. */
  onSelect: (id: number) => void;
  /** Persist coordinates we resolved by geocoding a property's address. */
  onGeocoded?: (id: number, latitude: string, longitude: string) => void;
}

const parseLatLng = (p: Property): google.maps.LatLngLiteral | null => {
  const lat = parseFloat(p.latitude);
  const lng = parseFloat(p.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

/**
 * Map of every property in the portfolio. Properties with stored coordinates
 * are pinned immediately; those with an address but no coordinates are geocoded
 * on the fly (and the result is persisted via `onGeocoded`). Clicking a pin
 * selects that property. The selected pin is highlighted.
 */
export default function PortfolioMap({
  properties,
  selectedId,
  className,
  onSelect,
  onGeocoded,
}: PortfolioMapProps) {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const { apiKey } = useGoogleMapsKey();
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const markersRef = useRef<
    Map<number, google.maps.marker.AdvancedMarkerElement>
  >(new Map());
  // Coordinates resolved this session (stored + geocoded), keyed by property id.
  const coordsRef = useRef<Map<number, google.maps.LatLngLiteral>>(new Map());
  // Property ids we've already tried to geocode, to avoid repeat lookups.
  const geocodedRef = useRef<Set<number>>(new Set());

  // Geocode any property that has an address but no coordinates yet.
  useEffect(() => {
    if (!map) return;
    let cancelled = false;

    ensureGoogleMaps(apiKey).then(google => {
      if (cancelled || !google) return;
      if (!geocoderRef.current)
        geocoderRef.current = new google.maps.Geocoder();

      properties.forEach(p => {
        const id = p.id as number;
        const stored = parseLatLng(p);
        if (stored) {
          coordsRef.current.set(id, stored);
          return;
        }
        if (!p.address || geocodedRef.current.has(id)) return;
        geocodedRef.current.add(id);
        geocoderRef.current!.geocode(
          { address: p.address as string },
          (results, status) => {
            if (cancelled) return;
            if (status === "OK" && results?.[0]) {
              const loc = results[0].geometry.location;
              const coords = { lat: loc.lat(), lng: loc.lng() };
              coordsRef.current.set(id, coords);
              renderMarkers();
              onGeocoded?.(id, coords.lat.toString(), coords.lng.toString());
            }
          }
        );
      });
      renderMarkers();
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, properties]);

  // Re-style markers when the selection changes (no re-geocode needed).
  useEffect(() => {
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function renderMarkers() {
    const google = window.google;
    if (!map || !google?.maps?.marker) return;

    const live = new Set<number>();
    const bounds = new google.maps.LatLngBounds();

    for (const p of properties) {
      const id = p.id as number;
      const coords = coordsRef.current.get(id);
      if (!coords) continue;
      live.add(id);
      bounds.extend(coords);

      // Brand palette: forest green for properties, gold accent for the
      // selected one so it stands out while staying on-theme.
      const selected = id === selectedId;
      const pin = new google.maps.marker.PinElement({
        background: selected ? "#d6a85d" : "#2f6f55",
        borderColor: selected ? "#b9863c" : "#214e3d",
        glyphColor: "#ffffff",
        scale: selected ? 1.3 : 1,
      });

      let marker = markersRef.current.get(id);
      if (!marker) {
        marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: coords,
          title: p.houseNickname || p.houseName || "",
          content: pin.element,
        });
        marker.addListener("click", () => onSelect(id));
        markersRef.current.set(id, marker);
      } else {
        marker.position = coords;
        marker.content = pin.element;
        if (!marker.map) marker.map = map;
      }
    }

    // Drop markers for properties that no longer have coordinates.
    markersRef.current.forEach((marker, id) => {
      if (!live.has(id)) {
        marker.map = null;
        markersRef.current.delete(id);
      }
    });

    if (live.size === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(15);
    } else if (live.size > 1) {
      map.fitBounds(bounds, 64);
    }
  }

  return <MapView className={className} initialZoom={11} onMapReady={setMap} />;
}
