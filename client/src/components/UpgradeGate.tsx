import { useLocation } from "wouter";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@/components/ui/empty";
import { useCapabilities, type CapabilityKey } from "@/hooks/useCapabilities";

/** Inline banner nudging the user to upgrade for a gated feature. */
export function UpgradeNotice({
  title = "Upgrade to unlock this feature",
  description = "This feature isn't included in your current plan.",
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  const [, navigate] = useLocation();
  return (
    <Alert className={className}>
      <Sparkles className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>{description}</span>
        <Button size="sm" onClick={() => navigate("/plan")}>
          View plans
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** Full-area empty state for page-level gating. */
export function UpgradeEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const [, navigate] = useLocation();
  return (
    <Empty className="border min-h-[50vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Lock className="size-6" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => navigate("/plan")}>View plans</Button>
      </EmptyContent>
    </Empty>
  );
}

/**
 * Renders `children` when the tenant is entitled to `capability`; otherwise the
 * `fallback` (defaults to an inline upgrade notice). Optimistic while the
 * capability query loads, so entitled users never see a flash.
 */
export function FeatureGate({
  capability,
  children,
  fallback,
}: {
  capability: CapabilityKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { has } = useCapabilities();
  if (has(capability)) return <>{children}</>;
  return <>{fallback ?? <UpgradeNotice />}</>;
}
