import React from "react";
import { useState } from "react";

import { api } from "../services/api";
import {
  Alert,
  EmptyState,
  Loading,
  Pagination,
  StatusBadge,
  useResource
} from "../components/Feedback";
import { formatDateTime } from "../utils/format";

const LIMIT = 15;

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const resource = useResource(async () => {
    const result = await api.notifications.list({
      page,
      limit: LIMIT,
      unreadOnly: unreadOnly ? "true" : undefined
    });

    return result.data;
  }, [page, unreadOnly], 15000);

  async function markRead(id) {
    setBusyId(id);
    setError("");

    try {
      await api.notifications.markRead(id);
      resource.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Updates and alerts</span>
          <h1>Notifications</h1>
          <p>
            {resource.data?.unreadCount ?? "—"} unread updates.
            In-app notifications remain available when SMS delivery fails.
          </p>
        </div>
        <button className="button secondary" onClick={resource.refresh}>
          Refresh
        </button>
      </section>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={(event) => {
            setUnreadOnly(event.target.checked);
            setPage(1);
          }}
        />
        Show unread only
      </label>

      <Alert>{error || resource.error}</Alert>

      {resource.loading && <Loading message="Loading notifications…" />}

      {resource.data && (
        <>
          {resource.data.items.length ? (
            <div className="notification-list">
              {resource.data.items.map((notification) => (
                <article
                  key={notification._id}
                  className={`card notification-item ${notification.read ? "" : "unread"}`}
                >
                  <div>
                    <span className="eyebrow">{notification.type}</span>
                    <p>{notification.message}</p>
                    <small className="muted">
                      {formatDateTime(notification.createdAt)}
                    </small>
                    <div className="actions">
                      <span className="muted small">SMS:</span>
                      <StatusBadge status={notification.deliveryStatus} />
                    </div>
                    {notification.deliveryError && (
                      <p className="muted small">{notification.deliveryError}</p>
                    )}
                  </div>

                  {!notification.read && (
                    <button
                      className="button secondary"
                      disabled={busyId === notification._id}
                      onClick={() => markRead(notification._id)}
                    >
                      {busyId === notification._id ? "Saving…" : "Mark read"}
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No notifications in this view" />
          )}

          <Pagination
            page={page}
            total={resource.data.total}
            limit={LIMIT}
            onChange={setPage}
          />
        </>
      )}

      <section className="info-note">
        <p>
          <strong>Delivery labels:</strong> “sent” means provider acceptance, not
          confirmed handset delivery. “mock” means console-only development
          delivery. “not_requested” means an in-app-only notice, including seed
          records and sandbox audit notices.
        </p>
        <p>OTP values are never included in saved notification messages.</p>
      </section>
    </>
  );
}