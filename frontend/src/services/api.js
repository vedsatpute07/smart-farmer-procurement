import axios from "axios";

const TOKEN_KEY = "mandi-live-access-token";

export const tokenStorage = {
  get() {
    return sessionStorage.getItem(TOKEN_KEY);
  },
  set(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    sessionStorage.removeItem(TOKEN_KEY);
  }
};

const client = axios.create({
  baseURL: (
    import.meta.env.VITE_API_URL || "http://localhost:5000/api"
  ).replace(/\/+$/, ""),
  timeout: 45000,
  headers: {
    "Content-Type": "application/json"
  }
});

client.interceptors.request.use((config) => {
  const token = tokenStorage.get();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const authorization = error.config?.headers?.Authorization;
    const currentToken = tokenStorage.get();
    const authenticationRequest = error.config?.url?.startsWith("/auth/");

    /*
     * A delayed response from a previous session must not clear a newer login.
     * Invalid public login credentials also must not be treated as expiry of
     * a different session.
     */
    if (
      status === 401 &&
      !authenticationRequest &&
      currentToken &&
      authorization === `Bearer ${currentToken}`
    ) {
      tokenStorage.clear();
      window.dispatchEvent(new Event("mandi-live-session-expired"));
    }

    const message =
      error.response?.data?.message ||
      (
        error.code === "ECONNABORTED"
          ? "The request timed out. Check saved records before retrying an action."
          : !error.response
            ? "Cannot reach the backend. Check the API server and your connection."
            : "The request could not be completed."
      );

    const normalized = new Error(message);
    normalized.status = status;
    normalized.fields = error.response?.data?.errors || [];

    return Promise.reject(normalized);
  }
);

async function request(method, url, { data, params } = {}) {
  const response = await client.request({
    method,
    url,
    data,
    params
  });

  if (!response.data?.success) {
    throw new Error(response.data?.message || "The operation failed.");
  }

  return response.data;
}

const get = (url, params) => request("GET", url, { params });
const post = (url, data = {}) => request("POST", url, { data });
const put = (url, data = {}) => request("PUT", url, { data });
const remove = (url) => request("DELETE", url);

export const api = {
  health: () => get("/health"),
  config: () => get("/config"),

  auth: {
    register: (data) => post("/auth/register", data),
    login: (data) => post("/auth/login", data),
    verifyOtp: (data) => post("/auth/verify-otp", data),
    resendOtp: (challengeId) =>
      post("/auth/resend-otp", { challengeId }),
    logout: () => post("/auth/logout")
  },

  users: {
    profile: () => get("/users/profile"),
    updateProfile: (data) => put("/users/profile", data)
  },

  centres: {
    list: (params) => get("/centres", params),
    nearby: (params) => get("/centres/nearby", params),
    get: (id, params) => get(`/centres/${id}`, params),
    create: (data) => post("/centres", data),
    update: (id, data) => put(`/centres/${id}`, data),
    deactivate: (id) => remove(`/centres/${id}`),
    slots: (centreId, params) =>
      get(`/centres/${centreId}/slots`, params)
  },

  slots: {
    list: (params) => get("/slots", params),
    create: (data) => post("/slots", data),
    update: (id, data) => put(`/slots/${id}`, data),
    close: (id) => remove(`/slots/${id}`)
  },

  bookings: {
    list: (params) => get("/bookings", params),
    get: (id) => get(`/bookings/${id}`),
    create: (data) => post("/bookings", data),
    update: (id, data) => put(`/bookings/${id}`, data),
    cancel: (id) => remove(`/bookings/${id}`)
  },

  tokens: {
    mine: (params) => get("/tokens/my-token", params),
    get: (id) => get(`/tokens/${id}`)
  },

  queue: {
    status: (params) => get("/queue/status", params),
    centre: (centreId, params) => get(`/queue/${centreId}`, params),
    next: (data) => post("/queue/next", data),
    update: (id, status) => put(`/queue/${id}/status`, { status })
  },

  procurements: {
    list: (params) => get("/procurements", params),
    get: (id) => get(`/procurements/${id}`),
    update: (id, data) => put(`/procurements/${id}/status`, data)
  },

  payments: {
    list: (params) => get("/payments", params),
    get: (id) => get(`/payments/${id}`),
    update: (id, data) => put(`/payments/${id}/status`, data),
    testOrders: (id) => get(`/payments/${id}/test-orders`),
    createTestOrder: (id) => post(`/payments/${id}/test-orders`),
    verifyTestPayment: (id, data) =>
      post(`/payments/${id}/verify-test-payment`, data)
  },

  notifications: {
    list: (params) => get("/notifications", params),
    markRead: (id) => put(`/notifications/${id}/read`),
    sendSms: (data) => post("/notifications/send-sms", data)
  },

  admin: {
    dashboard: () => get("/admin/dashboard"),
    stats: () => get("/admin/stats"),
    farmers: (params) => get("/admin/farmers", params),
    updateFarmer: (id, data) => put(`/admin/farmers/${id}`, data),
    bookings: (params) => get("/admin/bookings", params),
    procurements: (params) => get("/admin/procurements", params),
    payments: (params) => get("/admin/payments", params)
  }
};