import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { sampleLocations } from "../lib/api";

// An actual map (Leaflet + OpenStreetMap) of where the dataset has dishes.
// We sample the collection server-side and plot the coverage as dots, so the
// preview is honest: you click a spot that actually has data. Uses circle
// markers only (no image assets), so nothing breaks when Vite bundles it.
function LocationMap({ location, onPick, theme }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const selectionRef = useRef(null); // { marker, circle }
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Init the map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      worldCopyJump: true,
      scrollWheelZoom: false, // don't hijack page scroll; users zoom with +/- or double-click
    }).setView([50, 12], 4);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    map.on("click", (e) => onPickRef.current?.(e.latlng.lat, e.latlng.lng));

    // Leaflet miscalculates size when its container animates/lays out late.
    setTimeout(() => map.invalidateSize(), 0);

    // Load and plot the coverage dots.
    sampleLocations()
      .then(({ points = [] }) => {
        if (!mapRef.current || !points.length) return;
        const layer = L.layerGroup();
        const latlngs = [];
        for (const p of points) {
          latlngs.push([p.lat, p.lon]);
          L.circleMarker([p.lat, p.lon], {
            radius: Math.min(3 + Math.log2(p.count + 1), 10),
            color: "#ec4899",
            weight: 0,
            fillColor: "#ec4899",
            fillOpacity: 0.55,
            interactive: false,
          }).addTo(layer);
        }
        layer.addTo(map);
        if (latlngs.length) {
          map.fitBounds(L.latLngBounds(latlngs).pad(0.15), { maxZoom: 6 });
        }
      })
      .catch((err) => console.error("coverage sample failed", err));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Reflect the selected location: a pin + its search radius.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!location) {
      if (selectionRef.current) {
        map.removeLayer(selectionRef.current.marker);
        map.removeLayer(selectionRef.current.circle);
        selectionRef.current = null;
      }
      return;
    }

    const latlng = [location.latitude, location.longitude];
    const meters = (location.radius_km || 25) * 1000;

    if (!selectionRef.current) {
      const marker = L.circleMarker(latlng, {
        radius: 7,
        color: "#2563eb",
        weight: 2,
        fillColor: "#2563eb",
        fillOpacity: 0.9,
      }).addTo(map);
      const circle = L.circle(latlng, {
        radius: meters,
        color: "#2563eb",
        weight: 1,
        fillColor: "#2563eb",
        fillOpacity: 0.08,
      }).addTo(map);
      selectionRef.current = { marker, circle };
    } else {
      selectionRef.current.marker.setLatLng(latlng);
      selectionRef.current.circle.setLatLng(latlng).setRadius(meters);
    }
    map.setView(latlng, Math.max(map.getZoom(), 8));
  }, [location]);

  return (
    <div
      className={`location-map ${theme}`}
      ref={containerRef}
      role="application"
      aria-label="Map of where dishes are available — click to search near a spot"
    />
  );
}

export default LocationMap;
