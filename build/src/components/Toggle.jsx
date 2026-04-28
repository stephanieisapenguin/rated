import { W } from "../theme";

// iOS-style switch. 44×26 capsule with a 20×20 circular knob that slides
// between left (off) and right (on). Background flips from border-gray to
// accent. Used in NotificationSettings + the Privacy section of Settings.
export const Toggle = ({ on, onToggle }) => (
  <div onClick={onToggle}
    style={{
      width: 44, height: 26, borderRadius: 13,
      background: on ? W.accent : W.border,
      position: "relative", cursor: "pointer",
      transition: "background 0.2s", flexShrink: 0,
    }}>
    <div style={{
      width: 20, height: 20, borderRadius: "50%", background: "#fff",
      position: "absolute", top: 3, left: on ? 21 : 3,
      transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
    }}/>
  </div>
);
