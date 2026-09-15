import React from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../services/api";
import { OperationEditor } from "./StaffDashboard";
import {
  Alert,
  EmptyState,
  Loading,
  Pagination,
  StatusBadge,
  useResource
} from "../components/Feedback";
import {
  formatDate,
  formatDateTime,
  idOf,
  money,
  todayIST
} from "../utils/format";

const TABS = [
  "farmers",
  "centres",
  "slots",
  "bookings",
  "procurements",
  "payments"
];

const LIMIT = 12;
let checkoutPromise = null;

function loadRazorpayCheckout() {
  if (window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }

  if (checkoutPromise) {
    return checkoutPromise;
  }

  checkoutPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;

    function fail() {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timer);
      checkoutPromise = null;
      script.remove();
      reject(new Error("Razorpay Checkout could not load. Check your internet connection."));
    }

    const timer = window.setTimeout(fail, 15000);

    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      if (settled) {
        return;
      }

      if (!window.Razorpay) {
        fail();
        return;
      }

      settled = true;
      window.clearTimeout(timer);
      resolve(window.Razorpay);
    };

    document.head.appendChild(script);
  });

  return checkoutPromise;
}

function SandboxCheckout({ paymentId, eligible }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingVerification, setPendingVerification] = useState(null);

  const mounted = useRef(true);
  const checkout = useRef(null);
  const verificationStarted = useRef(false);

  const resource = useResource(async () => {
    const result = await api.payments.testOrders(paymentId);
    return result.data;
  }, [paymentId]);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      checkout.current?.close();
    };
  }, []);

  async function verify(details) {
    if (!mounted.current) {
      return;
    }

    setBusy(true);
    setError("");
    setPendingVerification(details);

    try {
      const result = await api.payments.verifyTestPayment(paymentId, details);

      if (mounted.current) {
        setMessage(
          `${result.message} Provider status: ${result.data.providerStatus}.`
        );
        setPendingVerification(null);
        resource.refresh();
      }
    } catch (failure) {
      if (mounted.current) {
        setError(
          `${failure.message} You can retry verification below without paying again.`
        );
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  async function startCheckout() {
    setBusy(true);
    setError("");
    setMessage("");
    verificationStarted.current = false;

    try {
      const RazorpayCheckout = await loadRazorpayCheckout();

      if (!mounted.current) {
        return;
      }

      const response = await api.payments.createTestOrder(paymentId);
      const order = response.data;

      if (!mounted.current) {
        return;
      }

      if (!order.keyId?.startsWith("rzp_test_")) {
        throw new Error("Checkout refused a non-test integration key.");
      }

      const instance = new RazorpayCheckout({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: order.name,
        description: order.description,
        theme: { color: "#176b46" },

        handler(result) {
          verificationStarted.current = true;
          verify({
            razorpay_order_id: result.razorpay_order_id,
            razorpay_payment_id: result.razorpay_payment_id,
            razorpay_signature: result.razorpay_signature
          });
        },

        modal: {
          ondismiss() {
            if (mounted.current && !verificationStarted.current) {
              setBusy(false);
              setMessage(
                "Test Checkout closed. The order remains in the history; no farmer payment status changed."
              );
              resource.refresh();
            }
          }
        }
      });

      instance.on("payment.failed", () => {
        if (mounted.current) {
          setError(
            "The sandbox payment attempt failed. Close Checkout or retry using Razorpay test payment details."
          );
        }
      });

      checkout.current = instance;
      instance.open();
    } catch (failure) {
      if (mounted.current) {
        setBusy(false);
        setError(failure.message);
        resource.refresh();
      }
    }
  }

  return (
    <section className="card sandbox-panel">
      <span className="eyebrow">Admin-only optional sandbox</span>
      <h2>Razorpay TEST Checkout</h2>

      <p className="info-note">
        This is a separate simulated collection, not a farmer payout. Its fixed
        demonstration amount comes from the backend. It never changes the procurement
        payment amount or status.
      </p>

      <Alert>{error || resource.error}</Alert>
      <Alert type="success">{message}</Alert>

      {resource.loading && <Loading message="Loading sandbox history…" />}

      {resource.data && (
        <>
          <p>
            Demo amount: <strong>{money(resource.data.demoAmountPaise / 100)}</strong>
          </p>

          {!resource.data.enabled ? (
            <p className="muted">
              Sandbox is disabled. To enable it, configure PAYMENT_MODE=razorpay_test
              and valid TEST credentials in the backend environment, then restart the API.
            </p>
          ) : !eligible ? (
            <p className="muted">
              Complete the booking's procurement before using the separate sandbox demo.
            </p>
          ) : (
            <button
              className="button"
              disabled={busy || Boolean(pendingVerification)}
              onClick={startCheckout}
            >
              {busy ? "Checkout / verification in progress…" : "Open Razorpay TEST Checkout"}
            </button>
          )}

          {pendingVerification && (
            <div className="actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => verify(pendingVerification)}
              >
                Retry backend verification
              </button>
              <p className="muted small">
                Keep this page open until verification succeeds. Do not pay again
                merely because the verification request failed.
              </p>
            </div>
          )}

          <h3>Sandbox order history</h3>
          {resource.data.items.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th><th>Amount</th><th>Status</th>
                    <th>Payment ID</th><th>Verified at</th>
                  </tr>
                </thead>
                <tbody>
                  {[...resource.data.items].reverse().map((order) => (
                    <tr key={order._id}>
                      <td className="token-text">{order.orderId}</td>
                      <td>{money(order.amountPaise / 100)}</td>
                      <td><StatusBadge status={order.status} /></td>
                      <td className="token-text">{order.paymentId || "—"}</td>
                      <td>{formatDateTime(order.verifiedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No sandbox orders for this record.</p>
          )}

          <p className="muted small">
            “Verified” means the backend verified the signature and matching authorized
            or captured test payment. It is not a claim of settlement. Webhooks are not used.
          </p>
        </>
      )}
    </section>
  );
}

async function allCentres() {
  const items = [];
  let page = 1;
  let total = 0;

  do {
    const result = await api.centres.list({
      page,
      limit: 100,
      includeInactive: "true"
    });

    items.push(...result.data.items);
    total = result.data.total;
    page += 1;

    if (!result.data.items.length) {
      break;
    }
  } while (items.length < total);

  return items;
}

const blankCentre = {
  name: "",
  address: "",
  district: "",
  phone: "",
  workingHours: "09:00-17:00 IST",
  crops: "Wheat, Rice",
  latitude: "",
  longitude: "",
  active: true
};

function ManagementTab({ tab }) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [centreFilter, setCentreFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState({});
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const directory = useResource(allCentres);

  const resource = useResource(async () => {
    const base = { page, limit: LIMIT };
    let result;

    if (tab === "farmers") {
      result = await api.admin.farmers({
        ...base,
        search: search || undefined
      });
    } else if (tab === "centres") {
      result = await api.centres.list({
        ...base,
        search: search || undefined,
        includeInactive: "true"
      });
    } else {
      const filters = {
        ...base,
        centreId: centreFilter || undefined,
        date: dateFilter || undefined
      };

      result = tab === "slots"
        ? await api.slots.list({ ...filters, includeInactive: "true" })
        : await api.admin[tab]({
            ...filters,
            status: statusFilter || undefined
          });
    }

    return result.data;
  }, [tab, page, search, centreFilter, dateFilter, statusFilter]);

  function refreshAll() {
    resource.refresh();
    directory.refresh();
  }

  async function perform(operation, closeEditor = false) {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await operation();
      setMessage(result.message);

      if (closeEditor) {
        setEditor(null);
      }

      refreshAll();
    } catch (failure) {
      setError(failure.message);
      resource.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function selectBooking(bookingId) {
    setBusy(true);
    setError("");

    try {
      const result = await api.bookings.get(bookingId);
      setSelectedBooking(result.data);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function selectedChanged() {
    resource.refresh();

    if (selectedBooking) {
      try {
        const result = await api.bookings.get(selectedBooking.booking._id);
        setSelectedBooking(result.data);
      } catch (failure) {
        setError(failure.message);
      }
    }
  }

  function changeField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  }

  function editFarmer(farmer) {
    setEditor({ type: "farmer", id: farmer._id });
    setForm({
      name: farmer.name,
      village: farmer.village || "",
      district: farmer.district || "",
      address: farmer.address || "",
      active: farmer.active
    });
  }

  function editCentre(centre = null) {
    setEditor({ type: "centre", id: centre?._id || "" });
    setForm(centre ? {
      name: centre.name,
      address: centre.address,
      district: centre.district,
      phone: centre.phone,
      workingHours: centre.workingHours,
      crops: centre.crops.join(", "),
      latitude: String(centre.location.coordinates[1]),
      longitude: String(centre.location.coordinates[0]),
      active: centre.active
    } : { ...blankCentre });
  }

  function editSlot(slot = null) {
    setEditor({ type: "slot", id: slot?._id || "" });
    setForm(slot ? {
      centreId: idOf(slot.centre),
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      capacity: String(slot.capacity),
      active: slot.active
    } : {
      centreId: centreFilter || directory.data?.find((centre) => centre.active)?._id || "",
      date: todayIST(),
      startTime: "09:00",
      endTime: "10:00",
      capacity: "12",
      active: true
    });
  }

  function saveEditor(event) {
    event.preventDefault();

    if (editor.type === "farmer") {
      return perform(() => api.admin.updateFarmer(editor.id, form), true);
    }

    if (editor.type === "centre") {
      const payload = {
        name: form.name,
        address: form.address,
        district: form.district,
        phone: form.phone,
        workingHours: form.workingHours,
        crops: form.crops.split(",").map((item) => item.trim()).filter(Boolean),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude)
      };

      return perform(
        () => editor.id
          ? api.centres.update(editor.id, { ...payload, active: form.active })
          : api.centres.create(payload),
        true
      );
    }

    const payload = {
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      capacity: Number(form.capacity)
    };

    return perform(
      () => editor.id
        ? api.slots.update(editor.id, { ...payload, active: form.active })
        : api.slots.create({ ...payload, centreId: form.centreId }),
      true
    );
  }

  const statuses = tab === "bookings"
    ? ["Booked", "Completed", "Cancelled"]
    : tab === "procurements"
      ? ["Booked", "Waiting", "Under Verification", "Procurement Completed"]
      : tab === "payments"
        ? ["Pending", "Processing", "Completed", "Failed"]
        : [];

  const items = resource.data?.items || [];

  return (
    <>
      <Alert>{error || resource.error || directory.error}</Alert>
      <Alert type="success">{message}</Alert>

      <section className="card">
        <div className="filter-bar">
          {["farmers", "centres"].includes(tab) ? (
            <form
              className="filter-bar grow"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(searchInput.trim());
                setPage(1);
              }}
            >
              <label className="grow">
                Search {tab}
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  maxLength={100}
                />
              </label>
              <button className="button secondary">Search</button>
            </form>
          ) : (
            <>
              <label className="grow">
                Centre
                <select
                  value={centreFilter}
                  onChange={(event) => {
                    setCentreFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All centres</option>
                  {(directory.data || []).map((centre) => (
                    <option key={centre._id} value={centre._id}>{centre.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Date {tab === "slots" ? "(blank = upcoming)" : ""}
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(event) => {
                    setDateFilter(event.target.value);
                    setPage(1);
                  }}
                />
              </label>

              {statuses.length > 0 && (
                <label>
                  Status
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All statuses</option>
                    {statuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          {tab === "centres" && (
            <button className="button" onClick={() => editCentre()}>Add centre</button>
          )}
          {tab === "slots" && (
            <button className="button" onClick={() => editSlot()}>Add slot</button>
          )}
          <button className="button secondary" onClick={refreshAll}>Refresh</button>
        </div>
      </section>

      {editor && (
        <section className="card form-page">
          <h2>{editor.id ? "Edit" : "Create"} {editor.type}</h2>

          <form className="form-grid" onSubmit={saveEditor}>
            {editor.type === "farmer" && (
              <>
                <label>
                  Name
                  <input name="name" value={form.name} onChange={changeField} minLength={2} maxLength={80} required />
                </label>
                <label>
                  Village
                  <input name="village" value={form.village} onChange={changeField} maxLength={100} />
                </label>
                <label>
                  District
                  <input name="district" value={form.district} onChange={changeField} maxLength={100} />
                </label>
                <label>
                  Address
                  <input name="address" value={form.address} onChange={changeField} maxLength={250} />
                </label>
                <label className="checkbox-label full-width">
                  <input name="active" type="checkbox" checked={form.active} onChange={changeField} />
                  Account active
                </label>
                <p className="muted small full-width">
                  Explicit account-status changes revoke existing sessions. Historical
                  bookings are retained. Phone, email, role and verification flags
                  cannot be changed through this editor.
                </p>
              </>
            )}

            {editor.type === "centre" && (
              <>
                <label>
                  Centre name
                  <input name="name" value={form.name} onChange={changeField} minLength={3} maxLength={120} required />
                </label>
                <label>
                  District
                  <input name="district" value={form.district} onChange={changeField} minLength={2} maxLength={100} required />
                </label>
                <label className="full-width">
                  Address
                  <input name="address" value={form.address} onChange={changeField} minLength={5} maxLength={250} required />
                </label>
                <label>
                  International phone
                  <input name="phone" type="tel" value={form.phone} onChange={changeField} pattern="\+[1-9][0-9]{7,14}" required />
                </label>
                <label>
                  Working hours description
                  <input name="workingHours" value={form.workingHours} onChange={changeField} minLength={3} maxLength={100} required />
                </label>
                <label>
                  Latitude
                  <input name="latitude" type="number" min="-90" max="90" step="any" value={form.latitude} onChange={changeField} required />
                </label>
                <label>
                  Longitude
                  <input name="longitude" type="number" min="-180" max="180" step="any" value={form.longitude} onChange={changeField} required />
                </label>
                <label className="full-width">
                  Accepted crops, separated by commas
                  <input name="crops" value={form.crops} onChange={changeField} required />
                </label>
                {editor.id && (
                  <label className="checkbox-label full-width">
                    <input name="active" type="checkbox" checked={form.active} onChange={changeField} />
                    Centre active
                  </label>
                )}
                <p className="muted small full-width">
                  Deactivation closes slots and requires outstanding bookings to be
                  resolved. Reactivating a centre does not reopen its slots automatically.
                </p>
              </>
            )}

            {editor.type === "slot" && (
              <>
                <label className="full-width">
                  Centre
                  <select
                    name="centreId"
                    value={form.centreId}
                    onChange={changeField}
                    disabled={Boolean(editor.id)}
                    required
                  >
                    <option value="">Select a centre</option>
                    {(directory.data || []).map((centre) => (
                      <option key={centre._id} value={centre._id}>
                        {centre.name}{centre.active ? "" : " (inactive)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Date
                  <input name="date" type="date" value={form.date} onChange={changeField} required />
                </label>
                <label>
                  Capacity
                  <input name="capacity" type="number" min="1" max="500" step="1" value={form.capacity} onChange={changeField} required />
                </label>
                <label>
                  Start time (IST)
                  <input name="startTime" type="time" value={form.startTime} onChange={changeField} required />
                </label>
                <label>
                  End time (IST)
                  <input name="endTime" type="time" value={form.endTime} onChange={changeField} required />
                </label>
                {editor.id && (
                  <label className="checkbox-label full-width">
                    <input name="active" type="checkbox" checked={form.active} onChange={changeField} />
                    Slot open
                  </label>
                )}
                <p className="muted small full-width">
                  Active slots cannot overlap. Slots with booking history cannot be
                  rescheduled, and capacity cannot be reduced below reserved places.
                </p>
              </>
            )}

            <div className="actions full-width">
              <button className="button" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditor(null)}
                disabled={busy}
              >
                Close editor
              </button>
            </div>
          </form>
        </section>
      )}

      {resource.loading && <Loading message={`Loading ${tab}…`} />}

      {resource.data && (
        <section className="card">
          {!items.length ? (
            <EmptyState title={`No ${tab} found`} />
          ) : (
            <div className="table-wrap">
              <table>
                {tab === "farmers" && (
                  <>
                    <thead>
                      <tr><th>Farmer</th><th>Contact</th><th>Location</th><th>Status</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {items.map((farmer) => (
                        <tr key={farmer._id}>
                          <td>{farmer.name}</td>
                          <td>
                            {farmer.email}
                            <small className="block">{farmer.phone}</small>
                          </td>
                          <td>{farmer.village} / {farmer.district}</td>
                          <td>
                            <StatusBadge status={farmer.active ? "Active" : "Inactive"} />
                            <small className="block">
                              {farmer.verified ? "OTP verified" : "Unverified"}
                              {farmer.isDemo ? " · fictional contact" : ""}
                            </small>
                          </td>
                          <td>
                            <button className="button secondary" onClick={() => editFarmer(farmer)}>
                              Edit account
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {tab === "centres" && (
                  <>
                    <thead>
                      <tr><th>Centre</th><th>District</th><th>Crops</th><th>Status</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {items.map((centre) => (
                        <tr key={centre._id}>
                          <td>
                            {centre.name}
                            <small className="block">{centre.workingHours}</small>
                          </td>
                          <td>{centre.district}</td>
                          <td>{centre.crops.join(", ")}</td>
                          <td><StatusBadge status={centre.active ? "Active" : "Inactive"} /></td>
                          <td>
                            <div className="actions">
                              <button className="button secondary" onClick={() => editCentre(centre)}>Edit</button>
                              <Link className="button secondary" to={`/centres/${centre._id}`}>View</Link>
                              {centre.active && (
                                <button
                                  className="button danger"
                                  disabled={busy}
                                  onClick={() => {
                                    if (window.confirm("Deactivate this centre and close its slots?")) {
                                      perform(() => api.centres.deactivate(centre._id));
                                    }
                                  }}
                                >
                                  Deactivate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {tab === "slots" && (
                  <>
                    <thead>
                      <tr><th>Centre</th><th>Date / time</th><th>Capacity</th><th>Status</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {items.map((slot) => (
                        <tr key={slot._id}>
                          <td>{slot.centre?.name}</td>
                          <td>
                            {formatDate(slot.date)}
                            <small className="block">{slot.startTime}–{slot.endTime} IST</small>
                          </td>
                          <td>{slot.bookedCount} reserved / {slot.capacity}</td>
                          <td><StatusBadge status={slot.active ? "Active" : "Inactive"} /></td>
                          <td>
                            <div className="actions">
                              <button className="button secondary" onClick={() => editSlot(slot)}>Edit</button>
                              {slot.active && (
                                <button
                                  className="button danger"
                                  disabled={busy}
                                  onClick={() => {
                                    if (window.confirm("Close this slot?")) {
                                      perform(() => api.slots.close(slot._id));
                                    }
                                  }}
                                >
                                  Close slot
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {tab === "bookings" && (
                  <>
                    <thead>
                      <tr><th>Farmer / token</th><th>Centre / date</th><th>Booking</th><th>Records</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {items.map((bundle) => (
                        <tr key={bundle.booking._id}>
                          <td>
                            {bundle.booking.farmer?.name}
                            <small className="block token-text">{bundle.token?.number}</small>
                          </td>
                          <td>
                            {bundle.booking.centre?.name}
                            <small className="block">{formatDate(bundle.booking.date)}</small>
                          </td>
                          <td><StatusBadge status={bundle.booking.status} /></td>
                          <td>
                            {bundle.procurement?.status}
                            <small className="block">{bundle.payment?.status}</small>
                          </td>
                          <td>
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={() => selectBooking(bundle.booking._id)}
                            >
                              Manage records
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {["procurements", "payments"].includes(tab) && (
                  <>
                    <thead>
                      <tr><th>Farmer</th><th>Centre / date</th><th>Status</th><th>Details</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {items.map((record) => (
                        <tr key={record._id}>
                          <td>{record.farmer?.name}</td>
                          <td>
                            {record.centre?.name}
                            <small className="block">{formatDate(record.booking?.date)}</small>
                          </td>
                          <td>
                            <StatusBadge status={record.status} />
                            {record.booking?.status === "Cancelled" && (
                              <small className="block">Cancelled booking — history only</small>
                            )}
                          </td>
                          <td>
                            {tab === "payments"
                              ? money(record.amountRupees)
                              : `${record.actualQuantityKg ?? record.booking?.quantityKg ?? 0} kg`}
                          </td>
                          <td>
                            <button
                              className="button secondary"
                              disabled={busy || !record.booking}
                              onClick={() => selectBooking(idOf(record.booking))}
                            >
                              Manage record
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          )}

          <Pagination
            page={page}
            total={resource.data.total}
            limit={LIMIT}
            onChange={setPage}
          />
        </section>
      )}

      {selectedBooking && (
        <section>
          <div className="section-heading">
            <h2>Selected booking and linked records</h2>
            <button className="button secondary" onClick={() => setSelectedBooking(null)}>
              Close selection
            </button>
          </div>

          <Link
            className="button secondary"
            to={`/staff?centreId=${idOf(selectedBooking.booking.centre)}&date=${selectedBooking.booking.date}`}
          >
            Open this centre's queue
          </Link>

          <OperationEditor
            key={selectedBooking.booking._id}
            bookingId={selectedBooking.booking._id}
            onChanged={selectedChanged}
          />

          {selectedBooking.payment && (
            <SandboxCheckout
              key={selectedBooking.payment._id}
              paymentId={selectedBooking.payment._id}
              eligible={
                selectedBooking.booking.active &&
                selectedBooking.booking.status === "Completed"
              }
            />
          )}
        </section>
      )}
    </>
  );
}

export default function AdminManagePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab = TABS.includes(requestedTab) ? requestedTab : "farmers";

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Manage procurement records</h1>
          <p>All changes are validated and saved by the backend.</p>
        </div>
      </section>

      <div className="tab-bar" role="tablist" aria-label="Record categories">
        {TABS.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "active" : ""}
            onClick={() => setSearchParams({ tab: name })}
          >
            {name}
          </button>
        ))}
      </div>

      <ManagementTab key={tab} tab={tab} />
    </>
  );
}