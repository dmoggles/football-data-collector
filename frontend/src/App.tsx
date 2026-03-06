import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import "./index.css";
import { getMe, login, logout, register } from "./lib/api";
import type { User } from "./types/auth";

type AuthMode = "login" | "register";

const initialFormState = { email: "", password: "" };

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState(initialFormState.email);
  const [password, setPassword] = useState(initialFormState.password);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const me = await getMe();
        setUser(me);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, []);

  const submitLabel = useMemo(() => {
    if (isSubmitting) {
      return "Working...";
    }
    return mode === "login" ? "Log In" : "Create Account";
  }, [isSubmitting, mode]);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const payload = { email: email.trim().toLowerCase(), password };
      const authenticatedUser = mode === "login" ? await login(payload) : await register(payload);
      setUser(authenticatedUser);
      setPassword("");
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Authentication failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await logout();
      setUser(null);
      setEmail("");
      setPassword("");
      setMode("login");
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Unable to log out");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="page-shell">
        <section className="panel">
          <h1>Football Data Collector</h1>
          <p>Loading session...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="panel">
        <header className="panel-header">
          <div>
            <h1>Football Data Collector</h1>
            <p>Fast match-day collection with account-based workspaces.</p>
          </div>
          {user ? (
            <button className="button secondary" onClick={handleLogout} disabled={isSubmitting}>
              Log Out
            </button>
          ) : null}
        </header>

        {error ? <p className="error-banner">{error}</p> : null}

        {user ? (
          <section className="workspace">
            <p className="muted">Signed in as {user.email}</p>
            <div className="card-grid">
              <article className="card">
                <h2>Teams & Players</h2>
                <p>Create and manage your squads before match day.</p>
              </article>
              <article className="card">
                <h2>Matches</h2>
                <p>Set up fixtures and preload lineups for quick event logging.</p>
              </article>
              <article className="card">
                <h2>Live Console</h2>
                <p>Record goals, shots, cards, and substitutions with match clock support.</p>
              </article>
            </div>
          </section>
        ) : (
          <section className="auth-layout">
            <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
              <button
                className={`toggle ${mode === "login" ? "active" : ""}`}
                onClick={() => setMode("login")}
                type="button"
              >
                Log In
              </button>
              <button
                className={`toggle ${mode === "register" ? "active" : ""}`}
                onClick={() => setMode("register")}
                type="button"
              >
                Register
              </button>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />

              <label htmlFor="password">Password</label>
              <input
                id="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />

              <button className="button primary" disabled={isSubmitting} type="submit">
                {submitLabel}
              </button>
            </form>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
