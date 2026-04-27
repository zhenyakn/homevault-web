import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function Page() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Module</h1>
          <p className="text-muted-foreground mt-2">Coming soon</p>
        </div>
        <Button><Plus className="w-4 h-4 mr-2" /> Add Item</Button>
      </div>
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
