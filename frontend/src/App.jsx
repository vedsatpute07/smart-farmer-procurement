import React from "react";
import {
  Link,
  Navigate,
  Route,
  Routes
} from "react-router-dom";

import { useAuth } from "./context/AuthContext";
import { roleHome } from "./utils/format";

import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { Alert, Loading } from "./components/Feedback";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import OtpPage from "./pages/OtpPage";
import FarmerDashboard from "./pages/FarmerDashboard";
import CentresPage from "./pages/CentresPage";
import CentreDetailsPage from "./pages/CentreDetailsPage";
import BookingsPage from "./pages/BookingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import ProfilePage from "./pages/ProfilePage";
import StaffDashboard from "./pages/StaffDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AdminManagePage from "./pages/AdminManagePage";

function HomeRedirect() {
  const {
    user,
    loading,
    bootstrapError,
    retrySession,
    clearLocalSession
  } = useAuth();

  if (loading) {
    return <Loading message="Checking session…" />;
  }

  if (bootstrapError) {
    return (
      <section className="card centered">
        <h1>Connection unavailable</h1>
        <Alert>{bootstrapError}</Alert>
        <div className="actions">
          <button className="button" onClick={retrySession}>Retry</button>
          <button className="button secondary" onClick={clearLocalSession}>
            Clear local session
          </button>
        </div>
      </section>
    );
  }

  return <Navigate to={user ? roleHome(user.role) : "/login"} replace />;
}

function NotFoundPage() {
  return (
    <section className="card centered">
      <h1>Page not found</h1>
      <p>The requested page does not exist.</p>
      <Link className="button" to="/">Return home</Link>
    </section>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomeRedirect />} />

        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="verify-otp" element={<OtpPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="centres" element={<CentresPage />} />
          <Route path="centres/:id" element={<CentreDetailsPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={["farmer"]} />}>
          <Route path="dashboard" element={<FarmerDashboard />} />
          <Route path="bookings" element={<BookingsPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={["staff", "admin"]} />}>
          <Route path="staff" element={<StaffDashboard />} />
        </Route>

        <Route element={<ProtectedRoute roles={["admin"]} />}>
          <Route path="admin" element={<AdminDashboard />} />
          <Route path="admin/manage" element={<AdminManagePage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}