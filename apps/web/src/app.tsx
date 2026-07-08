import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { api } from "./lib/api.js";

export function getStoredUser(): { email: string } | null {
  try {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as { email: string }) : null;
  } catch {
    return null;
  }
}

/** Layout + client-side auth hint. The cookie is the real auth — 401s redirect. */
export function AppLayout() {
  const user = getStoredUser();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return <Navigate to="/login" replace />;

  const tab = (path: string, label: string) => (
    <Link
      to={path}
      className={`border-b-2 px-1 pb-1 text-sm font-semibold ${
        location.pathname.startsWith(path)
          ? "border-pine-700 text-ink"
          : "border-transparent text-stone-500 hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          {tab("/library", "Library")}
          {tab("/chat", "Chat")}
          <div className="ml-auto flex items-center gap-3 text-sm text-stone-500">
            <span>{user.email}</span>
            <button
              onClick={async () => {
                await api.post("/api/v1/auth/logout");
                localStorage.removeItem("user");
                navigate("/login");
              }}
              className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
