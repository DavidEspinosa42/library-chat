import { useNavigate } from "react-router";
import type { SessionDto } from "@library-chat/shared";
import { api } from "../lib/api.js";

/**
 * Creates a chat session over the given sources and navigates to it.
 * With `ask` set, the conversation auto-sends that question on arrival
 * (see the `?ask=` handling in the chat page). Throws on failure so each
 * caller keeps its own error UX (toast vs inline alert).
 */
export function useStartChat() {
  const navigate = useNavigate();

  return async (documentIds: string[], ask?: string) => {
    const { session } = await api.post<{ session: SessionDto }>("/api/v1/chat/sessions", {
      documentIds,
    });
    const suffix = ask ? `&ask=${encodeURIComponent(ask)}` : "";
    navigate(`/chat?session=${session.id}${suffix}`);
  };
}
