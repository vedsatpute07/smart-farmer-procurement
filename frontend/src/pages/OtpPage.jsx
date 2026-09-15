import React from "react";
import {
  useEffect,
  useState
} from "react";

import {
  Link,
  Navigate,
  useLocation,
  useNavigate
} from "react-router-dom";

import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { Alert, Loading } from "../components/Feedback";
import { roleHome } from "../utils/format";

export default function OtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, completeLogin } = useAuth();

  const [challenge, setChallenge] = useState(
    location.state?.challenge || null
  );
  const [message, setMessage] = useState(location.state?.message || "");
  const [resendAt, setResendAt] = useState(
    (location.state?.issuedAt || Date.now()) +
    (location.state?.challenge?.resendAfterSeconds || 60) * 1000
  );

  const [otp, setOtp] = useState("");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading) {
    return <Loading />;
  }

  if (user) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  if (!challenge?.challengeId) {
    return (
      <section className="card centered">
        <h1>Start with login or registration</h1>
        <p>
          This page needs an OTP challenge. Return to Login to request a fresh
          challenge if the previous one was lost or expired.
        </p>
        <Link className="button" to="/login">Go to login</Link>
      </section>
    );
  }

  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expiresIn = Math.max(
    0,
    Math.ceil((new Date(challenge.expiresAt).getTime() - now) / 1000)
  );

  async function verify(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const result = await api.auth.verifyOtp({
        challengeId: challenge.challengeId,
        otp
      });

      setOtp("");

      if (result.data.purpose === "registration") {
        setRegistered(true);
        setMessage(result.message);
      } else {
        completeLogin(result.data);
        navigate(roleHome(result.data.user.role), { replace: true });
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");

    try {
      const result = await api.auth.resendOtp(challenge.challengeId);
      const issuedAt = Date.now();

      setChallenge(result.data);
      setMessage(result.message);
      setOtp("");
      setNow(issuedAt);
      setResendAt(issuedAt + result.data.resendAfterSeconds * 1000);

      navigate("/verify-otp", {
        replace: true,
        state: {
          challenge: result.data,
          message: result.message,
          issuedAt
        }
      });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card auth-card centered">
      <span className="eyebrow">Secure OTP verification</span>
      <h1>{registered ? "Registration verified" : "Enter your OTP"}</h1>

      <Alert type={registered || challenge.deliveryStatus !== "failed" ? "success" : "warning"}>
        {message}
      </Alert>
      <Alert>{error}</Alert>

      {registered ? (
        <>
          <p>Your account is ready. Login with your password and a fresh login OTP.</p>
          <Link className="button" to="/login">Continue to login</Link>
        </>
      ) : (
        <>
          <p>
            {challenge.purpose === "registration" ? "Registration" : "Login"}{" "}
            verification for <strong>{challenge.maskedPhone}</strong>.
          </p>

          <form className="form-stack" onSubmit={verify}>
            <label>
              Six-digit OTP
              <input
                className="otp-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                autoFocus
              />
            </label>

            <button
              className="button"
              disabled={busy || otp.length !== 6 || expiresIn === 0}
            >
              {busy ? "Please wait…" : "Verify OTP"}
            </button>
          </form>

          <p className="muted">
            {expiresIn > 0
              ? `Expires in ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, "0")}`
              : "The code has expired. Request a new OTP."}
          </p>

          <button
            className="button secondary"
            disabled={busy || resendSeconds > 0}
            onClick={resend}
          >
            {resendSeconds > 0
              ? `Resend in ${resendSeconds}s`
              : "Resend OTP"}
          </button>

          <p className="muted small">
            Maximum {challenge.maxAttempts} verification attempts per challenge.
            Resending invalidates the previous code.
          </p>

          {challenge.deliveryStatus === "mock" ? (
            <p className="info-note">
              Mock SMS mode: read the OTP in the backend terminal.
            </p>
          ) : (
            <p className="muted small">
              Check your test phone for the SMS. If delivery fails, confirm the
              recipient and sender restrictions in Twilio. This page never reveals
              the OTP.
            </p>
          )}

          <Link to="/login">Back to login</Link>
        </>
      )}
    </section>
  );
}