import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type Language = "en" | "he" | "ru";

const SUPPORTED: Language[] = ["en", "he", "ru"];

function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && SUPPORTED.includes(value as Language);
}

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  isRTL: false,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const persistLanguage = trpc.profiles.setLanguage.useMutation();

  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem("app-language");
    return isLanguage(stored) ? stored : "en";
  });

  const isRTL = language === "he";

  useEffect(() => {
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [isRTL, language]);

  const apply = (lang: Language) => {
    localStorage.setItem("app-language", lang);
    setLanguageState(lang);
    i18n.changeLanguage(lang);
  };

  // One-time reconciliation with the server once the user is known:
  // - a stored server preference wins (so a language picked on one device
  //   follows the user to another, and notifications match the UI);
  // - if the server has no usable preference yet, back-fill it from the
  //   local choice so notifications aren't stuck on the default.
  const reconciled = useRef(false);
  useEffect(() => {
    if (reconciled.current) return;
    if (!isAuthenticated || !user) return;
    reconciled.current = true;

    const serverLang = (user as { language?: string | null }).language;
    if (isLanguage(serverLang)) {
      if (serverLang !== language) apply(serverLang);
    } else {
      persistLanguage.mutate({ language });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  const setLanguage = (lang: Language) => {
    apply(lang);
    if (isAuthenticated) {
      persistLanguage.mutate({ language: lang });
      // Keep the cached user in sync so reconciliation never reverts the choice.
      utils.auth.me.setData(undefined, prev =>
        prev ? { ...prev, language: lang } : prev
      );
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
