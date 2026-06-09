import { useTranslation } from "react-i18next";
import {
  Banknote,
  FileText,
  Hammer,
  Home,
  Landmark,
  Loader2,
  Receipt,
  ScrollText,
  ShieldCheck,
  Upload,
  Wrench,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  HVCard,
  HomeFileCompleteness,
  HVPageHeader,
} from "@/components/homevault";

type LucideIcon = React.ComponentType<
  React.SVGProps<SVGSVGElement> & { className?: string }
>;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  mortgage: Landmark,
  insurance: ShieldCheck,
  taxes: Banknote,
  utilities: Receipt,
  warranties: FileText,
  receipts: ScrollText,
  contractors: Wrench,
  ownership: Home,
  renovations: Hammer,
};

export default function Documents() {
  const { t } = useTranslation();
  const { data, isLoading } = trpc.documents.summary.useQuery();

  // The server returns the categories already in canonical order.
  const ordered = data?.categories ?? [];
  const pct = data?.percentage ?? 0;
  const missingNames = (data?.missing ?? []).map(k =>
    t(`homevault.documentsPage.categories.${k}`)
  );

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
            title={t("homevault.documentsPage.uploadHint")}
            className="flex h-11 items-center gap-1.5 rounded-full bg-hv-primary px-[18px] text-[13px] font-bold text-white opacity-60"
          >
            <Upload className="h-4 w-4" />
            {t("homevault.documentsPage.upload")}
          </button>
        }
      />

      {isLoading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-hv-muted-soft" />
        </div>
      ) : (
        <>
          {/* Home file completeness */}
          <HVCard className="mb-4">
            <HomeFileCompleteness percentage={pct} missing={missingNames} />
            <p className="mt-4 text-[12px] text-hv-muted-soft">
              {t("homevault.documentsPage.coverageNote", {
                done: data?.completedCount ?? 0,
                total: data?.totalCategories ?? 9,
                files: data?.totalFiles ?? 0,
              })}
            </p>
          </HVCard>

          {/* Categories */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map(({ key, count }) => {
              const Icon = CATEGORY_ICONS[key] ?? FileText;
              const empty = count === 0;
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-[var(--hv-radius-lg)] border border-hv-border bg-hv-surface p-4 shadow-[var(--hv-shadow-card)]"
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      empty
                        ? "bg-hv-surface-muted text-hv-muted-soft"
                        : "bg-hv-primary-soft text-hv-primary"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-hv-ink">
                      {t(`homevault.documentsPage.categories.${key}`)}
                    </p>
                    <p
                      className={cn(
                        "text-[12px]",
                        empty ? "text-hv-orange" : "text-hv-muted"
                      )}
                    >
                      {empty
                        ? t("homevault.documentsPage.missing")
                        : t("homevault.documentsPage.fileCount", { count })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
