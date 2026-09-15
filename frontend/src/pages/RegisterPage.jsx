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
import {
  roleHome,
  validatePassword
} from "../utils/format";

const initialForm = {
  name: "",
  phone: "",
  email: "",
  password: "",
  village: "",
  district: "",
  address: ""
};

export default function RegisterPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (loading) {
    return <Loading />;
  }

  if (user) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  function change(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (!validatePassword(form.password)) {
      setError(
        "Use at least eight characters with uppercase, lowercase and a number. " +
        "The password must not exceed 72 UTF-8 bytes."
      );
      return;
    }

    if (form.password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const result = await api.auth.register(form);

      setForm((current) => ({ ...current, password: "" }));
      setConfirmPassword("");

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
    <section className="card form-page">
      <span className="eyebrow">Farmer registration</span>
      <h1>Create your account</h1>
      <p className="muted">
        Register your details and verify the OTP. Staff and admin accounts are
        configured separately, not through public registration.
      </p>

      <Alert>{error}</Alert>

      <form className="form-grid" onSubmit={submit}>
        <label>
          Full name *
          <input
            name="name"
            autoComplete="name"
            value={form.name}
            onChange={change}
            minLength={2}
            maxLength={80}
            required
          />
        </label>

        <label>
          Phone number *
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={change}
            placeholder="+countrycode followed by number"
            pattern="\+[1-9][0-9]{7,14}"
            title="Include + and your country code."
            required
          />
        </label>

        <label>
          Email *
          <input
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={change}
            maxLength={160}
            required
          />
        </label>

        <label>
          Village
          <input
            name="village"
            value={form.village}
            onChange={change}
            maxLength={100}
          />
        </label>

        <label>
          District
          <input
            name="district"
            value={form.district}
            onChange={change}
            maxLength={100}
          />
        </label>

        <label>
          Address
          <input
            name="address"
            autoComplete="street-address"
            value={form.address}
            onChange={change}
            maxLength={250}
          />
        </label>

        <label>
          Password *
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={change}
            minLength={8}
            maxLength={72}
            required
          />
          <small>Uppercase, lowercase, number; at least eight characters.</small>
        </label>

        <label>
          Confirm password *
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            maxLength={72}
            required
          />
        </label>

        <div className="full-width">
          <button className="button" disabled={busy}>
            {busy ? "Creating account…" : "Register and receive OTP"}
          </button>
          <p className="muted small">
            For actual Twilio SMS, use your own consenting, permitted test number.
            A trial account may require the recipient to be verified first.
          </p>
        </div>
      </form>

      <p>Already registered? <Link to="/login">Login</Link></p>
    </section>
  );
}