// Design presets — one-click professional looks.
// Applied as a bulk update to the business's design fields.

// Curated list (4 safe presets). The older 10 were removed because the
// high-contrast / dark backgrounds they introduced were making social
// icons (phone / Waze / Instagram / website) invisible on the public
// booking page.
export type DesignPresetId =
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
    id: "elegant",
    name: "אלגנטי",
    description: "זהב ושחור, סטייל יוקרתי",
    preview: { bg: "linear-gradient(135deg,#1a1a1a,#3d2f1a)", accent: "#d4af37" },
    values: {
      primaryColor: "#d4af37",
      accentColor: "#1a1a1a",
      fontFamily: "Playfair Display",
      themeMode: "dark",
      borderRadius: "small",
      buttonRadius: "small",
      gradientEnabled: true,
      gradientFrom: "#1a1a1a",
      gradientTo: "#3d2f1a",
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
      fontFamily: "Inter",
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
    preview: { bg: "linear-gradient(135deg,#8b5cf6,#ec4899)", accent: "#ffffff" },
    values: {
      primaryColor: "#8b5cf6",
      accentColor: "#ec4899",
      fontFamily: "Poppins",
      themeMode: "light",
      borderRadius: "large",
      buttonRadius: "full",
      gradientEnabled: true,
      gradientFrom: "#8b5cf6",
      gradientTo: "#ec4899",
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
    id: "rose",
    name: "רוז גולד",
    description: "ורוד-זהב נשי ויוקרתי",
    preview: { bg: "linear-gradient(135deg,#fdf2f8,#fce7f3)", accent: "#be185d" },
    values: {
      primaryColor: "#be185d",
      accentColor: "#f59e0b",
      fontFamily: "Playfair Display",
      themeMode: "light",
      borderRadius: "large",
      buttonRadius: "full",
      gradientEnabled: true,
      gradientFrom: "#fdf2f8",
      gradientTo: "#fce7f3",
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
