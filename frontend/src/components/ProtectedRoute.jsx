import React from "react";
import {
  Navigate,
  Outlet,
  useLocation
} from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { roleHome } from "../utils/format";
import { Alert, Loading } from "./Feedback";

export default function ProtectedRoute({ roles }) {
  const {
    user,
    loading,
    bootstrapError,
    retrySession,
    clearLocalSession
  } = useAuth();

  const location = useLocation();

  if (loading) {
    return <Loading message="Checking your session…" />;
  }

  if (bootstrapError) {
    return (
      <section className="card centered">
        <h1>Unable to check your session</h1>
        <Alert>{bootstrapError}</Alert>
        <div className="actions">
          <button className="button" onClick={retrySession}>
            Retry connection
          </button>
          <button className="button secondary" onClick={clearLocalSession}>
            Clear local session
          </button>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return <Outlet />;
}