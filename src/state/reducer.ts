import type {
  CapturedPerson,
  Contact,
  EventItem,
  Interaction,
  PastEvent,
  Settings,
} from "../types";

export type FilterKey = "All" | "Warm" | "Going cold" | "Recent";

export const DEFAULT_SETTINGS: Settings = {
  name: "",
  onboarded: false,
  nudges: true,
  connections: { google: false, outlook: false, linkedin: false, slack: false, imessage: false },
};

export interface AppState {
  contacts: Contact[];
  events: EventItem[];
  past: PastEvent[];
  /** people captured in the current live event, newest first */
  captured: CapturedPerson[];
  filter: FilterKey;
  toast: string;
  settings: Settings;
  /**
   * Bumped whenever the warmth dyad registry changes (for example
   * when stats are loaded or cleared). getDecayRisk reads a module-level
   * registry React cannot observe; memos that consult it must list this
   * revision in their deps or they keep serving pre-load results.
   */
  dyadRev: number;
}

export type Action =
  | { type: "RESET_ACCOUNT" }
  | { type: "HYDRATE"; contacts?: Contact[]; events?: EventItem[]; settings?: Settings }
  | { type: "SET_FILTER"; filter: FilterKey }
  | { type: "ADD_CAPTURED"; person: CapturedPerson }
  | { type: "CLEAR_CAPTURED" }
  | { type: "SAVE_CAPTURED"; eventName: string; at: string }
  | { type: "ADD_INTERACTION"; contactId: string; interaction: Interaction; warmthDelta?: number }
  | {
      type: "UPDATE_CONTACT";
      contactId: string;
      patch: Partial<Pick<Contact, "name" | "role" | "org" | "note" | "email" | "circle" | "circleSource">>;
    }
  | { type: "ADD_CONTACT"; contact: Contact }
  | { type: "ADD_EVENT"; event: EventItem }
  | { type: "REMOVE_EVENT"; id: string }
  | { type: "UPDATE_SETTINGS"; patch: Partial<Settings> }
  | { type: "SHOW_TOAST"; message: string }
  | { type: "CLEAR_TOAST" }
  | { type: "DYAD_STATS_CHANGED" };

// Warmth given to someone you just met, freshly warm.
const JUST_MET_WARMTH = 78;

function clampWarmth(w: number): number {
  return Math.max(0, Math.min(100, w));
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "RESET_ACCOUNT":
      return { contacts: [], events: [], past: [], captured: [], filter: "All",
        toast: "", settings: DEFAULT_SETTINGS, dyadRev: state.dyadRev + 1 };
    case "HYDRATE":
      // Whole-slice replace from persistence; last write wins at this scale.
      return {
        ...state,
        contacts: action.contacts ?? state.contacts,
        events: action.events ?? state.events,
        settings: action.settings
          ? {
              ...DEFAULT_SETTINGS,
              ...action.settings,
              connections: {
                ...DEFAULT_SETTINGS.connections,
                ...action.settings.connections,
              },
            }
          : state.settings,
      };

    case "SET_FILTER":
      return { ...state, filter: action.filter };

    case "ADD_CAPTURED":
      return { ...state, captured: [action.person, ...state.captured] };

    case "CLEAR_CAPTURED":
      return { ...state, captured: [] };

    case "SAVE_CAPTURED": {
      if (state.captured.length === 0) return state;
      // Merge each captured person into the rolodex as a fresh, warm contact.
      const newContacts: Contact[] = state.captured.map((p) => ({
        id: crypto.randomUUID(),
        name: p.name,
        role: "New contact",
        org: "",
        met: action.eventName,
        warmth: JUST_MET_WARMTH,
        // A note typed at capture time beats the generic capture stamp.
        note: p.note || `Captured via ${p.kind} at ${action.eventName}.`,
        init: p.init,
        socials: [],
        lastInteractionAt: action.at,
        interactions: [
          {
            id: `${action.at}-${p.name}`,
            kind: "met",
            at: action.at,
            summary: `You met at ${action.eventName}`,
          },
        ],
      }));
      return {
        ...state,
        contacts: [...newContacts, ...state.contacts],
        captured: [],
      };
    }

    case "ADD_INTERACTION": {
      return {
        ...state,
        contacts: state.contacts.map((c) =>
          c.id === action.contactId
            ? {
                ...c,
                interactions: [...c.interactions, action.interaction],
                lastInteractionAt: action.interaction.at,
                warmth: clampWarmth(c.warmth + (action.warmthDelta ?? 0)),
              }
            : c,
        ),
      };
    }

    case "UPDATE_CONTACT":
      // Inline edits to the card's own fields; warmth/history stay untouched.
      return {
        ...state,
        contacts: state.contacts.map((c) =>
          c.id === action.contactId ? { ...c, ...action.patch } : c,
        ),
      };

    case "ADD_CONTACT":
      // Manual adds go on top, same as fresh captures.
      return { ...state, contacts: [action.contact, ...state.contacts] };

    case "ADD_EVENT": {
      // Idempotent by id: StrictMode may replay the same event.
      if (state.events.some((e) => e.id === action.event.id)) return state;
      return { ...state, events: [...state.events, action.event] };
    }

    case "REMOVE_EVENT":
      return { ...state, events: state.events.filter((e) => e.id !== action.id) };

    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case "SHOW_TOAST":
      return { ...state, toast: action.message };

    case "CLEAR_TOAST":
      return { ...state, toast: "" };
    case "DYAD_STATS_CHANGED":
      return { ...state, dyadRev: state.dyadRev + 1 };

    default:
      return state;
  }
}
