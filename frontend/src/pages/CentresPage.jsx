import React from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../services/api";
import CentreMap from "../components/CentreMap";
import {
  Alert,
  EmptyState,
  Loading,
  Pagination,
  useResource
} from "../components/Feedback";
import { todayIST } from "../utils/format";

const LIMIT = 12;

export default function CentresPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(todayIST());
  const [page, setPage] = useState(1);
  const [origin, setOrigin] = useState(null);
  const [radiusKm, setRadiusKm] = useState(100);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const resource = useResource(async () => {
    if (origin) {
      const result = await api.centres.nearby({
        latitude: origin.latitude,
        longitude: origin.longitude,
        radiusKm,
        limit: 100,
        date
      });

      return {
        ...result.data,
        total: result.data.items.length
      };
    }

    const result = await api.centres.list({
      page,
      limit: LIMIT,
      date,
      search: search || undefined
    });

    return result.data;
  }, [search, date, page, origin?.latitude, origin?.longitude, radiusKm], 15000);

  function submitSearch(event) {
    event.preventDefault();
    setOrigin(null);
    setSearch(searchInput.trim());
    setPage(1);
    setLocationError("");
  }

  function locate() {
    setLocationError("");

    if (!navigator.geolocation) {
      setLocationError("Location is unavailable in this browser. Use centre search instead.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mounted.current) {
          return;
        }

        setOrigin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setSearch("");
        setSearchInput("");
        setPage(1);
        setLocating(false);
      },
      () => {
        if (!mounted.current) {
          return;
        }

        setLocationError(
          "Location access was denied or unavailable. You can still search by centre name or district."
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 60000
      }
    );
  }

  const items = resource.data?.items || [];

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Centre discovery</span>
          <h1>Find a procurement centre</h1>
          <p>Search the directory or use your location to find nearby centres.</p>
        </div>
      </section>

      <section className="card">
        <form className="filter-bar" onSubmit={submitSearch}>
          <label className="grow">
            Centre name, district or address
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Try Nagpur"
              maxLength={100}
            />
          </label>

          <label>
            Availability date
            <input
              type="date"
              min={todayIST()}
              value={date}
              onChange={(event) => {
                if (event.target.value) {
                  setDate(event.target.value);
                  setPage(1);
                }
              }}
              required
            />
          </label>

          <button className="button" type="submit">Search centres</button>
        </form>

        <div className="actions">
          <button
            className="button secondary"
            onClick={locate}
            disabled={locating}
          >
            {locating ? "Getting location…" : "Find nearby using my location"}
          </button>

          {origin && (
            <>
              <label className="inline-label">
                Search radius
                <select
                  value={radiusKm}
                  onChange={(event) => setRadiusKm(Number(event.target.value))}
                >
                  <option value={25}>25 km</option>
                  <option value={100}>100 km</option>
                  <option value={250}>250 km</option>
                  <option value={500}>500 km</option>
                </select>
              </label>

              <button
                className="button secondary"
                onClick={() => {
                  setOrigin(null);
                  setPage(1);
                }}
              >
                Full directory
              </button>
            </>
          )}
        </div>

        <p className="muted small">
          Your approximate location is sent to the API only to calculate nearby
          results; it is not saved to your profile. Distances are straight-line
          estimates, not driving distances.
        </p>
      </section>

      <Alert>{locationError || resource.error}</Alert>

      {resource.loading && <Loading message="Loading centres and slot availability…" />}

      {resource.data && (
        <>
          <CentreMap centres={items} origin={origin} />

          <div className="section-heading">
            <h2>{origin ? "Nearby centres" : "Procurement centres"}</h2>
            <span className="muted">
              {resource.data.total} results
              {origin ? " · nearest 100 maximum" : ""}
            </span>
          </div>

          {items.length ? (
            <div className="centre-grid">
              {items.map((centre) => (
                <article className="card centre-card" key={centre._id}>
                  <span className="eyebrow">
                    {centre.district}{centre.isDemo ? " · DEMO" : ""}
                  </span>
                  <h3>{centre.name}</h3>
                  <p>{centre.address}</p>
                  <p className="muted">{centre.workingHours}</p>

                  {centre.distanceKm !== undefined && (
                    <p><strong>{centre.distanceKm.toFixed(1)} km away</strong></p>
                  )}

                  <div className="crop-tags">
                    {centre.crops.map((crop) => <span key={crop}>{crop}</span>)}
                  </div>

                  <p>
                    <strong>{centre.availableCapacity}</strong> places across{" "}
                    <strong>{centre.availableSlots}</strong> available slots
                  </p>

                  <p className="muted small">
                    Latitude {centre.location.coordinates[1]}, longitude{" "}
                    {centre.location.coordinates[0]}
                  </p>

                  <Link
                    className="button"
                    to={`/centres/${centre._id}?date=${date}`}
                  >
                    View centre & slots
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No centres found">
              <p>
                Try another search or a larger radius. Seeded demonstration
                centres are around Nagpur, Maharashtra.
              </p>
            </EmptyState>
          )}

          {!origin && (
            <Pagination
              page={page}
              total={resource.data.total}
              limit={LIMIT}
              onChange={setPage}
            />
          )}
        </>
      )}
    </>
  );
}