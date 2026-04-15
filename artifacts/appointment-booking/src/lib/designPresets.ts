// Design presets — one-click professional looks.
// Applied as a bulk update to the business's design fields.

export type DesignPresetId =
  | "elegant"
  | "minimal"
  | "bold"
  | "spa"
  | "sport"
  | "nature"
  | "dark"
  | "playful"
  | "rose"
  | "ocean"
  | "sunset"
  | "mono"
  | "barbershop"
  | "beauty";

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
    id: "spa",
    name: "ספא",
    description: "פסטל רגוע ומרגיע",
    preview: { bg: "linear-gradient(135deg,#fce7f3,#e0f2fe)", accent: "#ec4899" },
    values: {
      primaryColor: "#db7d8b",
      accentColor: "#a8dadc",
      fontFamily: "Frank Ruhl Libre",
      themeMode: "light",
      borderRadius: "large",
      buttonRadius: "full",
      gradientEnabled: true,
      gradientFrom: "#fce7f3",
      gradientTo: "#e0f2fe",
      gradientAngle: 135,
      backgroundPattern: "dots",
      heroLayout: "stacked",
      serviceCardStyle: "bubble",
      animationStyle: "subtle",
      hoverEffect: "glow",
      backgroundColor: null,
    },
  },
  {
    id: "sport",
    name: "ספורטיבי",
    description: "כחול-כתום אנרגטי",
    preview: { bg: "#0f172a", accent: "#f97316" },
    values: {
      primaryColor: "#f97316",
      accentColor: "#0ea5e9",
      fontFamily: "Rubik",
      themeMode: "dark",
      borderRadius: "medium",
      buttonRadius: "medium",
      gradientEnabled: true,
      gradientFrom: "#0f172a",
      gradientTo: "#1e293b",
      gradientAngle: 180,
      backgroundPattern: "grid",
      heroLayout: "split",
      serviceCardStyle: "grid",
      animationStyle: "bouncy",
      hoverEffect: "lift",
      backgroundColor: null,
    },
  },
  {
    id: "nature",
    name: "טבע",
    description: "ירוק עלים רענן",
    preview: { bg: "linear-gradient(135deg,#dcfce7,#f0fdf4)", accent: "#16a34a" },
    values: {
      primaryColor: "#16a34a",
      accentColor: "#65a30d",
      fontFamily: "Heebo",
      themeMode: "light",
      borderRadius: "medium",
      buttonRadius: "large",
      gradientEnabled: true,
      gradientFrom: "#dcfce7",
      gradientTo: "#f0fdf4",
      gradientAngle: 135,
      backgroundPattern: "waves",
      heroLayout: "stacked",
      serviceCardStyle: "card",
      animationStyle: "subtle",
      hoverEffect: "lift",
      backgroundColor: null,
    },
  },
  {
    id: "dark",
    name: "לילה",
    description: "כהה עם אקצנט ניאון",
    preview: { bg: "#0a0a0a", accent: "#22d3ee" },
    values: {
      primaryColor: "#22d3ee",
      accentColor: "#a855f7",
      fontFamily: "DM Sans",
      themeMode: "dark",
      borderRadius: "medium",
      buttonRadius: "medium",
      gradientEnabled: true,
      gradientFrom: "#0a0a0a",
      gradientTo: "#18181b",
      gradientAngle: 180,
      backgroundPattern: "dots",
      heroLayout: "hero-full",
      serviceCardStyle: "card",
      animationStyle: "subtle",
      hoverEffect: "glow",
      backgroundColor: null,
    },
  },
  {
    id: "playful",
    name: "שובב",
    description: "צבעוני ושמח",
    preview: { bg: "linear-gradient(135deg,#fde68a,#fb7185)", accent: "#8b5cf6" },
    values: {
      primaryColor: "#8b5cf6",
      accentColor: "#fb7185",
      fontFamily: "Nunito",
      themeMode: "light",
      borderRadius: "full",
      buttonRadius: "full",
      gradientEnabled: true,
      gradientFrom: "#fde68a",
      gradientTo: "#fb7185",
      gradientAngle: 135,
      backgroundPattern: "circles",
      heroLayout: "stacked",
      serviceCardStyle: "bubble",
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
  {
    id: "ocean",
    name: "ים",
    description: "כחול-טורקיז רענן",
    preview: { bg: "linear-gradient(135deg,#e0f2fe,#67e8f9)", accent: "#0369a1" },
    values: {
      primaryColor: "#0369a1",
      accentColor: "#06b6d4",
      fontFamily: "Assistant",
      themeMode: "light",
      borderRadius: "medium",
      buttonRadius: "large",
      gradientEnabled: true,
      gradientFrom: "#e0f2fe",
      gradientTo: "#67e8f9",
      gradientAngle: 180,
      backgroundPattern: "waves",
      heroLayout: "hero-full",
      serviceCardStyle: "card",
      animationStyle: "subtle",
      hoverEffect: "lift",
      backgroundColor: null,
    },
  },
  {
    id: "sunset",
    name: "שקיעה",
    description: "כתום-ורוד חם",
    preview: { bg: "linear-gradient(135deg,#fb923c,#f43f5e)", accent: "#ffffff" },
    values: {
      primaryColor: "#ea580c",
      accentColor: "#f43f5e",
      fontFamily: "Rubik",
      themeMode: "light",
      borderRadius: "large",
      buttonRadius: "large",
      gradientEnabled: true,
      gradientFrom: "#fb923c",
      gradientTo: "#f43f5e",
      gradientAngle: 135,
      backgroundPattern: "none",
      heroLayout: "hero-full",
      serviceCardStyle: "card",
      animationStyle: "subtle",
      hoverEffect: "lift",
      backgroundColor: null,
    },
  },
  {
    id: "mono",
    name: "שחור-לבן",
    description: "קונטרסט חד וברור",
    preview: { bg: "#0a0a0a", accent: "#ffffff" },
    values: {
      primaryColor: "#000000",
      accentColor: "#737373",
      fontFamily: "Inter",
      themeMode: "dark",
      borderRadius: "none",
      buttonRadius: "none",
      gradientEnabled: false,
      gradientFrom: null,
      gradientTo: null,
      gradientAngle: 135,
      backgroundPattern: "grid",
      heroLayout: "split",
      serviceCardStyle: "minimal",
      animationStyle: "none",
      hoverEffect: "lift",
      backgroundColor: "#0a0a0a",
    },
  },
  {
    id: "barbershop",
    name: "מספרת גברים",
    description: "בורדו-קרם קלאסי",
    preview: { bg: "linear-gradient(135deg,#1a0e0a,#2b1410)", accent: "#dc2626" },
    values: {
      primaryColor: "#dc2626",
      accentColor: "#fde68a",
      fontFamily: "Playfair Display",
      themeMode: "dark",
      borderRadius: "small",
      buttonRadius: "small",
      gradientEnabled: true,
      gradientFrom: "#1a0e0a",
      gradientTo: "#2b1410",
      gradientAngle: 180,
      backgroundPattern: "grid",
      heroLayout: "split",
      serviceCardStyle: "minimal",
      animationStyle: "subtle",
      hoverEffect: "glow",
      backgroundColor: null,
    },
  },
  {
    id: "beauty",
    name: "יופי וקוסמטיקה",
    description: "לבן-זהב רך ונקי",
    preview: { bg: "linear-gradient(135deg,#fffbeb,#fef3c7)", accent: "#b45309" },
    values: {
      primaryColor: "#b45309",
      accentColor: "#d97706",
      fontFamily: "Frank Ruhl Libre",
      themeMode: "light",
      borderRadius: "large",
      buttonRadius: "full",
      gradientEnabled: true,
      gradientFrom: "#fffbeb",
      gradientTo: "#fef3c7",
      gradientAngle: 135,
      backgroundPattern: "dots",
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
