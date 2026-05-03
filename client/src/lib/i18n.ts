import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import he from "../locales/he.json";
import paperlessEn from "../locales/paperless.en.json";
import paperlessHe from "../locales/paperless.he.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, ...paperlessEn, nav: { ...en.nav, ...paperlessEn.nav } } },
    he: { translation: { ...he, ...paperlessHe, nav: { ...he.nav, ...paperlessHe.nav } } },
  },
  lng: localStorage.getItem("app-language") ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
