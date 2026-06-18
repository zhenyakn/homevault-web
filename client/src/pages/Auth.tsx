import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Home, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { EMAIL_NOT_VERIFIED_ERR_MSG } from "@shared/const";

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Read a query param from the hash route, e.g. "#/reset-password?token=abc". */
function hashParam(name: string): string | null {
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const q = hash.indexOf("?");
  if (q === -1) return null;
  return new URLSearchParams(hash.slice(q + 1)).get(name);
}

function errMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return "Something went wrong. Please try again.";
}

// ─── Shared shell ──────────────────────────────────────────────────────────────

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 mb-4 shadow-lg">
            <Home className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">HomeVault</h1>
        </div>
        <div className="bg-card rounded-2xl shadow-sm border p-8 space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-semibold">{title}</h2>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">
            {footer}
          </p>
        )}
      </div>
    </div>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

/** Navigate to the app root and refresh auth state after signing in. */
function useGoHome() {
  const utils = trpc.useUtils();
  return async () => {
    window.location.hash = "#/";
    await utils.auth.me.invalidate();
  };
}

const oauthConfigured = Boolean(
  import.meta.env.VITE_OAUTH_PORTAL_URL && import.meta.env.VITE_APP_ID
);

/**
 * Public deployment flags the signed-out screens need before there's a user:
 * whether open self-registration is offered (standalone defaults closed, SAAS
 * open) and the deployment mode. Until the query resolves we assume signups are
 * off so we never flash a "Create account" affordance that the server rejects.
 */
function usePublicConfig() {
  const { data } = trpc.system.config.useQuery(undefined, {
    retry: 1,
    refetchOnWindowFocus: false,
  });
  return {
    loaded: data !== undefined,
    signupsEnabled: data?.signupsEnabled ?? false,
    appMode: data?.appMode ?? "standalone",
  };
}

// ─── Login ─────────────────────────────────────────────────────────────────────

export function LoginPage() {
  const goHome = useGoHome();
  const { signupsEnabled } = usePublicConfig();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);
  const login = trpc.auth.login.useMutation({
    onSuccess: goHome,
    onError: e => {
      const msg = errMessage(e);
      setError(msg);
      setNeedsVerify(msg.includes(EMAIL_NOT_VERIFIED_ERR_MSG));
    },
  });
  const resend = trpc.auth.resendVerification.useMutation();

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your HomeVault account"
      footer={
        signupsEnabled ? (
          <>
            No account?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Create one
            </Link>
          </>
        ) : undefined
      }
    >
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault();
          setError(null);
          setNeedsVerify(false);
          login.mutate({ email, password: pw });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            required
          />
        </div>
        <FieldError message={error} />
        {needsVerify &&
          (resend.isSuccess ? (
            <p className="text-sm text-muted-foreground">
              Verification email sent. Check your inbox.
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={resend.isPending || !email}
              onClick={() => resend.mutate({ email })}
            >
              {resend.isPending && (
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
              )}
              Resend verification email
            </Button>
          ))}
        <Button
          type="submit"
          className="w-full h-11"
          disabled={login.isPending}
        >
          {login.isPending ? (
            <Loader2 className="w-4 h-4 me-2 animate-spin" />
          ) : (
            <LogIn className="w-4 h-4 me-2" />
          )}
          Sign in
        </Button>
      </form>

      {oauthConfigured && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
          >
            Continue with single sign-on
          </Button>
        </>
      )}

      {import.meta.env.DEV && (
        <Button
          variant="ghost"
          className="w-full"
          onClick={async () => {
            await fetch("api/dev/login", { method: "POST" });
            window.location.reload();
          }}
        >
          Dev login
        </Button>
      )}
    </AuthShell>
  );
}

// ─── Register ──────────────────────────────────────────────────────────────────

