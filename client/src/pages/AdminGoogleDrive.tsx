import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, Cloud } from "lucide-react";
import { toast } from "sonner";

type Status = {
  configured: boolean;
  connected: boolean;
  email: string | null;
};

/**
 * Admin-only Google Drive connection page.
 *
 * Lets the homeowner connect their personal Google account so all file
 * uploads are stored in their own Drive (under HomeVault/uploads/<userId>/).
 * Reads /api/google-drive/status on mount; the Connect button hits the
 * server's redirect endpoint which sends the browser to Google's consent
 * screen. After consent, Google sends the browser back to
 * /api/google-drive/callback, which redirects back here with ?connected=1.
 */
export default function AdminGoogleDrive() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

  async function loadStatus() {
    setLoading(true);
    try {
      const resp = await fetch("/api/google-drive/status");
      if (resp.status === 403) {
        setError("Admin role required to manage Google Drive integration.");
        return;
      }
      if (!resp.ok) {
        setError(`Status request failed (${resp.status})`);
        return;
      }
      const data = (await resp.json()) as Status;
      setStatus(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Failed to load status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void loadStatus();

    // Surface success/error toasts from the OAuth callback redirect.
    const url = new URL(window.location.href);
    const hashQuery = new URLSearchParams(url.hash.split("?")[1] ?? "");
    if (hashQuery.get("connected") === "1") {
      const email = hashQuery.get("email");
      toast.success(email ? `Connected as ${email}` : "Google Drive connected");
      // Clear query so a refresh doesn't repeat the toast.
      navigate("/admin/google-drive", { replace: true });
    } else if (hashQuery.get("error")) {
      toast.error(hashQuery.get("error") || "Failed to connect");
      navigate("/admin/google-drive", { replace: true });
    }
  }, [isAdmin]);

  async function handleDisconnect() {
    if (!confirm("Disconnect Google Drive? Existing uploads will remain reachable.")) return;
    setBusy(true);
    try {
      const resp = await fetch("/api/google-drive/disconnect", { method: "POST" });
      if (!resp.ok) throw new Error(`Disconnect failed (${resp.status})`);
      toast.success("Disconnected");
      await loadStatus();
    } catch (err) {
      toast.error((err as Error).message || "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold">Google Drive</h1>
        <div className="border border-border rounded-lg p-4 text-sm text-muted-foreground">
          Admin role required to manage this integration.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <header className="flex items-center gap-3">
        <Cloud className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Google Drive</h1>
          <p className="text-sm text-muted-foreground">
            Store every attached file in your Google Drive.
          </p>
        </div>
      </header>

      {error && (
        <div className="flex gap-3 border border-destructive/30 bg-destructive/5 text-destructive rounded-lg p-3 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {status && !status.configured && (
        <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium text-amber-800 dark:text-amber-200">
            Google OAuth credentials are not set.
          </p>
          <p className="text-amber-700 dark:text-amber-300">
            Add the following to your <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">.env</code> file and restart the server:
          </p>
          <pre className="text-xs bg-amber-100 dark:bg-amber-900/60 rounded p-2 mt-2 overflow-x-auto">
{`GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3005/api/google-drive/callback`}
          </pre>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Create an OAuth 2.0 Web Application client at{" "}
            <a
              className="underline"
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
            >
              console.cloud.google.com/apis/credentials
            </a>
            . Use the <code>drive.file</code> scope (least-privilege — the app only sees
            files it created).
          </p>
        </div>
      )}

      {status && status.configured && status.connected && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Connected</span>
          </div>
          {status.email && (
            <p className="text-sm">
              Files are stored in{" "}
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                {status.email}
              </span>{" "}
              under <span className="font-mono text-xs">HomeVault/uploads/&lt;userId&gt;/</span>.
            </p>
          )}
          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />}
            Disconnect
          </Button>
        </div>
      )}

      {status && status.configured && !status.connected && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <p className="text-sm">
            Click below to authorise HomeVault to create and manage its own folder in
            your Google Drive. We use the <code>drive.file</code> scope, which means the
            app cannot see any files except those it uploads.
          </p>
          <Button
            onClick={() => {
              window.location.href = "/api/google-drive/connect";
            }}
            disabled={busy}
          >
            Connect Google Drive
          </Button>
        </div>
      )}
    </div>
  );
}
