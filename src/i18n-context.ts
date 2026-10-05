import { createContext } from "react";

export type Lang = "en" | "it";

export interface I18nCtxValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

export const I18nContext = createContext<I18nCtxValue | null>(null);
