import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./state/AppContext";
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <AppProvider mode="demo">
        <div className="demo-ribbon" role="status">
          <span>Demo with sample contacts. No account, no server.</span>
        </div>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