export function RegisterPage() {
  const goHome = useGoHome();
  const { loaded, signupsEnabled } = usePublicConfig();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const register = trpc.auth.register.useMutation({
    onSuccess: goHome,
    onError: e => setError(errMessage(e)),
  });

  // Open self-registration is gated server-side; mirror that here so the form
  // isn't offered when it's closed. Invited users join via /accept-invite, which
  // works regardless of this flag.
  if (loaded && !signupsEnabled) {
    return (
      <AuthShell
        title="Registration closed"
        subtitle="New sign-ups aren't being accepted right now"
        footer={
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-center text-muted-foreground">
          If you were invited to a workspace, open the link in your invitation
          email to join.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start managing your property in minutes"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault();
          setError(null);
          register.mutate({
            email,
            password: pw,
            name: name || undefined,
            tenantName: tenantName || undefined,
          });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            required
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">
            At least 8 characters.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="workspace">Workspace name</Label>
          <Input
            id="workspace"
            placeholder="e.g. The Smith Household"
            value={tenantName}
            onChange={e => setTenantName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Optional — we'll name one for you if left blank. You can invite
            others to it later.
          </p>
        </div>
        <FieldError message={error} />
        <Button
          type="submit"
          className="w-full h-11"
          disabled={register.isPending}
        >
          {register.isPending && (
            <Loader2 className="w-4 h-4 me-2 animate-spin" />
          )}
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

// ─── Forgot password ───────────────────────────────────────────────────────────

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const req = trpc.auth.requestPasswordReset.useMutation();

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to choose a new password"
      footer={
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {req.isSuccess ? (
        <p className="text-sm text-center text-muted-foreground">
          If an account exists for <strong>{email}</strong>, a reset link is on
          its way. Check your inbox.
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            req.mutate({ email });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full h-11"
            disabled={req.isPending}
          >
            {req.isPending && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

// ─── Reset password ────────────────────────────────────────────────────────────

export function ResetPasswordPage() {
  const token = useMemo(() => hashParam("token"), []);
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reset = trpc.auth.resetPassword.useMutation({
    onError: e => setError(errMessage(e)),
  });

  return (
    <AuthShell
      title="Choose a new password"
      footer={
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {!token ? (
        <p className="text-sm text-center text-destructive">
          This reset link is missing its token.
        </p>
      ) : reset.isSuccess ? (
        <p className="text-sm text-center text-muted-foreground">
          Your password has been updated. You can now sign in.
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            setError(null);
            reset.mutate({ token, password: pw });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <FieldError message={error} />
          <Button
            type="submit"
            className="w-full h-11"
            disabled={reset.isPending}
          >
            {reset.isPending && (
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
            )}
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

// ─── Verify email ──────────────────────────────────────────────────────────────

export function VerifyEmailPage() {
  const token = useMemo(() => hashParam("token"), []);
  const verify = trpc.auth.verifyEmail.useMutation();

  useEffect(() => {
    if (token) verify.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthShell
      title="Email verification"
      footer={
        <Link href="/" className="text-primary hover:underline">
          Continue to HomeVault
        </Link>
      }
    >
      <p className="text-sm text-center text-muted-foreground">
        {!token
          ? "This verification link is missing its token."
          : verify.isPending
            ? "Verifying your email…"
            : verify.isSuccess
              ? "Your email is verified. Thanks!"
              : "This verification link is invalid or has expired."}
      </p>
    </AuthShell>
  );
}

// ─── Accept invite ─────────────────────────────────────────────────────────────

export function AcceptInvitePage() {
  const goHome = useGoHome();
  const token = useMemo(() => hashParam("token"), []);
  const info = trpc.tenant.inviteInfo.useQuery(
    { token: token ?? "" },
    { enabled: Boolean(token), retry: false }
  );
  const [mode, setMode] = useState<"register" | "login">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const register = trpc.auth.register.useMutation({
    onSuccess: goHome,
    onError: e => setError(errMessage(e)),
  });
  const accept = trpc.tenant.invites.accept.useMutation({
    onSuccess: goHome,
    onError: e => setError(errMessage(e)),
  });
  // Existing users: sign in first, then accept the invite with the same token.
  const login = trpc.auth.login.useMutation({
    onSuccess: () => token && accept.mutate({ token }),
    onError: e => setError(errMessage(e)),
  });

  const busy = register.isPending || login.isPending || accept.isPending;

  if (!token) {
    return (
      <AuthShell title="Invitation">
        <p className="text-sm text-center text-destructive">
          This invite link is missing its token.
        </p>
      </AuthShell>
    );
  }

  if (info.isLoading) {
    return (
      <AuthShell title="Invitation">
        <div className="flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AuthShell>
    );
  }

  if (!info.data) {
    return (
      <AuthShell
        title="Invitation"
        footer={
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-center text-destructive">
          This invitation is invalid or has expired.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Join ${info.data.tenantName}`}
      subtitle={`You've been invited as ${info.data.role}.`}
      footer={
        mode === "register" ? (
          <button
            className="text-primary hover:underline"
            onClick={() => setMode("login")}
          >
            Already have an account? Sign in to accept
          </button>
        ) : (
          <button
            className="text-primary hover:underline"
            onClick={() => setMode("register")}
          >
            New here? Create an account to accept
          </button>
        )
      }
    >
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault();
          setError(null);
          if (mode === "register") {
            register.mutate({
              email,
              password: pw,
              name: name || undefined,
              inviteToken: token,
            });
          } else {
            login.mutate({ email, password: pw });
          }
        }}
      >
        {mode === "register" && (
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            value={pw}
            onChange={e => setPw(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <FieldError message={error} />
        <Button type="submit" className="w-full h-11" disabled={busy}>
          {busy && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
          {mode === "register" ? "Create account & join" : "Sign in & join"}
        </Button>
      </form>
    </AuthShell>
  );
}
