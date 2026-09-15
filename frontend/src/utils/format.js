export function todayIST(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);

  const read = (type) => parts.find((part) => part.type === type).value;

  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function validDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function formatDate(value) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00+05:30`
      : value
  );

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(parsed);
}

export function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return `${new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed)} IST`;
}

export function money(value = 0) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(Number(value) || 0);
}

export function roleHome(role) {
  if (role === "admin") {
    return "/admin";
  }

  if (role === "staff") {
    return "/staff";
  }

  return "/dashboard";
}

export function idOf(value) {
  return value?._id || value || "";
}

export function queuePositionText(queue) {
  const entry = queue?.entry;

  if (!entry) {
    return "No queue entry";
  }

  if (entry.activeService) {
    return entry.status === "Called"
      ? "Please approach the counter"
      : "Being served";
  }

  if (entry.status === "Waiting") {
    return Number.isInteger(entry.position)
      ? `Waiting position ${entry.position}`
      : "Position unavailable";
  }

  return entry.status;
}

export function validatePassword(value) {
  return (
    value.length >= 8 &&
    new TextEncoder().encode(value).length <= 72 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

export function validObjectId(value) {
  return /^[a-f\d]{24}$/i.test(value || "");
}