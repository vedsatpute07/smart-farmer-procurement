const { AppError } = require("./errors");

const TIME_ZONE = "Asia/Kolkata";

function todayIST(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);

  const read = (type) => parts.find((part) => part.type === type).value;

  return `${read("year")}-${read("month")}-${read("day")}`;
}

function isValidDateString(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isValidTime(value) {
  return (
    typeof value === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  );
}

function slotInstant(date, time) {
  if (!isValidDateString(date) || !isValidTime(time)) {
    throw new AppError(400, "Invalid slot date or time.");
  }

  return new Date(`${date}T${time}:00+05:30`);
}

function assertSlotTimes(date, startTime, endTime) {
  if (
    !isValidDateString(date) ||
    !isValidTime(startTime) ||
    !isValidTime(endTime) ||
    startTime >= endTime
  ) {
    throw new AppError(
      400,
      "Provide a valid date and an end time later than the start time."
    );
  }
}

function assertSlotBookable(slot) {
  if (!slot.active) {
    throw new AppError(409, "This slot is closed.");
  }

  if (slotInstant(slot.date, slot.endTime).getTime() <= Date.now()) {
    throw new AppError(409, "This slot has already ended.");
  }

  if (slot.bookedCount >= slot.capacity) {
    throw new AppError(409, "Slot is no longer available.");
  }
}

function addDays(dateString, numberOfDays) {
  if (!isValidDateString(dateString) || !Number.isInteger(numberOfDays)) {
    throw new AppError(400, "Invalid date calculation.");
  }

  const value = new Date(`${dateString}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + numberOfDays);

  return value.toISOString().slice(0, 10);
}

module.exports = {
  TIME_ZONE,
  todayIST,
  isValidDateString,
  isValidTime,
  slotInstant,
  assertSlotTimes,
  assertSlotBookable,
  addDays
};