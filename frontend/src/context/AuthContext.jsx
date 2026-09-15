import React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";


import  { api, tokenStorage } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState("");
  const [bootstrapError, setBootstrapError] = useState("");
  const [restoreRevision, setRestoreRevision] = useState(0);
  const sessionVersion = useRef(0);

  useEffect(() => {
    let alive = true;
    const version = sessionVersion.current;
    const tokenAtStart = tokenStorage.get();

    async function restoreSession() {
      setLoading(true);
      setBootstrapError("");

      if (!tokenAtStart) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const result = await api.users.profile();

        if (
          alive &&
          sessionVersion.current === version &&
          tokenStorage.get() === tokenAtStart
        ) {
          setUser(result.data);
        }
      } catch (error) {
        if (!alive || sessionVersion.current !== version) {
          return;
        }

        if (error.status === 401) {
          setUser(null);
          setSessionMessage("Your session expired. Please log in again.");
        } else {
          setBootstrapError(error.message);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      alive = false;
    };
  }, [restoreRevision]);

  useEffect(() => {
    function handleExpiry() {
      sessionVersion.current += 1;
      tokenStorage.clear();
      setUser(null);
      setBootstrapError("");
      setLoading(false);
      setSessionMessage("Your session expired. Please log in again.");
    }

    window.addEventListener("mandi-live-session-expired", handleExpiry);

    return () => {
      window.removeEventListener("mandi-live-session-expired", handleExpiry);
    };
  }, []);

  const retrySession = useCallback(() => {
    setRestoreRevision((value) => value + 1);
  }, []);

  const clearLocalSession = useCallback(() => {
    sessionVersion.current += 1;
    tokenStorage.clear();
    setUser(null);
    setBootstrapError("");
    setLoading(false);
  }, []);

  const completeLogin = useCallback((result) => {
    if (!result?.token || !result?.user) {
      throw new Error("The login response is incomplete.");
    }

    tokenStorage.set(result.token);
    sessionVersion.current += 1;
    setUser(result.user);
    setBootstrapError("");
    setSessionMessage("");
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    let warning = "";

    try {
      await api.auth.logout();
    } catch (error) {
      warning =
        "The local session was cleared, but server logout could not be confirmed. " +
        error.message;
    } finally {
      sessionVersion.current += 1;
      tokenStorage.clear();
      setUser(null);
      setBootstrapError("");
      setLoading(false);
      setSessionMessage(warning);
    }
  }, []);

  const updateUser = useCallback((updated) => {
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        bootstrapError,
        sessionMessage,
        setSessionMessage,
        retrySession,
        clearLocalSession,
        completeLogin,
        logout,
        updateUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
