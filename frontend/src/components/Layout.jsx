import React from "react";
import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate
} from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { roleHome } from "../utils/format";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>

      <header className="site-header">
        <div className="header-inner">
          <Link
            className="brand"
            to={user ? roleHome(user.role) : "/login"}
            aria-label="MANDI LIVE home"
          >
            <img src="/favicon.svg" width="42" height="42" alt="" />
            <span>
              MANDI <strong>LIVE</strong>
              <small>Farmer Procurement Platform</small>
            </span>
          </Link>

          {user ? (
            <div className="header-account">
              <span>
                {user.name}
                <small className="role-label">
                  {user.role}{user.isDemo ? " · DEMO" : ""}
                </small>
              </span>
              <button
                className="button secondary"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? "Logging out…" : "Logout"}
              </button>
            </div>
          ) : (
            <div className="header-account">
              <Link to="/login">Login</Link>
              <Link className="button" to="/register">Register</Link>
            </div>
          )}
        </div>
      </header>

      {user && (
        <nav className="main-nav" aria-label="Main navigation">
          <div className="nav-inner">
            <NavLink to={roleHome(user.role)} end>Dashboard</NavLink>

            {user.role === "farmer" && (
              <>
                <NavLink to="/centres">Find Centre</NavLink>
                <NavLink to="/bookings">My Bookings & Token</NavLink>
              </>
            )}

            {user.role === "staff" && (
              <NavLink to="/centres">Centre Directory</NavLink>
            )}

            {user.role === "admin" && (
              <>
                <NavLink to="/admin/manage">Manage Records</NavLink>
                <NavLink to="/staff">Centre Operations</NavLink>
                <NavLink to="/centres">Centre Directory</NavLink>
              </>
            )}

            <NavLink to="/notifications">Notifications</NavLink>
            <NavLink to="/profile">Profile</NavLink>
          </div>
        </nav>
      )}

      <main className="main-content" id="main-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <span>MANDI LIVE · Innovate_AgriNexus · SIH 2026 MVP</span>
        <span>Schedules use Indian Standard Time.</span>
        <span>
          Procurement payment monitoring only. Optional sandbox checkout is not a farmer payout.
        </span>
      </footer>
    </div>
  );
}