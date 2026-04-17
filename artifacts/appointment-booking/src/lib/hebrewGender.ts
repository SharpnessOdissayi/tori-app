// Hebrew gendered-form picker. Almost every direct address in the UI
// ("ברוך/ה הבא/ה", "שמור/שמרי", "הצטרפת") needs a masculine or feminine
// form; "other" falls back to masculine per owner preference.
//
// Usage:
//   g(gender, "ברוך הבא", "ברוכה הבאה")   → picks based on gender
//   g(gender, "שמור")                       → feminine defaults to masc
//
// Pass the gender string straight from the session / profile row.

export type Gender = "male" | "female" | "other" | string | null | undefined;

export function g(gender: Gender, male: string, female?: string): string {
  return gender === "female" ? (female ?? male) : male;
}

// Shorthand factory — useful when you're picking many forms in one
// component. Pre-binds the gender so each call-site reads g("m", "f").
export function makeG(gender: Gender) {
  return (male: string, female?: string) => g(gender, male, female);
}
