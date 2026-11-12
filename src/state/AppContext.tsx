import {
  createContext,
  useContext,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { reducer, DEFAULT_SETTINGS, type Action, type AppState } from "./reducer";
import { CONTACTS } from "../data/contacts";
import { EVENTS, PAST } from "../data/events";
import type { AppMode } from "../runtime";

// The demo holds everything in memory. Edits last until the page reloads.
function initialState(): AppState {
  return {
    contacts: CONTACTS,
    events: EVENTS,
    past: PAST,
    captured: [],
    filter: "All",
    toast: "",
    settings: {
      ...DEFAULT_SETTINGS,
      name: "Demo",
      onboarded: true,
    },
    dyadRev: 0,
  };
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  /** convenience: fire a toast that clears itself */
  flash: (message: string) => void;
  /** true for the sample data demo */
  demo: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  mode = "demo",
}: {
  children: ReactNode;
  mode?: AppMode;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const toastTimer = useRef<number | undefined>(undefined);

  const flash = (message: string) => {
    dispatch({ type: "SHOW_TOAST", message });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(
      () => dispatch({ type: "CLEAR_TOAST" }),
      2200,
    );
  };

  return (
    <AppContext.Provider value={{ state, dispatch, flash, demo: mode === "demo" }}>
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

/** Reset the demo to its sample data. */
// eslint-disable-next-line react-refresh/only-export-components
export async function clearAllData(): Promise<void> {
  window.location.reload();
}
