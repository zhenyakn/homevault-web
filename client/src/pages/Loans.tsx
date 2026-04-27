import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Coming Soon</h1>
      <Card>
        <CardHeader>
          <CardTitle>Feature Under Development</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">This feature is currently being developed.</p>
        </CardContent>
      </Card>
    </div>
  );
}
