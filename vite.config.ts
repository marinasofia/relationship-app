import { configDefaults, defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

// The built app loads nothing from other sites, so it can ship a strict
// Content Security Policy. Only the production build gets it: the dev server
// injects inline scripts for hot reload.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const contentSecurityPolicy = (): Plugin => ({
  name: "content-security-policy",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
    { tag: "meta", attrs: { name: "referrer", content: "no-referrer" }, injectTo: "head-prepend" },
  ],
});

// BASE_PATH lets the same build serve from a GitHub Pages project path.
// It is written into the HTML, so only a plain path like /relationship-app/ is accepted.
const base = process.env.BASE_PATH ?? "/";
if (!/^\/[A-Za-z0-9._/-]*\/$|^\/$/.test(base) || base.includes("..")) {
  throw new Error(`BASE_PATH must be a plain path like /relationship-app/, got ${JSON.stringify(base)}`);
}

export default defineConfig({
  base,
  plugins: [react(), contentSecurityPolicy()],
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude],
  },
});
