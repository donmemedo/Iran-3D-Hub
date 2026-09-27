const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export const toFa = (s: string | number) =>
  String(s).replace(/\d/g, (d) => FA_DIGITS[+d]);

export function money(value: number, lang: "fa" | "en") {
  const n = Math.round(value).toLocaleString("en-US");
  return lang === "fa" ? toFa(n) : n;
}

export function num(value: number | string, lang: "fa" | "en") {
  return lang === "fa" ? toFa(value) : String(value);
}
