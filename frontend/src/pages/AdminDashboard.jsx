import React from "react";
import { Link } from "react-router-dom";

import { api } from "../services/api";
import {
  Alert,
  Loading,
  useResource
} from "../components/Feedback";
import {
  formatDate,
  formatDateTime
} from "../utils/format";

export default function AdminDashboard() {
  const resource = useResource(async () => {
    const [statistics, configuration] = await Promise.all([
      api.admin.dashboard(),
      api.config()
    ]);

    return {
      stats: statistics.data,
      config: configuration.data
    };
  }, [], 15000);

  const stats = resource.data?.stats;
  const config = resource.data?.config;

  const cards = stats ? [
    ["Total farmers", stats.totalFarmers],
    ["Total centres", stats.totalCentres],
    ["Today's bookings", stats.todaysBookings],
    ["Waiting farmers today", stats.waitingFarmers],
    ["Completed procurements", stats.completedProcurements],
    ["Pending payment records", stats.pendingPayments]
  ] : [];

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Regional procurement overview</h1>
          <p>Live statistics calculated from MongoDB records.</p>
        </div>
        <button
          className="button secondary"
          disabled={resource.loading}
          onClick={resource.refresh}
        >
          Refresh statistics
        </button>
      </section>

      <Alert>{resource.error}</Alert>

      {resource.loading && <Loading message="Loading administrative overview…" />}

      {stats && (
        <>
          <p className="muted">
            Today: {formatDate(stats.date)} · {stats.timeZone}
          </p>

          <div className="stats-grid">
            {cards.map(([label, value]) => (
              <div className="stat-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <section className="card">
            <h2>Operational summary</h2>
            <dl className="detail-grid">
              <div><dt>Active farmer accounts</dt><dd>{stats.activeFarmers}</dd></div>
              <div><dt>Active centres</dt><dd>{stats.activeCentres}</dd></div>
              <div><dt>Payments processing</dt><dd>{stats.processingPayments}</dd></div>
              <div><dt>Failed payment records</dt><dd>{stats.failedPayments}</dd></div>
              <div><dt>SMS mode</dt><dd>{config.smsMode}</dd></div>
              <div><dt>Payment configuration</dt><dd>{config.paymentMode}</dd></div>
            </dl>

            <p className="muted small">
              Today's bookings exclude cancellations. Farmer totals include disabled
              accounts. Completed procurements are an all-time count. Payment totals
              exclude cancelled bookings.
            </p>
          </section>

          {config.sandboxCheckoutEnabled && (
            <Alert type="warning">
              Razorpay TEST Checkout is enabled for a separate admin demonstration.
              It is not a farmer payout and cannot update procurement payment status.
              Open a completed booking in Manage Records to use it.
            </Alert>
          )}
        </>
      )}

      <div className="quick-links">
        <Link className="card quick-link" to="/admin/manage?tab=farmers">
          <strong>Farmers</strong>
          <span>Edit basic profiles and enable or disable accounts</span>
        </Link>
        <Link className="card quick-link" to="/admin/manage?tab=centres">
          <strong>Centres</strong>
          <span>Create, edit and safely deactivate centres</span>
        </Link>
        <Link className="card quick-link" to="/admin/manage?tab=slots">
          <strong>Slots</strong>
          <span>Publish schedules and manage capacity</span>
        </Link>
        <Link className="card quick-link" to="/admin/manage?tab=bookings">
          <strong>Bookings and records</strong>
          <span>Manage procurement and payment monitoring</span>
        </Link>
      </div>

      <section className="card">
        <h2>Operate a procurement centre</h2>
        <p>
          Administrators can access the same queue and verification workflow as staff
          across all centres.
        </p>
        <Link className="button" to="/staff">Open centre operations</Link>
      </section>

      <p className="muted small">
        Statistics refresh every 15 seconds while this tab is visible.
        {resource.updatedAt && ` Last updated ${formatDateTime(resource.updatedAt)}.`}
      </p>
    </>
  );
}