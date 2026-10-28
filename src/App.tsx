import { useState } from "react";
import { HashRouter, Link, NavLink, Outlet, Route, Routes } from "react-router-dom";
import { Icon } from "./components/Icon";
import { backend } from "./lib/config";
import { applyUpdate, useUpdateAvailable } from "./lib/pwa";
import { useSyncStatus } from "./lib/sync";
import { AccountPage } from "./pages/AccountPage";
import { CalendarPage } from "./pages/CalendarPage";
import { DayPage } from "./pages/DayPage";
import { HomePage } from "./pages/HomePage";
import { InjuryPage } from "./pages/InjuryPage";
import { LogPage } from "./pages/LogPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";

// Hash routing keeps deep links working from a static host.
export function App() {
  return (
    <HashRouter>
      <UpdateBar />
      <Routes>
        <Route element={<TabLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/log" element={<LogPage />} />
        <Route path="/entries/:entryId" element={<LogPage />} />
        <Route path="/day/:date" element={<DayPage />} />
        <Route path="/injuries/new" element={<InjuryPage />} />
        <Route path="/injuries/:injuryId" element={<InjuryPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Routes>
    </HashRouter>
  );
}

function TabLayout() {
  return (
    <div className="tab-layout">
      <main className="tab-content">
        <SyncBanner />
        <Outlet />
      </main>
      <nav className="tab-bar">
        <NavLink to="/" end>
          <Icon name="home" />
          Week
        </NavLink>
        <NavLink to="/calendar">
          <Icon name="calendar" />
          Calendar
        </NavLink>
        <NavLink to="/stats">
          <Icon name="chart" />
          Stats
        </NavLink>
        <NavLink to="/settings">
          <Icon name="settings" />
          Settings
        </NavLink>
      </nav>
    </div>
  );
}

/** Signed out or a failed sync: say so (logging still works, it just stays on this device for now). */
function SyncBanner() {
  const status = useSyncStatus();
  if (!backend) return null;
  if (status.state === "signed-out") {
    return (
      <div className="sync-banner">
        <span>Saved on this device only.</span>
        <Link className="btn small" to="/account">
          Sign in to sync
        </Link>
      </div>
    );
  }
  if (status.state !== "error") return null;
  return (
    <div className="sync-banner" role="alert">
      <span>
        <strong>Not synced.</strong> {status.error}
      </span>
    </div>
  );
}

/** "New version available" bar, on every screen, until tapped or dismissed. */
function UpdateBar() {
  const available = useUpdateAvailable();
  const [dismissed, setDismissed] = useState(false);
  if (!available || dismissed) return null;
  return (
    <div className="update-bar" role="status">
      <span>New version available</span>
      <button type="button" className="btn small primary" onClick={() => applyUpdate()}>
        Update
      </button>
      <button type="button" className="icon-btn" aria-label="Later" onClick={() => setDismissed(true)}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
