import React from "react";
import { useEffect, useState } from "react";
import {
  Link,
  useParams,
  useSearchParams
} from "react-router-dom";

import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import CentreMap from "../components/CentreMap";
import BookingCard from "../components/BookingCard";
import {
  Alert,
  EmptyState,
  Loading,
  Pagination,
  StatusBadge,
  useResource
} from "../components/Feedback";
import {
  formatDate,
  idOf,
  todayIST,
  validDateString,
  validObjectId
} from "../utils/format";

const SLOT_LIMIT = 24;

export default function CentreDetailsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const requestedDate = searchParams.get("date");

  const [date, setDate] = useState(
    validDateString(requestedDate) ? requestedDate : todayIST()
  );
  const [slotPage, setSlotPage] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [crop, setCrop] = useState("");
  const [quantityKg, setQuantityKg] = useState("100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [committedId, setCommittedId] = useState("");

  const resource = useResource(async () => {
    if (!validObjectId(id)) {
      throw new Error("Invalid procurement centre identifier.");
    }

    const centreResult = await api.centres.get(id, { date });

    /*
     * Backend staff slot reads are centre-scoped.
     * A staff member may inspect another centre's directory details, but we
     * must not query its restricted scheduling endpoint.
     */
    const canViewSlots =
      user.role !== "staff" ||
      idOf(user.centre) === id;

    const slotsResult = canViewSlots
      ? await api.centres.slots(id, {
          date,
          page: slotPage,
          limit: SLOT_LIMIT
        })
      : null;

    return {
      centre: centreResult.data,
      canViewSlots,
      slots: slotsResult?.data || {
        items: [],
        total: 0,
        page: 1,
        limit: SLOT_LIMIT
      }
    };
  }, [id, date, slotPage, user.role, idOf(user.centre)], 15000);

  useEffect(() => {
    setSelectedSlot("");
  }, [id, date, slotPage]);

  useEffect(() => {
    setConfirmation(null);
    setCommittedId("");
    setMessage("");
    setError("");
  }, [id, date]);

  useEffect(() => {
    const accepted = resource.data?.centre.crops;

    if (accepted?.length && !accepted.includes(crop)) {
      setCrop(accepted[0]);
    }
  }, [resource.data?.centre, crop]);

  async function book(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!selectedSlot) {
      setError("Select an available slot.");
      return;
    }

    setBusy(true);

    try {
      const result = await api.bookings.create({
        centreId: id,
        slotId: selectedSlot,
        crop,
        quantityKg: Number(quantityKg)
      });

      setMessage(result.message);
      setSelectedSlot("");

      /*
       * The backend may confirm commit even if its follow-up bundle read fails.
       * That is a successful booking, not an invitation to submit again.
       */
      if (result.data.refreshRequired) {
        setConfirmation(null);
        setCommittedId(result.data.bookingId);
      } else {
        setConfirmation(result.data);
        setCommittedId(result.data.booking._id);
      }

      resource.refresh();
    } catch (failure) {
      setError(
        `${failure.message} If the request timed out, check My Bookings before submitting again.`
      );
      resource.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function retrieveCommittedBooking() {
    setBusy(true);
    setError("");

    try {
      const result = await api.bookings.get(committedId);
      setConfirmation(result.data);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const centre = resource.data?.centre;
  const slots = resource.data?.slots.items || [];
  const selected = slots.find((slot) => slot._id === selectedSlot);

  return (
    <>
      <Link className="back-link" to="/centres">← Centre directory</Link>

      <Alert>{error || resource.error}</Alert>
      <Alert type="success">{message}</Alert>

      {resource.loading && <Loading message="Loading centre information…" />}

      {centre && (
        <>
          <section className="page-heading">
            <div>
              <span className="eyebrow">
                {centre.district}{centre.isDemo ? " · DEMO LOCATION" : ""}
              </span>
              <h1>{centre.name}</h1>
              <p>{centre.address}</p>
            </div>
            <StatusBadge status={centre.active ? "Active" : "Inactive"} />
          </section>

          <div className="dashboard-columns">
            <section className="card">
              <h2>Centre information</h2>
              <dl className="detail-grid">
                <div>
                  <dt>Working hours</dt>
                  <dd>{centre.workingHours}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{centre.phone}</dd>
                </div>
                <div>
                  <dt>Latitude</dt>
                  <dd>{centre.location.coordinates[1]}</dd>
                </div>
                <div>
                  <dt>Longitude</dt>
                  <dd>{centre.location.coordinates[0]}</dd>
                </div>
              </dl>
              <h3>Accepted crops</h3>
              <div className="crop-tags">
                {centre.crops.map((item) => <span key={item}>{item}</span>)}
              </div>
            </section>

            <CentreMap centres={[centre]} />
          </div>

          {resource.data.canViewSlots ? (
            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>Available slots</h2>
                  <p className="muted">
                    {formatDate(date)} · Refreshes every 15 seconds.
                  </p>
                </div>
                <label>
                  Procurement date
                  <input
                    type="date"
                    min={todayIST()}
                    value={date}
                    onChange={(event) => {
                      if (event.target.value) {
                        setDate(event.target.value);
                        setSlotPage(1);
                      }
                    }}
                    required
                  />
                </label>
              </div>

              {!centre.active && (
                <Alert type="warning">
                  This centre is inactive and cannot accept new bookings.
                </Alert>
              )}

              {slots.length ? (
                <div className="slot-grid">
                  {slots.map((slot) => (
                    <button
                      className={`slot-button ${selectedSlot === slot._id ? "selected" : ""}`}
                      type="button"
                      key={slot._id}
                      onClick={() => setSelectedSlot(slot._id)}
                      aria-pressed={selectedSlot === slot._id}
                      disabled={
                        busy ||
                        !slot.bookable ||
                        !centre.active ||
                        user.role !== "farmer" ||
                        Boolean(committedId)
                      }
                    >
                      <strong>{slot.startTime}–{slot.endTime} IST</strong>
                      <span>
                        {slot.availableCapacity} of {slot.capacity} places available
                      </span>
                      <small>{slot.bookable ? "Available" : "Closed, full or ended"}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState title="No slots for this date">
                  <p>Choose another date or ask the administrator to publish slots.</p>
                </EmptyState>
              )}

              <Pagination
                page={slotPage}
                total={resource.data.slots.total}
                limit={SLOT_LIMIT}
                onChange={setSlotPage}
              />

              {user.role === "farmer" ? (
                <form className="form-grid booking-form" onSubmit={book}>
                  <label>
                    Crop
                    <select
                      value={crop}
                      onChange={(event) => setCrop(event.target.value)}
                      disabled={!centre.active || busy || Boolean(committedId)}
                      required
                    >
                      <option value="">Select crop</option>
                      {centre.crops.map((item) => (
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
                      disabled={busy || Boolean(committedId)}
                      required
                    />
                  </label>

                  <div className="full-width">
                    <p>
                      Selected slot:{" "}
                      <strong>
                        {selected
                          ? `${selected.startTime}–${selected.endTime} IST`
                          : "None"}
                      </strong>
                    </p>

                    <button
                      className="button"
                      disabled={
                        busy ||
                        !selected?.bookable ||
                        !centre.active ||
                        !crop ||
                        Boolean(committedId)
                      }
                    >
                      {busy ? "Saving booking…" : "Book slot & generate token"}
                    </button>

                    <p className="muted small">
                      One non-cancelled booking per farmer/date. The backend
                      checks availability again and reserves capacity atomically.
                    </p>
                  </div>
                </form>
              ) : (
                <p className="muted">
                  Read-only schedule preview. Only farmers can book slots.
                </p>
              )}
            </section>
          ) : (
            <Alert type="warning">
              Staff can view slot schedules only for their assigned centre.
            </Alert>
          )}
        </>
      )}

      {committedId && (
        <section className="confirmation-section">
          <h2>Booking saved</h2>

          {confirmation ? (
            <BookingCard bundle={confirmation} />
          ) : (
            <div className="card">
              <p>
                Your booking committed successfully. Its details need to be
                retrieved again; do not create another booking.
              </p>
              <p className="muted small">Booking ID: {committedId}</p>
              <button
                className="button secondary"
                onClick={retrieveCommittedBooking}
                disabled={busy}
              >
                Retrieve saved token
              </button>
            </div>
          )}

          <Link className="button" to="/bookings">Track live queue and payment</Link>
        </section>
      )}
    </>
  );
}