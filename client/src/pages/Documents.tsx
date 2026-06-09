import { useTranslation } from "react-i18next";
import {
  Banknote,
  FileText,
  Hammer,
  Home,
  Landmark,
  Receipt,
  ScrollText,
  ShieldCheck,
  Upload,
  Wrench,
} from "lucide-react";
import {
  HVCard,
  HomeFileCompleteness,
  HVPageHeader,
} from "@/components/homevault";

type LucideIcon = React.ComponentType<
  React.SVGProps<SVGSVGElement> & { className?: string }
>;

// TODO: Documents are not yet backed by the API. This page presents the
// "home file" concept and the category structure so the experience is in place;
// wire each category to real file counts and upload flows when the backend lands.
const CATEGORIES: { key: string; icon: LucideIcon }[] = [
  { key: "mortgage", icon: Landmark },
  { key: "insurance", icon: ShieldCheck },
  { key: "taxes", icon: Banknote },
  { key: "utilities", icon: Receipt },
  { key: "warranties", icon: FileText },
  { key: "receipts", icon: ScrollText },
  { key: "contractors", icon: Wrench },
  { key: "ownership", icon: Home },
  { key: "renovations", icon: Hammer },
];

export default function Documents() {
  const { t } = useTranslation();

  // Placeholder figures until the documents backend exists.
  const homeFilePct = 72;
  const missing = [
    t("homevault.documentsPage.categories.insurance"),
    t("homevault.documentsPage.categories.taxes"),
  ];

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* Header */}
      <HVPageHeader
        title={t("homevault.documentsPage.title")}
        subtitle={t("homevault.documentsPage.subtitle")}
        hideQuickAdd
        actions={
          <button
            type="button"
            disabled
            title={t("homevault.documentsPage.placeholderNote")}
            className="flex h-11 items-center gap-1.5 rounded-full bg-hv-primary px-[18px] text-[13px] font-bold text-white opacity-60"
          >
            <Upload className="h-4 w-4" />
            {t("homevault.documentsPage.upload")}
          </button>
        }
      />

      {/* Home file completeness */}
      <HVCard className="mb-4">
        <HomeFileCompleteness percentage={homeFilePct} missing={missing} />
        <p className="mt-4 text-[12px] text-hv-muted-soft">
          {t("homevault.documentsPage.placeholderNote")}
        </p>
      </HVCard>

      {/* Categories */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map(({ key, icon: Icon }) => (
          <div
            key={key}
            className="flex items-center gap-3 rounded-[var(--hv-radius-lg)] border border-hv-border bg-hv-surface p-4 shadow-[var(--hv-shadow-card)]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hv-primary-soft text-hv-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-hv-ink">
                {t(`homevault.documentsPage.categories.${key}`)}
              </p>
              <p className="text-[12px] text-hv-muted-soft">
                {t("homevault.documentsPage.noFiles")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
