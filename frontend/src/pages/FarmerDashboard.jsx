import React from "react";
import { Link } from "react-router-dom";

import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import BookingCard from "../components/BookingCard";

import {
  Alert,
  EmptyState,
  Loading,
  StatusBadge,
  useResource
} from "../components/Feedback";

import {
  formatDateTime,
  queuePositionText
} from "../utils/format";

export default function FarmerDashboard() {
  const { user } = useAuth();

  const resource = useResource(async () => {
    const [token, notifications] = await Promise.all([
      api.tokens.mine(),
      api.notifications.list({ page: 1, limit: 3 })
    ]);

    return {
      bundle: token.data,
      notifications: notifications.data
    };
  }, [], 10000);

  const bundle = resource.data?.bundle;

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Farmer dashboard</span>
          <h1>Namaste, {user.name}</h1>
          <p>Your next procurement visit, organized in one place.</p>
        </div>
        <Link className="button" to="/centres">Find a procurement centre</Link>
      </section>

      <Alert>{resource.error}</Alert>

      <div className="quick-links">
        <Link className="card quick-link" to="/centres">
          <strong>Find Centre</strong>
          <span>Search centres, view locations and available slots</span>
        </Link>
        <Link className="card quick-link" to="/bookings">
          <strong>My Bookings & Token</strong>
          <span>Queue, procurement and payment monitoring</span>
        </Link>
        <Link className="card quick-link" to="/notifications">
          <strong>Notifications</strong>
          <span>{resource.data?.notifications.unreadCount ?? "—"} unread updates</span>
        </Link>
        <Link className="card quick-link" to="/profile">
          <strong>My Profile</strong>
          <span>Review and update your basic information</span>
        </Link>
      </div>

      {resource.loading && <Loading message="Loading your procurement overview…" />}

      {resource.data && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <span>Queue position</span>
              <strong>{bundle ? queuePositionText(bundle.queue) : "No booking"}</strong>
            </div>
            <div className="stat-card">
              <span>Procurement status</span>
              <StatusBadge status={bundle?.procurement?.status || "Not booked"} />
            </div>
            <div className="stat-card">
              <span>Payment monitoring</span>
              <StatusBadge status={bundle?.payment?.status || "Not applicable"} />
            </div>
          </div>

          <div className="dashboard-columns">
            <section>
              <div className="section-heading">
                <h2>My token</h2>
                <button className="button secondary" onClick={resource.refresh}>
                  Refresh
                </button>
              </div>

              {bundle ? (
                <BookingCard bundle={bundle} compact />
              ) : (
                <EmptyState title="Plan your first procurement visit">
                  <p>Choose a centre and book an available slot.</p>
                  <Link className="button" to="/centres">Find Centre</Link>
                </EmptyState>
              )}

              <p className="muted small">
                Status refreshes every 10 seconds while the tab is visible.
                {resource.updatedAt && ` Updated ${formatDateTime(resource.updatedAt)}.`}
              </p>
            </section>

            <section className="card">
              <h2>Recent notifications</h2>
              {resource.data.notifications.items.length ? (
                <ul className="notification-preview">
                  {resource.data.notifications.items.map((notification) => (
                    <li key={notification._id}>
                      <p>{notification.message}</p>
                      <small>{formatDateTime(notification.createdAt)}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No notifications yet.</p>
              )}
              <Link to="/notifications">View all notifications</Link>
            </section>
          </div>
        </>
      )}

      <p className="info-note">
        MANDI LIVE monitors procurement payment records. It does not transfer
        procurement money.
      </p>
    </>
  );
}