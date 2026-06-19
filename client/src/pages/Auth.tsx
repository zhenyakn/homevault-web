import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      title={t("auth.welcomeBack")}
      subtitle={t("auth.signInSubtitle")}
      footer={
        signupsEnabled ? (
          <>
            {t("auth.noAccount")}{" "}
            <Link href="/register" className="text-primary hover:underline">
              {t("auth.createOne")}
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
          <Label htmlFor="email">{t("common.email")}</Label>
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
            <Label htmlFor="password">{t("common.password")}</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:underline"
            >
              {t("auth.forgotPassword")}
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
              {t("auth.verificationSent")}
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
              {t("auth.resendVerification")}
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
          {t("auth.signIn")}
        </Button>
      </form>

      {oauthConfigured && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                {t("auth.or")}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
          >
            {t("auth.continueSso")}
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
          {t("auth.devLogin")}
        </Button>
      )}
    </AuthShell>
  );
}

// ─── Register ──────────────────────────────────────────────────────────────────

export function RegisterPage() {
  const { t } = useTranslation();
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
        title={t("auth.registrationClosed")}
        subtitle={t("auth.registrationClosedSubtitle")}
        footer={
          <Link href="/login" className="text-primary hover:underline">
            {t("auth.backToSignIn")}
          </Link>
        }
      >
        <p className="text-sm text-center text-muted-foreground">
          {t("auth.invitedJoinHint")}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth.createAccount")}
      subtitle={t("auth.registerSubtitle")}
      footer={
        <>
          {t("auth.alreadyHaveAccount")}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {t("auth.signIn")}
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
          <Label htmlFor="name">{t("auth.yourName")}</Label>
          <Input
            id="name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("common.email")}</Label>
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
          <Label htmlFor="password">{t("common.password")}</Label>
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
            {t("auth.passwordMin")}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="workspace">{t("auth.workspaceName")}</Label>
          <Input
            id="workspace"
            placeholder={t("auth.workspacePlaceholder")}
            value={tenantName}
            onChange={e => setTenantName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("auth.workspaceHint")}
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
          {t("auth.createAccountBtn")}
        </Button>
      </form>
    </AuthShell>
  );
}

// ─── Forgot password ───────────────────────────────────────────────────────────

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const req = trpc.auth.requestPasswordReset.useMutation();

  return (
    <AuthShell
      title={t("auth.resetPassword")}
      subtitle={t("auth.resetSubtitle")}
      footer={
        <Link href="/login" className="text-primary hover:underline">
          {t("auth.backToSignIn")}
        </Link>
      }
    >
      {req.isSuccess ? (
        <p className="text-sm text-center text-muted-foreground">
          {t("auth.resetLinkSent", { email })}
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
            <Label htmlFor="email">{t("common.email")}</Label>
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
            {t("auth.sendResetLink")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

// ─── Reset password ────────────────────────────────────────────────────────────

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const token = useMemo(() => hashParam("token"), []);
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reset = trpc.auth.resetPassword.useMutation({
    onError: e => setError(errMessage(e)),
  });

  return (
    <AuthShell
      title={t("auth.chooseNewPassword")}
      footer={
        <Link href="/login" className="text-primary hover:underline">
          {t("auth.backToSignIn")}
        </Link>
      }
    >
      {!token ? (
        <p className="text-sm text-center text-destructive">
          {t("auth.resetMissingToken")}
        </p>
      ) : reset.isSuccess ? (
        <p className="text-sm text-center text-muted-foreground">
          {t("auth.passwordUpdated")}
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
            <Label htmlFor="password">{t("auth.newPassword")}</Label>
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
            {t("auth.updatePassword")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

// ─── Verify email ──────────────────────────────────────────────────────────────

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const token = useMemo(() => hashParam("token"), []);
  const verify = trpc.auth.verifyEmail.useMutation();

  useEffect(() => {
    if (token) verify.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthShell
      title={t("auth.emailVerification")}
      footer={
        <Link href="/" className="text-primary hover:underline">
          {t("auth.continueToApp")}
        </Link>
      }
    >
      <p className="text-sm text-center text-muted-foreground">
        {!token
          ? t("auth.verifyMissingToken")
          : verify.isPending
            ? t("auth.verifying")
            : verify.isSuccess
              ? t("auth.verified")
              : t("auth.verifyInvalid")}
      </p>
    </AuthShell>
  );
}

// ─── Accept invite ─────────────────────────────────────────────────────────────

export function AcceptInvitePage() {
  const { t } = useTranslation();
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
      <AuthShell title={t("auth.invitation")}>
        <p className="text-sm text-center text-destructive">
          {t("auth.inviteMissingToken")}
        </p>
      </AuthShell>
    );
  }

  if (info.isLoading) {
    return (
      <AuthShell title={t("auth.invitation")}>
        <div className="flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AuthShell>
    );
  }

  if (!info.data) {
    return (
      <AuthShell
        title={t("auth.invitation")}
        footer={
          <Link href="/login" className="text-primary hover:underline">
            {t("auth.backToSignIn")}
          </Link>
        }
      >
        <p className="text-sm text-center text-destructive">
          {t("auth.inviteInvalid")}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth.joinTenant", { name: info.data.tenantName })}
      subtitle={t("auth.invitedAsRole", {
        role: t(`members.roles.${info.data.role}`),
      })}
      footer={
        mode === "register" ? (
          <button
            className="text-primary hover:underline"
            onClick={() => setMode("login")}
          >
            {t("auth.alreadyHaveAccountSignIn")}
          </button>
        ) : (
          <button
            className="text-primary hover:underline"
            onClick={() => setMode("register")}
          >
            {t("auth.newHereCreate")}
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
            <Label htmlFor="name">{t("auth.yourName")}</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">{t("common.email")}</Label>
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
          <Label htmlFor="password">{t("common.password")}</Label>
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
          {mode === "register"
            ? t("auth.createAccountJoin")
            : t("auth.signInJoin")}
        </Button>
      </form>
    </AuthShell>
  );
}
