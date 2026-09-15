import React from "react";
import { Link } from "react-router-dom";

import { StatusBadge } from "./Feedback";
import {
  formatDate,
  idOf,
  money,
  queuePositionText
} from "../utils/format";

export default function BookingCard({
  bundle,
  onCancel,
  onEdit,
  busy = false,
  compact = false
}) {
  if (!bundle?.booking) {
    return null;
  }

  const {
    booking,
    token,
    queue,
    procurement,
    payment
  } = bundle;

  const cancelled = booking.status === "Cancelled";
  const editable =
    booking.status === "Booked" &&
    queue?.entry?.status === "Waiting";

  const cancellable =
    booking.status === "Booked" &&
    ["Waiting", "Skipped"].includes(queue?.entry?.status);

  return (
    <article className={`card booking-card ${cancelled ? "is-cancelled" : ""}`}>
      <div className="card-heading">
        <div>
          <span className="eyebrow">Procurement booking</span>
          <h3>{booking.centre?.name || "Procurement centre"}</h3>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="token-display">
        <span>Your unique token</span>
        <strong>{token?.number || "Token unavailable — refresh records"}</strong>
      </div>

      <dl className="detail-grid">
        <div>
          <dt>Date</dt>
          <dd>{formatDate(booking.date)}</dd>
        </div>
        <div>
          <dt>Time slot</dt>
          <dd>{booking.startTime}–{booking.endTime} IST</dd>
        </div>
        <div>
          <dt>Crop</dt>
          <dd>{booking.crop}</dd>
        </div>
        <div>
          <dt>Expected quantity</dt>
          <dd>{booking.quantityKg} kg</dd>
        </div>
      </dl>

      {!compact && (
        <>
          <div className="tracking-grid">
            <div className="tracking-cell">
              <span>Queue</span>
              <strong>{queuePositionText(queue)}</strong>
              <StatusBadge status={queue?.entry?.status} />
              {queue?.entry?.status === "Waiting" && (
                <small>
                  People ahead, including the active counter:{" "}
                  {queue.entry.peopleAhead ?? "—"}
                </small>
              )}
            </div>

            <div className="tracking-cell">
              <span>Procurement</span>
              <StatusBadge
                status={cancelled ? "Cancelled" : procurement?.status}
              />
            </div>

            <div className="tracking-cell">
              <span>Payment monitoring</span>
              {cancelled ? (
                <strong>Not applicable</strong>
              ) : (
                <>
                  <StatusBadge status={payment?.status} />
                  <strong>{money(payment?.amountRupees)}</strong>
                </>
              )}
            </div>
          </div>

          {!cancelled && (
            <p className="muted">
              Current centre token:{" "}
              <strong className="token-text">
                {queue?.currentToken?.number || "No active token"}
              </strong>
              <br />
              Waiting farmers: {queue?.waitingCount ?? 0}
            </p>
          )}

          {procurement?.actualQuantityKg !== undefined && (
            <p>Accepted quantity: <strong>{procurement.actualQuantityKg} kg</strong></p>
          )}

          {procurement?.notes && <p>Procurement note: {procurement.notes}</p>}
          {payment?.reference && <p>Payment reference: {payment.reference}</p>}
          {payment?.notes && <p>Payment note: {payment.notes}</p>}
        </>
      )}

      <div className="actions">
        <Link
          className="button secondary"
          to={`/centres/${idOf(booking.centre)}`}
        >
          Centre details
        </Link>

        {compact && (
          <Link className="button" to="/bookings">Track booking</Link>
        )}

        {onEdit && editable && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => onEdit(bundle)}
          >
            Edit crop / quantity
          </button>
        )}

        {onCancel && cancellable && (
          <button
            className="button danger"
            disabled={busy}
            onClick={() => onCancel(booking._id)}
          >
            Cancel booking
          </button>
        )}
      </div>
    </article>
  );
}