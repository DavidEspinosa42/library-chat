import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { UserDto } from "@library-chat/shared";
import { ErrorAlert } from "../components/alert.js";
import { PrimaryButton } from "../components/button.js";
import { api, ApiRequestError } from "../lib/api.js";

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user } = await api.post<{ user: UserDto }>(`/api/v1/auth/${mode}`, {
        email,
        password,
      });
      localStorage.setItem("user", JSON.stringify(user));
      navigate("/library");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper text-ink">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
      >
        <h1 className="font-display text-2xl font-bold tracking-tight">library-chat</h1>
        <p className="mb-5 mt-1 text-sm text-stone-500">
          Chat with your documents. Grounded answers, with citations.
        </p>

        <label className="mb-1 block text-xs font-semibold text-stone-600">Email</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-pine-600 focus:outline-none focus:ring-1 focus:ring-pine-600"
          placeholder="you@example.com"
        />

        <label className="mb-1 block text-xs font-semibold text-stone-600">
          Password {mode === "register" && <span className="font-normal">(min 8 chars)</span>}
        </label>
        <input
          type="password"
          required
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={mode === "register" ? 8 : 1}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-pine-600 focus:outline-none focus:ring-1 focus:ring-pine-600"
          placeholder="••••••••"
        />

        {error && <ErrorAlert className="mb-3">{error}</ErrorAlert>}

        <PrimaryButton type="submit" disabled={loading} className="w-full py-2">
          {loading ? "…" : mode === "login" ? "Log in" : "Create account"}
        </PrimaryButton>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-3 w-full text-center text-xs text-stone-500 hover:text-ink"
        >
          {mode === "login"
            ? "No account yet? Register"
            : "Already have an account? Log in"}
        </button>
      </form>
    </div>
  );
}
