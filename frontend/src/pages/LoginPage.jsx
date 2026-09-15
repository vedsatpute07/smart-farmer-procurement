import React from "react";
import { useState } from "react";
import {
  Link,
  Navigate,
  useNavigate
} from "react-router-dom";

import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { Alert, Loading } from "../components/Feedback";
import { roleHome } from "../utils/format";

export default function LoginPage() {
  const navigate = useNavigate();

  const {
    user,
    loading,
    bootstrapError,
    sessionMessage,
    setSessionMessage,
    retrySession,
    clearLocalSession
  } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (loading) {
    return <Loading message="Checking session…" />;
  }

  if (user) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSessionMessage("");

    try {
      const result = await api.auth.login({
        identifier: identifier.trim(),
        password
      });

      setPassword("");

      navigate("/verify-otp", {
        state: {
          challenge: result.data,
          message: result.message,
          issuedAt: Date.now()
        }
      });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-intro">
        <span className="eyebrow">Welcome to MANDI LIVE</span>
        <h1>Plan your visit.<br />Track your procurement.</h1>
        <p>
          Find a centre, reserve a slot and follow your token from the waiting
          queue to procurement completion.
        </p>
        <ol className="journey-list">
          <li>Discover centres and available slots</li>
          <li>Book and receive a unique token</li>
          <li>Track queue, procurement and payment records</li>
        </ol>
        <p className="muted">
          Innovate_AgriNexus · SIH 2026 · Smart Automation
        </p>
      </section>

      <section className="card auth-card">
        <h2>Login</h2>
        <p className="muted">For farmers, centre staff and administrators.</p>

        <Alert>{error || sessionMessage}</Alert>

        {bootstrapError && (
          <>
            <Alert>{bootstrapError}</Alert>
            <div className="actions">
              <button className="button secondary" onClick={retrySession}>
                Retry saved session
              </button>
              <button className="button secondary" onClick={clearLocalSession}>
                Clear saved session
              </button>
            </div>
          </>
        )}

        <form onSubmit={submit} className="form-stack">
          <label>
            Email or international phone
            <input
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Your email or +countrycode phone"
              maxLength={160}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={200}
              required
            />
          </label>

          <button className="button" disabled={busy || Boolean(bootstrapError)}>
            {busy ? "Checking credentials…" : "Continue to OTP"}
          </button>
        </form>

        <p className="muted small">
          A fresh OTP is required after password verification. In mock mode,
          read the code from the backend terminal. In Twilio mode, use a permitted
          test recipient configured for your account.
        </p>
        <p>New farmer? <Link to="/register">Create an account</Link></p>
      </section>
    </div>
  );
}