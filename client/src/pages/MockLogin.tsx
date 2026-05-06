import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Mock login page — only rendered when VITE_MOCK_MODE=true.
 * Seeds demo data and redirects to the dashboard.
 */
export default function MockLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seedMock = trpc.data.seedMock.useMutation();
  const ensureProperty = trpc.onboarding.ensureProperty.useMutation();

  const handleDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureProperty.mutateAsync();
      await seedMock.mutateAsync();
      window.location.replace("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-2 text-4xl">🏠</div>
          <CardTitle>HomeVault Demo</CardTitle>
          <CardDescription>
            Load a sample property with mock data to explore the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={handleDemo} disabled={loading} className="w-full">
            {loading ? "Loading demo…" : "Enter Demo"}
          </Button>
          {error && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}
          <p className="text-center text-xs text-muted-foreground">
            This mode is only available when{" "}
            <code className="rounded bg-muted px-1">VITE_MOCK_MODE=true</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
