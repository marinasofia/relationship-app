import { Component, type ReactNode } from "react";

// If any screen throws, show a way out instead of a blank page. Clearing the
// demo's saved choices and reloading brings back the sample data.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  reset = () => {
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("relapp")) window.localStorage.removeItem(key);
      }
      window.sessionStorage.clear();
    } catch {
      // storage may be unavailable; reloading still helps
    }
    window.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ maxWidth: 420, margin: "20vh auto", padding: 24, textAlign: "center", fontFamily: "var(--font-body, system-ui, sans-serif)" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ marginBottom: 16 }}>Resetting the demo clears its saved choices and reloads the sample data.</p>
        <button onClick={this.reset} style={{ padding: "10px 18px", borderRadius: 999, border: "1px solid currentColor", background: "transparent", cursor: "pointer" }}>
          Reset the demo
        </button>
      </div>
    );
  }
}
