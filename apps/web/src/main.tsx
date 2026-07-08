import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AppLayout } from "./app.js";
import { ToastProvider } from "./components/toast.js";
import { ChatPage } from "./pages/chat.js";
import { LibraryPage } from "./pages/library.js";
import { LoginPage } from "./pages/login.js";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/chat" element={<ChatPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/library" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
