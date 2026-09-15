import React from "react";
import {
  useEffect,
  useRef,
  useState
} from "react";

import { Loading } from "./Feedback";

let googleMapsPromise = null;
let mapsAuthenticationFailed = false;

function loadGoogleMaps(apiKey) {
  if (mapsAuthenticationFailed) {
    return Promise.reject(new Error("Google Maps authentication failed."));
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const callbackName = "__mandiLiveGoogleMapsReady";
    const script = document.createElement("script");
    let settled = false;

    function rejectLoad() {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timer);
      window[callbackName] = () => {};
      reject(new Error("Google Maps could not load."));
    }

    const timer = window.setTimeout(rejectLoad, 15000);

    window.gm_authFailure = () => {
      mapsAuthenticationFailed = true;
      window.dispatchEvent(new Event("mandi-live-maps-unavailable"));
      rejectLoad();
    };

    window[callbackName] = () => {
      if (settled) {
        return;
      }

      if (!window.google?.maps?.Map || mapsAuthenticationFailed) {
        rejectLoad();
        return;
      }

      settled = true;
      window.clearTimeout(timer);
      resolve(window.google.maps);
    };

    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(apiKey)}` +
      `&callback=${callbackName}&v=weekly&loading=async`;

    script.async = true;
    script.defer = true;
    script.onerror = rejectLoad;
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export default function CentreMap({ centres = [], origin = null }) {
  const elementRef = useRef(null);
  const [state, setState] = useState("loading");

  const locationsKey = JSON.stringify(
    centres.map((centre) => ({
      _id: centre._id,
      name: centre.name,
      address: centre.address,
      coordinates: centre.location?.coordinates
    }))
  );

  const originKey = JSON.stringify(origin);

  useEffect(() => {
    let alive = true;
    let map = null;
    let infoWindow = null;
    const markers = [];

    function showFallback() {
      if (alive) {
        setState("fallback");
      }
    }

    window.addEventListener(
      "mandi-live-maps-unavailable",
      showFallback
    );

    async function renderMap() {
      const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
      const locations = JSON.parse(locationsKey);
      const positionOrigin = JSON.parse(originKey);

      if (!key || mapsAuthenticationFailed) {
        showFallback();
        return;
      }

      const validLocations = locations.filter(
        (item) =>
          item.coordinates?.length === 2 &&
          item.coordinates.every(Number.isFinite)
      );

      if (!validLocations.length && !positionOrigin) {
        showFallback();
        return;
      }

      setState("loading");

      try {
        const maps = await loadGoogleMaps(key);

        if (!alive || !elementRef.current) {
          return;
        }

        const first = validLocations[0]?.coordinates;

        const initialPosition = positionOrigin
          ? {
              lat: positionOrigin.latitude,
              lng: positionOrigin.longitude
            }
          : {
              lat: first[1],
              lng: first[0]
            };

        map = new maps.Map(elementRef.current, {
          center: initialPosition,
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true
        });

        infoWindow = new maps.InfoWindow();
        const bounds = new maps.LatLngBounds();

        for (const centre of validLocations) {
          const [longitude, latitude] = centre.coordinates;
          const position = { lat: latitude, lng: longitude };

          /*
           * Classic markers do not require a separate Google Map ID.
           * No Places or Geocoding API is used.
           */
          const marker = new maps.Marker({
            map,
            position,
            title: centre.name
          });

          marker.addListener("click", () => {
            const content = document.createElement("div");
            const title = document.createElement("strong");
            const details = document.createElement("p");

            // Database text is inserted with textContent, never raw HTML.
            title.textContent = centre.name;
            details.textContent =
              `${centre.address} · Latitude ${latitude}, Longitude ${longitude}`;

            content.append(title, details);
            infoWindow.setContent(content);
            infoWindow.open({ map, anchor: marker });
          });

          markers.push(marker);
          bounds.extend(position);
        }

        if (positionOrigin) {
          const position = {
            lat: positionOrigin.latitude,
            lng: positionOrigin.longitude
          };

          markers.push(new maps.Marker({
            map,
            position,
            title: "Your approximate location",
            label: "You",
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: "#2563eb",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2
            }
          }));

          bounds.extend(position);
        }

        if (markers.length > 1) {
          map.fitBounds(bounds, 40);
        }

        if (alive) {
          setState("ready");
        }
      } catch {
        showFallback();
      }
    }

    renderMap();

    return () => {
      alive = false;

      window.removeEventListener(
        "mandi-live-maps-unavailable",
        showFallback
      );

      for (const marker of markers) {
        window.google?.maps?.event?.clearInstanceListeners(marker);
        marker.setMap(null);
      }

      infoWindow?.close();

      if (map) {
        window.google?.maps?.event?.clearInstanceListeners(map);
      }
    };
  }, [locationsKey, originKey]);

  return (
    <section className="map-panel" aria-label="Procurement centre locations">
      {state === "loading" && (
        <Loading message="Loading location view…" />
      )}

      <div
        ref={elementRef}
        className={`google-map ${state === "ready" ? "" : "map-hidden"}`}
        aria-hidden={state !== "ready"}
      />

      {state === "fallback" && (
        <div className="map-fallback">
          <span className="eyebrow">Coordinate list mode</span>
          <h3>Centre locations remain available</h3>
          <p>
            The interactive map is unavailable or not configured. Centre search,
            nearby discovery, selection and booking still work.
          </p>

          {origin && (
            <p>
              Your approximate location:{" "}
              <strong>
                {origin.latitude.toFixed(5)}, {origin.longitude.toFixed(5)}
              </strong>
            </p>
          )}

          <ul className="coordinate-list">
            {centres.map((centre) => (
              <li key={centre._id}>
                <strong>{centre.name}</strong>
                <span>
                  {centre.location?.coordinates
                    ? `Latitude ${centre.location.coordinates[1]}, Longitude ${centre.location.coordinates[0]}`
                    : "Coordinates unavailable"}
                </span>
              </li>
            ))}
          </ul>

          {!centres.length && <p>No centre locations match this view.</p>}
        </div>
      )}
    </section>
  );
}