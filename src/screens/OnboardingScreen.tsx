import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../state/AppContext";
import { BrandLockup } from "../components/BrandMark";
import "./OnboardingScreen.css";

export function OnboardingScreen() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(state.settings.name);

  const continueProfile = () => {
    dispatch({ type: "UPDATE_SETTINGS", patch: { name: name.trim(), onboarded: true } });
    navigate("/");
  };

  return (
    <div className="screen">
      <div className="scroll">
        <div className="onb-brand-row rise">
          <div className="onb-brand-copy">
            <BrandLockup size={29} />
            <span>Your relationship assistant.</span>
          </div>
        </div>
        <div className="h1 rise rise-1">Welcome</div>
        <div className="sub rise rise-2">
          Meet the agent that helps you prepare, follow through, and stay in touch. It brings you the next steps; you approve every message.
        </div>
        <label className="onb-label rise rise-3" htmlFor="onb-name">What should we call you?</label>
        <input
          id="onb-name"
          className="onb-input rise rise-3"
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && continueProfile()}
        />
        <button className="cta rise rise-4" onClick={continueProfile}>
          Continue <ArrowRight size={16} />
        </button>
        <div className="onb-skip-note">You can change this any time in Settings.</div>
      </div>
    </div>
  );
}
