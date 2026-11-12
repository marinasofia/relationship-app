import { useState } from "react";
import { ChevronLeft, Info, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp, clearAllData } from "../state/AppContext";
import { BrandMark } from "../components/BrandMark";
import "./SettingsScreen.css";

export function SettingsScreen() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [armed, setArmed] = useState(false);

  const reset = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    void clearAllData();
  };

  return (
    <div className="screen">
      <div className="scroll">
        <button className="back rise" onClick={() => navigate("/")}>
          <ChevronLeft size={20} /> Home
        </button>
        <div className="screen-brand-title rise"><BrandMark size={23} /><div className="h1">Settings</div></div>
        <div className="sub rise">This demo runs on sample contacts in your browser.</div>

        <div className="sec-label rise rise-1">About this demo</div>
        <div className="set-hint rise rise-1">
          <Info size={15} />
          There are no accounts and no connections. Changes last until you reload the page.
        </div>

        <div className="sec-label rise rise-2" style={{ marginTop: 18 }}>
          You
        </div>
        <input
          className="set-input rise rise-2"
          placeholder="Your name"
          value={state.settings.name}
          onChange={(e) =>
            dispatch({ type: "UPDATE_SETTINGS", patch: { name: e.target.value } })
          }
        />

        <div className="sec-label rise rise-4" style={{ marginTop: 18 }}>
          Nudges
        </div>
        <div className="set-row rise rise-4">
          <div className="set-row-label">Smart nudges during events</div>
          <button
            className={"set-toggle" + (state.settings.nudges ? " on" : "")}
            onClick={() =>
              dispatch({ type: "UPDATE_SETTINGS", patch: { nudges: !state.settings.nudges } })
            }
          >
            {state.settings.nudges ? "On" : "Off"}
          </button>
        </div>

        <div className="sec-label rise rise-5" style={{ marginTop: 18 }}>
          Sample data
        </div>
        <button className={"set-delete rise rise-5" + (armed ? " armed" : "")} onClick={reset}>
          <RotateCcw size={15} />
          {armed ? "Tap again to reset the demo" : "Reset the demo"}
        </button>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
