import { trpc } from "@/lib/trpc";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Calendar,
  DollarSign,
  Home,
  Layers,
  MapPin,
  ParkingSquare,
  Ruler,
  Warehouse,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

function StatRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground flex-1">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function PropertyDashboard() {
  const { t } = useTranslation();
  const { data: property, isLoading } = trpc.property.get.useQuery();

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <Home className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{t("property.notFound", "No property found")}</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          {t("property.notFoundDesc", "Go to Settings to configure your property details.")}
        </p>
        <Button asChild variant="default">
          <Link href="/settings">{t("nav.settings", "Settings")}</Link>
        </Button>
      </div>
    );
  }

  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: property.currencyCode ?? "ILS",
    maximumFractionDigits: 0,
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {property.houseNickname ?? property.houseName}
          </h1>
          {property.address && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <MapPin className="h-3.5 w-3.5" />
              {property.address}
            </p>
          )}
        </div>
        {property.propertyType && (
          <Badge variant="secondary" className="shrink-0">
            {property.propertyType}
          </Badge>
        )}
      </div>

      {/* Key details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("property.details", "Property Details")}</CardTitle>
        </CardHeader>
        <CardContent>
          <StatRow icon={Calendar} label={t("property.purchaseDate", "Purchase Date")} value={property.purchaseDate} />
          <StatRow
            icon={DollarSign}
            label={t("property.purchasePrice", "Purchase Price")}
            value={property.purchasePrice ? formatter.format(property.purchasePrice) : null}
          />
          <StatRow icon={Ruler} label={t("property.size", "Size")} value={property.squareMeters ? `${property.squareMeters} m²` : null} />
          <StatRow icon={Layers} label={t("property.rooms", "Rooms")} value={property.rooms} />
          <StatRow icon={Building2} label={t("property.floor", "Floor")} value={property.floor} />
          <StatRow icon={Calendar} label={t("property.yearBuilt", "Year Built")} value={property.yearBuilt} />
          <StatRow icon={ParkingSquare} label={t("property.parking", "Parking Spots")} value={property.parkingSpots} />
          <StatRow
            icon={Warehouse}
            label={t("property.storage", "Storage")}
            value={property.hasStorage != null ? (property.hasStorage ? t("common.yes", "Yes") : t("common.no", "No")) : null}
          />
        </CardContent>
      </Card>

      {/* Quick action */}
      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link href="/settings">{t("property.editSettings", "Edit in Settings")}</Link>
        </Button>
      </div>
    </div>
  );
}
