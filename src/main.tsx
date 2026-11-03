import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/manrope";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/cormorant-garamond/600.css";
import "./styles.css";
import { App } from "./App";
import { applyTheme, readTheme } from "./lib";

// Set before the first paint so the page never flashes the wrong theme.
applyTheme(readTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// Local servers rebuild often, and a cached worker there only serves stale pages, so it is removed.
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  if (local) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  else navigator.serviceWorker.register("/sw.js").catch(() => {});
}
