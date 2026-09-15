import React from "react";
import { useEffect, useState } from "react";

import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  Alert,
  Loading,
  StatusBadge,
  useResource
} from "../components/Feedback";

export default function ProfilePage() {
  const { updateUser } = useAuth();

  const [form, setForm] = useState({
    name: "",
    village: "",
    district: "",
    address: ""
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const resource = useResource(async () => {
    const result = await api.users.profile();
    return result.data;
  });

  useEffect(() => {
    if (resource.data) {
      setForm({
        name: resource.data.name,
        village: resource.data.village || "",
        district: resource.data.district || "",
        address: resource.data.address || ""
      });
    }
  }, [resource.data]);

  function change(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await api.users.updateProfile(form);
      updateUser(result.data);
      setMessage(result.message);
      resource.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card form-page">
      <span className="eyebrow">Account information</span>
      <h1>My profile</h1>

      <Alert>{error || resource.error}</Alert>
      <Alert type="success">{message}</Alert>

      {resource.loading && <Loading message="Loading profile…" />}

      {resource.data && (
        <>
          <dl className="detail-grid">
            <div>
              <dt>Email</dt>
              <dd>{resource.data.email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{resource.data.phone}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{resource.data.role}</dd>
            </div>
            <div>
              <dt>Account verification</dt>
              <dd>
                <StatusBadge status={resource.data.verified ? "Verified" : "Unverified"} />
              </dd>
            </div>
          </dl>

          {resource.data.isDemo && (
            <Alert type="warning">
              This account uses fictional DEMO contact information. Actual Twilio
              SMS is disabled for it. Use mock mode or a locally configured test
              contact account.
            </Alert>
          )}

          <p className="muted">
            Phone and email are login identifiers. Changing them requires a
            separate contact-verification flow and is not part of this basic
            profile editor.
          </p>

          <form className="form-grid" onSubmit={save}>
            <label>
              Full name
              <input
                name="name"
                value={form.name}
                onChange={change}
                minLength={2}
                maxLength={80}
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
                value={form.address}
                onChange={change}
                maxLength={250}
              />
            </label>

            <div className="full-width">
              <button className="button" disabled={busy}>
                {busy ? "Saving profile…" : "Save profile"}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}