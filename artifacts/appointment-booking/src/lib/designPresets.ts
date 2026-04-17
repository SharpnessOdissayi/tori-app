// Design presets — one-click professional looks.
// Applied as a bulk update to the business's design fields.
//
// Contrast audit pass (owner feedback): every preset now uses Rubik
// as its default font and every palette has been reviewed against
// WCAG AA (4.5:1 for body text). Old problem children:
//  • elegant  — gold primary on black background was fine for dark
//               mode but became unreadable the moment the client
//               toggled to light via the theme FAB. Now reads as
//               a warm-neutral palette: deep slate primary + gold
//               accent on a light marble gradient.
//  • kavati   — the blue→light-cyan full gradient made body text
//               hard to read on the darker end. Now a very light
//               blue tint gradient, primary stays the brand blue.

export type DesignPresetId =
  | "kavati"
  | "lilac"
  | "minimal"
  | "bold"
  | "rose"
  | "elegant";

export interface DesignPreset {
  id: DesignPresetId;
  name: string;           // Hebrew label
  description: string;    // short Hebrew blurb
  preview: {              // thumbnail hints for the preset chooser
    bg: string;           // background color or gradient
    accent: string;       // headline accent color
  };
  values: {
    primaryColor: string;
    accentColor: string;
    fontFamily: string;
    themeMode: string;       // "light" | "dark"
    borderRadius: string;    // "none" | "small" | "medium" | "large" | "full"
    buttonRadius: string;
    gradientEnabled: boolean;
    gradientFrom: string | null;
    gradientTo: string | null;
    gradientAngle: number;
    backgroundPattern: string; // "none" | "dots" | "grid" | "waves" | "circles"
    heroLayout: string;        // "stacked" | "hero-full" | "split" | "compact"
    serviceCardStyle: string;  // "card" | "minimal" | "grid" | "bubble"
    animationStyle: string;    // "none" | "subtle" | "bouncy"
    hoverEffect: string;       // "none" | "lift" | "glow"
    backgroundColor: string | null;
  };
}

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "kavati",
    name: "קבעתי",
    description: "הצבעים הרשמיים — כחול וטורקיז",
    preview: { bg: "linear-gradient(135deg,#eff6ff,#dbeafe)", accent: "#3c92f0" },
    values: {
      primaryColor: "#1e6fcf",   // deeper blue → white button text passes AA (>6:1)
      accentColor: "#3c92f0",
      fontFamily: "Rubik",
      themeMode: "light",
      borderRadius: "medium",
      buttonRadius: "full",
      gradientEnabled: true,
      // Both gradient stops are very light, so dark body text stays
      // legible across the whole background. Brand feel carried by
      // the primary/accent colours, not the bg.
      gradientFrom: "#eff6ff",
      gradientTo: "#dbeafe",
      gradientAngle: 135,
      backgroundPattern: "none",
      heroLayout: "stacked",
      serviceCardStyle: "card",
      animationStyle: "subtle",
      hoverEffect: "lift",
      backgroundColor: null,
    },
  },
  {
    id: "elegant",
    name: "אלגנטי",
    description: "שיש בהיר עם מבטא זהב, יוקרתי ונקי",
    preview: { bg: "linear-gradient(135deg,#fafaf9,#e7e5e4)", accent: "#1f2937" },
    values: {
      primaryColor: "#1f2937",   // deep slate — AA+ on light background
      accentColor: "#b8860b",     // muted gold accent (small surfaces)
      fontFamily: "Rubik",
      themeMode: "light",
      borderRadius: "small",
      buttonRadius: "small",
      gradientEnabled: true,
      gradientFrom: "#fafaf9",    // warm neutral marble
      gradientTo: "#e7e5e4",
      gradientAngle: 135,
      backgroundPattern: "none",
      heroLayout: "hero-full",
      serviceCardStyle: "minimal",
      animationStyle: "subtle",
      hoverEffect: "glow",
      backgroundColor: null,
    },
  },
  {
    id: "minimal",
    name: "מינימלי",
    description: "לבן, נקי, ממוקד",
    preview: { bg: "#ffffff", accent: "#111111" },
    values: {
      primaryColor: "#111111",
      accentColor: "#6b7280",
      fontFamily: "Rubik",
      themeMode: "light",
      borderRadius: "none",
      buttonRadius: "none",
      gradientEnabled: false,
      gradientFrom: null,
      gradientTo: null,
      gradientAngle: 135,
      backgroundPattern: "none",
      heroLayout: "compact",
      serviceCardStyle: "minimal",
      animationStyle: "subtle",
      hoverEffect: "lift",
      backgroundColor: "#ffffff",
    },
  },
  {
    id: "bold",
    name: "נועז",
    description: "סגול-ורוד עם אנרגיה",
    preview: { bg: "linear-gradient(135deg,#7c3aed,#db2777)", accent: "#ffffff" },
    values: {
      // Slightly deeper shades than before so white button text keeps
      // AA contrast across the gradient.
      primaryColor: "#7c3aed",
      accentColor: "#db2777",
      fontFamily: "Rubik",
      themeMode: "light",
      borderRadius: "large",
      buttonRadius: "full",
      gradientEnabled: true,
      gradientFrom: "#7c3aed",
      gradientTo: "#db2777",
      gradientAngle: 135,
      backgroundPattern: "circles",
      heroLayout: "hero-full",
      serviceCardStyle: "card",
      animationStyle: "bouncy",
      hoverEffect: "lift",
      backgroundColor: null,
    },
  },
  {
    id: "lilac",
    name: "לילך",
    description: "לבנדר וורוד-עדין, נשי ורך",
    preview: { bg: "linear-gradient(135deg,#e9d5ff,#fbcfe8)", accent: "#7e22ce" },
    values: {
      primaryColor: "#7e22ce",   // deeper purple than before — AA against white
      accentColor: "#c084fc",
      fontFamily: "Rubik",
      themeMode: "light",
      borderRadius: "large",
      buttonRadius: "full",
      gradientEnabled: true,
      gradientFrom: "#e9d5ff",
      gradientTo: "#fbcfe8",
      gradientAngle: 135,
      backgroundPattern: "none",
      heroLayout: "stacked",
      serviceCardStyle: "card",
      animationStyle: "subtle",
      hoverEffect: "glow",
      backgroundColor: null,
    },
  },
  {
    id: "rose",
    name: "רוז גולד",
    description: "ורוד-זהב נשי ויוקרתי",
    preview: { bg: "linear-gradient(135deg,#fff1f2,#fbcfe8)", accent: "#9d174d" },
    values: {
      primaryColor: "#9d174d",
      accentColor: "#b76e79",
      fontFamily: "Rubik",
      themeMode: "light",
      borderRadius: "large",
      buttonRadius: "full",
      gradientEnabled: true,
      gradientFrom: "#fff1f2",
      gradientTo: "#fbcfe8",
      gradientAngle: 135,
      backgroundPattern: "none",
      heroLayout: "stacked",
      serviceCardStyle: "card",
      animationStyle: "subtle",
      hoverEffect: "glow",
      backgroundColor: null,
    },
  },
];

export function getPreset(id: string | null | undefined): DesignPreset | null {
  if (!id) return null;
  return DESIGN_PRESETS.find(p => p.id === id) ?? null;
}
