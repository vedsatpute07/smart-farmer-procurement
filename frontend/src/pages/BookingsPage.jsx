import React from "react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../services/api";
import BookingCard from "../components/BookingCard";
import {
  Alert,
  EmptyState,
  Loading,
  Pagination,
  useResource
} from "../components/Feedback";
import {
  formatDateTime,
  idOf
} from "../utils/format";

const LIMIT = 10;

export default function BookingsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);
  const [crop, setCrop] = useState("");
  const [quantityKg, setQuantityKg] = useState("");
  const [acceptedCrops, setAcceptedCrops] = useState([]);

  const resource = useResource(async () => {
    const result = await api.bookings.list({
      page,
      limit: LIMIT,
      status: status || undefined
    });

    return result.data;
  }, [page, status], 10000);

  async function cancel(id) {
    if (!window.confirm("Cancel this booking and release its reserved place?")) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await api.bookings.cancel(id);
      setMessage(result.message);

      if (editing === id) {
        setEditing(null);
      }

      resource.refresh();
    } catch (failure) {
      setError(failure.message);
      resource.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function openEdit(bundle) {
    setBusy(true);
    setError("");

    try {
      const result = await api.centres.get(idOf(bundle.booking.centre));
      setAcceptedCrops(result.data.crops);
      setCrop(bundle.booking.crop);
      setQuantityKg(String(bundle.booking.quantityKg));
      setEditing(bundle.booking._id);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await api.bookings.update(editing, {
        crop,
        quantityKg: Number(quantityKg)
      });

      setMessage(result.message);
      setEditing(null);
      resource.refresh();
    } catch (failure) {
      setError(failure.message);
      resource.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Your procurement journey</span>
          <h1>My bookings & token</h1>
          <p>Track queue progress, verification, procurement and payment records.</p>
        </div>
        <Link className="button" to="/centres">Book another date</Link>
      </section>

      <div className="filter-bar">
        <label>
          Booking status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
              setEditing(null);
            }}
          >
            <option value="">All bookings</option>
            <option value="Booked">Booked</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </label>

        <button
          className="button secondary"
          onClick={resource.refresh}
          disabled={resource.loading}
        >
          Refresh records
        </button>

        <span className="muted small">
          Auto-refresh every 10 seconds.
          {resource.updatedAt && ` Updated ${formatDateTime(resource.updatedAt)}.`}
        </span>
      </div>

      <Alert>{error || resource.error}</Alert>
      <Alert type="success">{message}</Alert>

      <p className="info-note">
        Waiting position 1 is the first waiting farmer. The token at the counter
        is shown separately. “People ahead” includes the active counter token.
        Skipped and cancelled tokens are not counted.
      </p>

      {editing && (
        <section className="card">
          <h2>Edit waiting booking</h2>
          <form className="form-grid" onSubmit={saveEdit}>
            <label>
              Crop
              <select
                value={crop}
                onChange={(event) => setCrop(event.target.value)}
                required
              >
                {!acceptedCrops.includes(crop) && (
                  <option value={crop}>{crop} (no longer accepted)</option>
                )}
                {acceptedCrops.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              Expected quantity (kg)
              <input
                type="number"
                min="1"
                max="1000000"
                step="0.01"
                value={quantityKg}
                onChange={(event) => setQuantityKg(event.target.value)}
                required
              />
            </label>

            <div className="actions full-width">
              <button
                className="button"
                disabled={busy || !acceptedCrops.includes(crop)}
              >
                Save changes
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Close editor
              </button>
            </div>
          </form>
        </section>
      )}

      {resource.loading && <Loading message="Loading bookings…" />}

      {resource.data && (
        <>
          {resource.data.items.length ? (
            <div className="booking-list">
              {resource.data.items.map((bundle) => (
                <BookingCard
                  key={bundle.booking._id}
                  bundle={bundle}
                  onCancel={cancel}
                  onEdit={openEdit}
                  busy={busy}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No bookings in this view">
              <Link to="/centres">Find a centre and reserve a slot</Link>
            </EmptyState>
          )}

          <Pagination
            page={page}
            total={resource.data.total}
            limit={LIMIT}
            onChange={(nextPage) => {
              setPage(nextPage);
              setEditing(null);
            }}
          />
        </>
      )}

      <p className="muted">
        Payment statuses are centre-maintained monitoring records. They do not
        represent transfers performed by this application.
      </p>
    </>
  );
}