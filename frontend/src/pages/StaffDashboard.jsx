import React from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
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
  formatDateTime,
  idOf,
  todayIST,
  validDateString,
  validObjectId
} from "../utils/format";

/*
 * Shared with the admin record manager.
 * It independently reloads the selected booking so mutations and polling always
 * read the authoritative booking/token/queue/procurement/payment bundle.
 */
export function OperationEditor({ bookingId, onChanged }) {
  const { user } = useAuth();
  const [bundle, setBundle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [actualQuantity, setActualQuantity] = useState("");
  const [procurementNotes, setProcurementNotes] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("Processing");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [sms, setSms] = useState("");

  const [editingBooking, setEditingBooking] = useState(false);
  const [crop, setCrop] = useState("");
  const [expectedQuantity, setExpectedQuantity] = useState("");

  const resource = useResource(async () => {
    const result = await api.bookings.get(bookingId);
    return result.data;
  }, [bookingId], 10000);

  useEffect(() => {
    setBundle(null);
    setMessage("");
    setError("");
    setEditingBooking(false);
  }, [bookingId]);

  useEffect(() => {
    if (resource.data) {
      setBundle(resource.data);
    }
  }, [resource.data]);

  const booking = bundle?.booking;
  const procurement = bundle?.procurement;
  const payment = bundle?.payment;
  const entry = bundle?.queue?.entry;

  useEffect(() => {
    if (!booking) {
      return;
    }

    setActualQuantity(String(procurement?.actualQuantityKg ?? booking.quantityKg));
    setProcurementNotes(procurement?.notes || "");
    setAmount(payment?.amountRupees ? String(payment.amountRupees) : "");
    setReference(payment?.reference || "");
    setPaymentNotes(payment?.notes || "");
    setCrop(booking.crop);
    setExpectedQuantity(String(booking.quantityKg));
  }, [booking?._id]);

  useEffect(() => {
    if (payment) {
      setPaymentStatus(payment.status === "Processing" ? "Completed" : "Processing");
      setAmount(payment.amountRupees ? String(payment.amountRupees) : "");
      setReference(payment.reference || "");
      setPaymentNotes(payment.notes || "");
    }
  }, [payment?._id, payment?.status]);

  async function perform(operation, afterSuccess = null) {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await operation();
      setMessage(result.message);

      if (afterSuccess) {
        afterSuccess();
      }

      resource.refresh();
      onChanged?.();
    } catch (failure) {
      setError(failure.message);
      resource.refresh();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || resource.loading || Boolean(resource.error);
  const cancelled = booking?.status === "Cancelled";
  const isToday = booking?.date === todayIST();
  const canProcess = !cancelled && booking?.status === "Booked" && isToday;
  const completed = procurement?.status === "Procurement Completed";
  const canCancel =
    booking?.status === "Booked" &&
    ["Waiting", "Skipped"].includes(entry?.status);

  function cancel() {
    if (window.confirm("Cancel this booking and release its reserved place?")) {
      perform(() => api.bookings.cancel(booking._id));
    }
  }

  function completeProcurement(event) {
    event.preventDefault();

    perform(() => api.procurements.update(procurement._id, {
      status: "Procurement Completed",
      actualQuantityKg: Number(actualQuantity),
      notes: procurementNotes
    }));
  }

  function savePayment(event) {
    event.preventDefault();

    perform(() => api.payments.update(payment._id, {
      status: paymentStatus,
      amountRupees: Number(amount),
      reference,
      notes: paymentNotes
    }));
  }

  function sendMessage(event) {
    event.preventDefault();

    perform(
      () => api.notifications.sendSms({
        userId: idOf(booking.farmer),
        bookingId: booking._id,
        message: sms
      }),
      () => setSms("")
    );
  }

  function saveBooking(event) {
    event.preventDefault();

    perform(
      () => api.bookings.update(booking._id, {
        crop,
        quantityKg: Number(expectedQuantity)
      }),
      () => setEditingBooking(false)
    );
  }

  return (
    <section className="operation-panel">
      <Alert>{error || resource.error}</Alert>
      <Alert type="success">{message}</Alert>

      {resource.loading && !bundle && <Loading message="Loading selected booking…" />}

      {bundle && (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">Selected farmer</span>
              <h2>{booking.farmer?.name}</h2>
              <p className="muted">
                {booking.farmer?.phone} · {booking.farmer?.email}
              </p>
            </div>
            <button
              className="button secondary"
              disabled={busy || resource.loading}
              onClick={resource.refresh}
            >
              Refresh selection
            </button>
          </div>

          <BookingCard
            bundle={bundle}
            busy={disabled}
            onCancel={canCancel ? cancel : undefined}
            onEdit={user.role === "admin" ? () => setEditingBooking(true) : undefined}
          />

          {editingBooking && user.role === "admin" && (
            <section className="card">
              <h3>Edit waiting booking</h3>
              <form className="form-grid" onSubmit={saveBooking}>
                <label>
                  Crop
                  <select
                    value={crop}
                    onChange={(event) => setCrop(event.target.value)}
                    required
                  >
                    {!booking.centre.crops.includes(crop) && (
                      <option value={crop}>{crop} (no longer accepted)</option>
                    )}
                    {booking.centre.crops.map((item) => (
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
                    value={expectedQuantity}
                    onChange={(event) => setExpectedQuantity(event.target.value)}
                    required
                  />
                </label>
                <div className="actions full-width">
                  <button
                    className="button"
                    disabled={
                      disabled ||
                      entry?.status !== "Waiting" ||
                      !booking.centre.crops.includes(crop)
                    }
                  >
                    Save booking
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setEditingBooking(false)}
                  >
                    Close editor
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="card operation-editor">
            <h2>Centre operations</h2>

            {cancelled ? (
              <Alert type="warning">
                This booking is cancelled. Procurement and payment history cannot advance.
              </Alert>
            ) : (
              <>
                {!isToday && !completed && (
                  <Alert type="warning">
                    Queue and procurement processing are available only on the booking
                    date. Payment monitoring can be updated after procurement completion.
                  </Alert>
                )}

                <h3>1. Queue and verification</h3>
                <p>Queue status: <StatusBadge status={entry?.status} /></p>

                <div className="actions">
                  {canProcess && entry?.status === "Waiting" && (
                    <>
                      <button
                        className="button secondary"
                        disabled={disabled || procurement.status === "Waiting"}
                        onClick={() => perform(() =>
                          api.procurements.update(procurement._id, { status: "Waiting" })
                        )}
                      >
                        Mark arrival / Waiting
                      </button>
                      <button
                        className="button secondary"
                        disabled={disabled}
                        onClick={() => perform(() =>
                          api.queue.update(entry._id, "Skipped")
                        )}
                      >
                        Skip absent farmer
                      </button>
                    </>
                  )}

                  {canProcess && entry?.status === "Called" && (
                    <>
                      <button
                        className="button"
                        disabled={disabled}
                        onClick={() => perform(() =>
                          api.procurements.update(procurement._id, {
                            status: "Under Verification",
                            notes: procurementNotes
                          })
                        )}
                      >
                        Verify farmer & start serving
                      </button>
                      <button
                        className="button secondary"
                        disabled={disabled}
                        onClick={() => perform(() =>
                          api.queue.update(entry._id, "Skipped")
                        )}
                      >
                        Skip absent farmer
                      </button>
                    </>
                  )}

                  {canProcess && entry?.status === "Skipped" && (
                    <button
                      className="button secondary"
                      disabled={disabled}
                      onClick={() => perform(() =>
                        api.queue.update(entry._id, "Waiting")
                      )}
                    >
                      Return to waiting queue
                    </button>
                  )}
                </div>

                {entry?.status === "Waiting" && (
                  <p className="muted small">
                    Use Call Next on the centre queue board to call the first waiting
                    token. The backend prevents calling a later token out of order.
                  </p>
                )}

                <h3>2. Procurement</h3>
                <p>Current status: <StatusBadge status={procurement?.status} /></p>

                <form className="form-grid" onSubmit={completeProcurement}>
                  <label>
                    Actual accepted quantity (kg)
                    <input
                      type="number"
                      min="1"
                      max="1000000"
                      step="0.01"
                      value={actualQuantity}
                      onChange={(event) => setActualQuantity(event.target.value)}
                      disabled={disabled || !canProcess || entry?.status !== "Serving"}
                      required
                    />
                  </label>
                  <label>
                    Verification / procurement notes
                    <input
                      value={procurementNotes}
                      onChange={(event) => setProcurementNotes(event.target.value)}
                      maxLength={500}
                      disabled={disabled || !canProcess}
                    />
                  </label>
                  <div className="full-width">
                    <button
                      className="button"
                      disabled={disabled || !canProcess || entry?.status !== "Serving"}
                    >
                      Complete procurement
                    </button>
                    <p className="muted small">
                      Completion also completes this booking and queue token.
                    </p>
                  </div>
                </form>

                <h3>3. Payment-status monitoring</h3>
                <p>Current status: <StatusBadge status={payment?.status} /></p>

                {payment?.status === "Completed" ? (
                  <p className="info-note">
                    Completed payment records are read-only. This is a recorded status,
                    not a transfer performed by MANDI LIVE.
                  </p>
                ) : (
                  <form className="form-grid" onSubmit={savePayment}>
                    <label>
                      Next status
                      <select
                        value={paymentStatus}
                        onChange={(event) => setPaymentStatus(event.target.value)}
                        disabled={disabled || !completed}
                      >
                        {payment?.status === "Processing" ? (
                          <>
                            <option value="Completed">Completed</option>
                            <option value="Failed">Failed</option>
                            <option value="Processing">Processing — update details</option>
                          </>
                        ) : (
                          <option value="Processing">Processing</option>
                        )}
                      </select>
                    </label>
                    <label>
                      Recorded amount (INR)
                      <input
                        type="number"
                        min="0.01"
                        max="100000000"
                        step="0.01"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        disabled={disabled || !completed}
                        required
                      />
                    </label>
                    <label>
                      Record reference
                      <input
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        maxLength={100}
                        disabled={disabled || !completed}
                      />
                    </label>
                    <label>
                      Notes / failure reason
                      <input
                        value={paymentNotes}
                        onChange={(event) => setPaymentNotes(event.target.value)}
                        maxLength={500}
                        disabled={disabled || !completed}
                        required={paymentStatus === "Failed"}
                      />
                    </label>
                    <div className="full-width">
                      <button className="button" disabled={disabled || !completed}>
                        Save payment status
                      </button>
                      <p className="muted small">
                        Pending → Processing → Completed or Failed. Failed records can
                        return to Processing. Procurement must be completed first.
                      </p>
                    </div>
                  </form>
                )}
              </>
            )}

            <h3>4. Notify farmer</h3>
            <form className="form-stack" onSubmit={sendMessage}>
              <label>
                Booking-related message
                <textarea
                  value={sms}
                  onChange={(event) => setSms(event.target.value)}
                  minLength={5}
                  maxLength={900}
                  rows={3}
                  required
                />
              </label>
              <button className="button secondary" disabled={disabled}>
                Save notification & send SMS / mock SMS
              </button>
            </form>

            <p className="muted small">
              Automatic status-change notifications are created by the backend.
              Fictional DEMO recipients cannot receive real Twilio SMS.
            </p>
          </section>
        </>
      )}
    </section>
  );
}

async function loadCentreDirectory() {
  const centres = [];
  let page = 1;
  let total = 0;

  do {
    const result = await api.centres.list({
      page,
      limit: 100,
      includeInactive: "true"
    });

    centres.push(...result.data.items);
    total = result.data.total;
    page += 1;

    if (!result.data.items.length) {
      break;
    }
  } while (centres.length < total);

  return centres;
}

const LIMIT = 10;

export default function StaffDashboard() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const requestedCentre = searchParams.get("centreId");
  const requestedDate = searchParams.get("date");

  const [centreId, setCentreId] = useState(
    user.role === "staff"
      ? idOf(user.centre)
      : validObjectId(requestedCentre) ? requestedCentre : ""
  );
  const [date, setDate] = useState(
    validDateString(requestedDate) ? requestedDate : todayIST()
  );
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const directory = useResource(async () => {
    return user.role === "admin" ? loadCentreDirectory() : [];
  }, [user.role]);

  useEffect(() => {
    if (user.role === "admin" && !centreId && directory.data?.length) {
      setCentreId(directory.data[0]._id);
    }
  }, [directory.data, centreId, user.role]);

  const resource = useResource(async () => {
    if (!centreId) {
      return null;
    }

    const [bookings, queue] = await Promise.all([
      api.bookings.list({ centreId, date, page, limit: LIMIT }),
      api.queue.centre(centreId, { date })
    ]);

    return { bookings: bookings.data, queue: queue.data };
  }, [centreId, date, page], 10000);

  function changeCentre(value) {
    setCentreId(value);
    setPage(1);
    setSelectedId("");
    setMessage("");
    setError("");
  }

  function changeDate(value) {
    if (!value) {
      return;
    }

    setDate(value);
    setPage(1);
    setSelectedId("");
    setMessage("");
    setError("");
  }

  async function callNext() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await api.queue.next({ centreId, date });
      setMessage(result.message);

      const called = result.data.entries.find((entry) => entry.activeService);

      if (called?.booking) {
        setSelectedId(idOf(called.booking));
      }

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
          <span className="eyebrow">
            {user.role === "admin" ? "Admin centre operations" : "Centre staff"}
          </span>
          <h1>Procurement operations</h1>
          <p>Call tokens, verify farmers and maintain procurement/payment records.</p>
        </div>
        <button className="button secondary" onClick={resource.refresh}>
          Refresh board
        </button>
      </section>

      <section className="card filter-bar">
        {user.role === "admin" && (
          <label className="grow">
            Procurement centre
            <select value={centreId} onChange={(event) => changeCentre(event.target.value)}>
              <option value="">Select a centre</option>
              {(directory.data || []).map((centre) => (
                <option key={centre._id} value={centre._id}>
                  {centre.name}{centre.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Booking date
          <input
            type="date"
            value={date}
            onChange={(event) => changeDate(event.target.value)}
            required
          />
        </label>

        <button className="button secondary" onClick={() => changeDate(todayIST())}>
          Today
        </button>
      </section>

      <Alert>{error || resource.error || directory.error}</Alert>
      <Alert type="success">{message}</Alert>

      {!centreId && (
        <EmptyState title="Select a procurement centre">
          <p>
            {user.role === "staff"
              ? "This staff account needs a centre assignment."
              : "Create a centre in Manage Records if the directory is empty."}
          </p>
        </EmptyState>
      )}

      {resource.loading && centreId && <Loading message="Loading centre operations…" />}

      {resource.data && (
        <>
          <h2>{resource.data.queue.centre.name}</h2>

          <div className="stats-grid">
            <div className="stat-card">
              <span>Bookings for {formatDate(date)}</span>
              <strong>{resource.data.bookings.total}</strong>
            </div>
            <div className="stat-card">
              <span>Waiting farmers</span>
              <strong>{resource.data.queue.waitingCount}</strong>
            </div>
            <div className="stat-card">
              <span>Current token</span>
              <strong className="token-text">
                {resource.data.queue.currentToken?.number || "No active token"}
              </strong>
            </div>
          </div>

          <section className="card">
            <div className="section-heading">
              <h2>Queue board</h2>
              <button
                className="button"
                disabled={
                  busy ||
                  date !== todayIST() ||
                  Boolean(resource.data.queue.currentToken) ||
                  resource.data.queue.waitingCount === 0
                }
                onClick={callNext}
              >
                {busy ? "Calling…" : "Call next token"}
              </button>
            </div>

            <p className="muted small">
              One active counter per centre/date. Queue order is slot start time,
              then booking time. Waiting positions start at 1.
            </p>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Token</th><th>Farmer</th><th>Slot</th>
                    <th>Status</th><th>Position</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.queue.entries.map((entry) => (
                    <tr key={entry._id}>
                      <td className="token-text">{entry.token?.number}</td>
                      <td>{entry.farmer?.name}</td>
                      <td>{entry.startTime} IST</td>
                      <td><StatusBadge status={entry.status} /></td>
                      <td>{entry.position ?? "—"}</td>
                      <td>
                        <button
                          className="button secondary"
                          onClick={() => setSelectedId(idOf(entry.booking))}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!resource.data.queue.entries.length && (
              <EmptyState title="No tokens for this date" />
            )}
          </section>

          <section className="card">
            <h2>Bookings and records</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Farmer</th><th>Time / token</th><th>Booking</th>
                    <th>Procurement</th><th>Payment</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.bookings.items.map((item) => (
                    <tr key={item.booking._id}>
                      <td>
                        {item.booking.farmer?.name}
                        <small className="block">{item.booking.farmer?.phone}</small>
                      </td>
                      <td>
                        {item.booking.startTime}–{item.booking.endTime}
                        <small className="block token-text">{item.token?.number}</small>
                      </td>
                      <td><StatusBadge status={item.booking.status} /></td>
                      <td>
                        <StatusBadge status={
                          item.booking.status === "Cancelled"
                            ? "Cancelled"
                            : item.procurement?.status
                        } />
                      </td>
                      <td>
                        {item.booking.status === "Cancelled"
                          ? "Not applicable"
                          : <StatusBadge status={item.payment?.status} />}
                      </td>
                      <td>
                        <button
                          className="button secondary"
                          onClick={() => setSelectedId(item.booking._id)}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!resource.data.bookings.items.length && (
              <EmptyState title="No bookings for this date" />
            )}

            <Pagination
              page={page}
              total={resource.data.bookings.total}
              limit={LIMIT}
              onChange={setPage}
            />
          </section>

          <p className="muted small">
            Auto-refresh every 10 seconds.
            {resource.updatedAt && ` Updated ${formatDateTime(resource.updatedAt)}.`}
          </p>
        </>
      )}

      {selectedId && (
        <>
          <div className="section-heading">
            <h2>Selected booking</h2>
            <button className="button secondary" onClick={() => setSelectedId("")}>
              Close selection
            </button>
          </div>
          <OperationEditor
            key={selectedId}
            bookingId={selectedId}
            onChanged={resource.refresh}
          />
        </>
      )}
    </>
  );
}