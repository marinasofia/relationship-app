import { Link, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  Users,
  Calendar,
  Sparkles,
  Network,
  BarChart3,
  Settings,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { PeopleScreen } from "./screens/PeopleScreen";
import { AgentScreen } from "./screens/AgentScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { ContactScreen } from "./screens/ContactScreen";
import { EventsScreen } from "./screens/EventsScreen";
import { EventsDeskScreen } from "./screens/desktop/EventsDeskScreen";
import { LiveEventScreen } from "./screens/LiveEventScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TreeScreen } from "./screens/desktop/TreeScreen";
import { ZoneDetailScreen } from "./screens/desktop/ZoneDetailScreen";
import { AnalyticsScreen } from "./screens/desktop/AnalyticsScreen";
import { Toast } from "./components/Toast";
import { useApp } from "./state/AppContext";
import { useIsDesktop } from "./lib/useIsDesktop";
import { BrandLockup, BrandMark } from "./components/BrandMark";
import "./styles/agentWorkspace.css";

// Show the bottom nav on top-level screens. Contact detail and live mode
// take over the full frame.
function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!["/", "/people", "/today", "/events", "/settings"].includes(pathname)) return null;

  const items: Array<{ to: string; icon: LucideIcon; label: string }> = [
    { to: "/", icon: Bot, label: "Agent" },
    { to: "/people", icon: Users, label: "People" },
    { to: "/events", icon: Calendar, label: "Events" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ];
  return (
    <div className="nav">
      {items.map(({ to, icon: Icon, label }) => (
        <button key={to} className={"navb" + (pathname === to ? " on" : "")} onClick={() => navigate(to)}>
          <Icon size={20} /><span>{label}</span>
        </button>
      ))}
    </div>
  );
}

// First run goes to onboarding; everything else needs it done.
function Gate() {
  const { state } = useApp();
  if (!state.settings.onboarded) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}

// Desktop right pane before anything is picked.
function DeskEmpty() {
  return (
    <div className="desk-empty">
      <Sparkles size={22} />
      <div className="desk-empty-h">Your people, one card at a time</div>
      <div className="desk-empty-sub">Pick someone on the left, or open Events to prep.</div>
    </div>
  );
}

function Brandbar() {
  return (
    <Link className="brandbar brand-home-link" to="/" aria-label="Home">
      <BrandLockup size={30} />
      <div className="tagline">Relationships, remembered.</div>
    </Link>
  );
}

// The desktop icon rail: app mark on top, settings pinned to the bottom.
const RAIL_ITEMS: Array<{ to: string; icon: LucideIcon; label: string; also?: string }> = [
  { to: "/", icon: Bot, label: "Agent" },
  { to: "/people", icon: Users, label: "People", also: "/contact/" },
  { to: "/events", icon: Calendar, label: "Events", also: "/event/" },
  { to: "/orbit", icon: Network, label: "Relationship orbit", also: "/orbit/" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
];

function DesktopRail() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isOn = (item: { to: string; also?: string }) =>
    pathname === item.to || (item.also ? pathname.startsWith(item.also) : false);

  return (
    <nav className="rail agent-sidebar" aria-label="Workspace">
      <Link className="rail-mark" to="/" aria-label="Agent home">
        <BrandMark size={29} title="Relationship App" /><span>Relationship App</span>
      </Link>
      <p className="workspace-caption">Your relationship assistant</p>
      <span className="workspace-group">Workspace</span>
      {RAIL_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.to}
            className={"railb" + (isOn(item) ? " on" : "")}
            aria-label={item.label}
            aria-current={isOn(item) ? "page" : undefined}
            onClick={() => navigate(item.to)}
          >
            <Icon size={18} /><span>{item.label}</span>
          </button>
        );
      })}
      <div className="rail-spacer" />
      <p className="workspace-note">Plan your next move.<br />Review what goes out.</p>
      <button
        className={"railb" + (pathname === "/settings" ? " on" : "")}
        aria-label="Settings"
        onClick={() => navigate("/settings")}
      >
        <Settings size={18} /><span>Settings</span>
      </button>
    </nav>
  );
}

// "/people" keeps the familiar two panes: the rolodex stays put on the left,
// the contact card opens beside it.
function PeopleDuo() {
  const { pathname } = useLocation();
  return (
    <div className="desk-center">
      <div className="duo">
        <aside className="pane pane-list">
          <PeopleScreen />
        </aside>
        <main className="pane pane-detail">
          {pathname.startsWith("/contact/") ? <ContactScreen /> : <DeskEmpty />}
        </main>
      </div>
    </div>
  );
}

// Single comfortable pane for the screens that don't need the tree or the duo.
function DeskSolo({ children }: { children: React.ReactNode }) {
  return (
    <div className="desk-center">
      <div className="pane desk-solo">{children}</div>
    </div>
  );
}

export default function App() {
  const { state } = useApp();
  const isDesktop = useIsDesktop();

  // First run matches the device it opens on: desktop gets a clean centered
  // card, mobile gets the full-screen welcome, no phone mock anywhere.
  if (isDesktop && !state.settings.onboarded) {
    return (
      <div className="stage">
        <Brandbar />
        <div className="pane desk-welcome">
          <OnboardingScreen />
        </div>
      </div>
    );
  }

  // Desktop, once onboarded: the agent is home, with a labeled sidebar for
  // everything else, including the orbit. Mobile opens on the agent too.
  if (isDesktop) {
    return (
      <div className="desk">
        <DesktopRail />
        <main className="desk-main">
          <Routes>
            <Route path="/today" element={<TodayScreen />} />
            <Route path="/" element={<AgentScreen />} />
            <Route path="/orbit" element={<TreeScreen />} />
            <Route path="/orbit/:zone" element={<ZoneDetailScreen />} />
            <Route path="/people" element={<PeopleDuo />} />
            <Route path="/contact/:id" element={<PeopleDuo />} />
            <Route path="/events" element={<EventsDeskScreen />} />
            <Route
              path="/event/:id/live"
              element={
                <DeskSolo>
                  <LiveEventScreen />
                </DeskSolo>
              }
            />
            <Route path="/analytics" element={<AnalyticsScreen />} />
            <Route
              path="/settings"
              element={
                <DeskSolo>
                  <SettingsScreen />
                </DeskSolo>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toast />
        </main>
      </div>
    );
  }

  // Mobile: the app IS the screen, edge to edge, safe-area aware, no frame.
  return (
    <div className="mobile-shell">
      <Routes>
        <Route path="/welcome" element={<OnboardingScreen />} />
        <Route element={<Gate />}>
          <Route path="/today" element={<TodayScreen />} />
          <Route path="/people" element={<PeopleScreen />} />
          <Route path="/" element={<AgentScreen />} />
          <Route path="/contact/:id" element={<ContactScreen />} />
          <Route path="/events" element={<EventsScreen />} />
          <Route path="/event/:id/live" element={<LiveEventScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <BottomNav />
      <Toast />
    </div>
  );
}
