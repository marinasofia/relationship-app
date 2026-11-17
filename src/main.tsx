import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./state/AppContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "./styles/tokens.css";
import "./styles/global.css";

// This build only runs the demo: sample contacts in the browser, no account or server.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

// Pages cannot send frame-ancestors, so a framed copy never renders the app: it only offers to open it in its own tab.
const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();

const root = ReactDOM.createRoot(document.getElementById("root")!);

if (framed) {
  root.render(
    <p className="framed-notice">
      This demo only runs in its own tab. <a href={window.location.href} target="_blank" rel="noopener noreferrer">Open it</a>
    </p>,
  );
} else root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <AppProvider mode="demo">
          <div className="demo-ribbon" role="status">
            <span>Demo with sample contacts. No account, no server.</span>
          </div>
          <App />
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
