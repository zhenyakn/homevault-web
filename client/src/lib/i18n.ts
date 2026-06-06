import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import he from "../locales/he.json";
import ru from "../locales/ru.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
    ru: { translation: ru },
  },
  lng: localStorage.getItem("app-language") ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
