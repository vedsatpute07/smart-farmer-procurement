import React from "react";
import {
  useCallback,
  useEffect,
  useState
} from "react";

export function Alert({ type = "error", children }) {
  if (!children) {
    return null;
  }

  return (
    <div
      className={`alert alert-${type}`}
      role={type === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

export function Loading({ message = "Loading…" }) {
  return (
    <div className="loading" role="status">
      <span className="loading-dot" aria-hidden="true" />
      {message}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {children && <div>{children}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const success = [
    "Completed",
    "Procurement Completed",
    "Verified",
    "Active",
    "sent",
    "mock"
  ];

  const danger = [
    "Cancelled",
    "Failed",
    "Inactive",
    "failed"
  ];

  const tone = success.includes(status)
    ? "success"
    : danger.includes(status)
      ? "danger"
      : "neutral";

  return (
    <span className={`badge badge-${tone}`}>
      {status || "—"}
    </span>
  );
}

export function Pagination({ page, total, limit, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));

  if (pages === 1 && page === 1) {
    return null;
  }

  return (
    <div className="pagination" aria-label="Pagination">
      <button
        className="button secondary"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {pages} · {total} records
      </span>
      <button
        className="button secondary"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

/*
 * loader returns application data, usually response.data from api.js.
 * dependencies contains the scalar filters used by loader.
 *
 * Polling does not overlap requests, skips hidden tabs, and retains the last
 * successful result if a later request fails. Filter changes clear old data
 * so a different date/centre is never shown under a new filter label.
 */
export function useResource(loader, dependencies = [], pollMs = 0) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    let running = false;

    setData(null);
    setUpdatedAt(null);
    setLoading(true);
    setError("");

    async function load() {
      if (running) {
        return;
      }

      running = true;

      try {
        const result = await loader();

        if (alive) {
          setData(result);
          setUpdatedAt(new Date());
          setError("");
        }
      } catch (failure) {
        if (alive) {
          setError(failure.message || "Could not load records.");
        }
      } finally {
        running = false;

        if (alive) {
          setLoading(false);
        }
      }
    }

    load();

    const timer = pollMs > 0
      ? window.setInterval(() => {
          if (!document.hidden) {
            load();
          }
        }, pollMs)
      : null;

    return () => {
      alive = false;

      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [...dependencies, revision, pollMs]);

  return {
    data,
    loading,
    error,
    updatedAt,
    refresh
  };
}