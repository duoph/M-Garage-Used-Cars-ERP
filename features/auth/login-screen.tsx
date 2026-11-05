"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Info, ShieldCheck } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useSessionStore } from "@/lib/store/session";
import { supabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/lib/utils/labels";
import { Wordmark } from "@/components/shared/logo";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendPasswordReset, signInWithEmail, updatePassword } from "./supabase-auth";
import type { Role } from "@/types";

const ROLE_SUMMARY: Record<Role, string> = {
  admin: "Full access, including staff accounts and settings",
  manager: "Operations, purchasing, pricing and profit",
  office: "Papers, documents, vouchers and the cash book",
  sales: "Stock, reservations and sales — no cost or profit",
  accountant: "Payments, expenses and financial reports",
};

const ROLE_ORDER: Role[] = ["admin", "manager", "office", "sales", "accountant"];

export function LoginScreen() {
  const { ds } = useData();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#050505] p-10 text-white lg:flex">
        <Wordmark dark className="-ml-6 w-80 [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_78%)]" />
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">Run M Garage from one place.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-sidebar-foreground">
            Purchases, stock, papers, sales, cash book and accounts — with profit you can trust, down to the paisa.
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-sidebar-foreground">
            {["Every car's landed cost and margin, automatically", "Cash & bank book, receipt and payment vouchers, P&L", "Insurance, PUC and hypothecation alerts with scanned papers"].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <ShieldCheck className="size-4 text-[#ef4444]" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-white/60">© {new Date().getFullYear()} M Garage · Pre Owned Cars</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Wordmark className="mx-auto mb-8 w-60 lg:hidden" />
          {supabaseConfigured ? <PasswordSignIn showroomName={ds.settings.showroomName} /> : <DemoAccountPicker />}
        </div>
      </main>
    </div>
  );
}

// ─── Supabase email + password ──────────────────────────────────────────────────

type Mode = "checking" | "sign-in" | "forgot" | "reset-sent" | "new-password";

function PasswordSignIn({ showroomName }: { showroomName: string }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("checking");
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // Already signed in → straight to the app. Arriving from a reset email → ask for a new password.
  React.useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const fromResetLink = new URLSearchParams(window.location.search).has("reset");
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("new-password");
    });
    supabase.auth.getSession().then(({ data }) => {
      const { userId, authUserId } = useSessionStore.getState();
      if (fromResetLink && data.session) setMode("new-password");
      else if (data.session && userId && authUserId === data.session.user.id) router.replace("/");
      else setMode((m) => (m === "checking" ? "sign-in" : m));
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const go = (next: Mode) => {
    setError(null);
    setNotice(null);
    setMode(next);
  };

  if (mode === "checking") return <div className="h-72" aria-busy="true" />;

  return (
    <>
      {mode === "sign-in" && (
        <>
          <h2 className="text-xl font-semibold tracking-tight">Sign in to {showroomName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Enter your work email and password.</p>
          {notice && <Notice tone="success">{notice}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <SignInForm
            email={email}
            setEmail={setEmail}
            onError={setError}
            onSuccess={() => router.replace("/")}
            onForgot={() => go("forgot")}
          />
        </>
      )}

      {mode === "forgot" && (
        <>
          <BackButton onClick={() => go("sign-in")} />
          <h2 className="text-xl font-semibold tracking-tight">Reset your password</h2>
          <p className="mt-1 text-sm text-muted-foreground">We&apos;ll email you a link to choose a new password.</p>
          {error && <Notice tone="error">{error}</Notice>}
          <ForgotForm email={email} setEmail={setEmail} onError={setError} onSent={() => go("reset-sent")} />
        </>
      )}

      {mode === "reset-sent" && (
        <>
          <h2 className="text-xl font-semibold tracking-tight">Check your email</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            If <strong className="font-medium text-foreground">{email}</strong> has an account, a reset link is on its way. Open it on this
            device to set a new password.
          </p>
          <Button variant="outline" className="mt-6 w-full" onClick={() => go("sign-in")}>
            <ArrowLeft /> Back to sign in
          </Button>
        </>
      )}

      {mode === "new-password" && (
        <>
          <h2 className="text-xl font-semibold tracking-tight">Choose a new password</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use at least 8 characters.</p>
          {error && <Notice tone="error">{error}</Notice>}
          <NewPasswordForm
            onError={setError}
            onDone={async () => {
              await getSupabaseBrowserClient().auth.signOut();
              window.history.replaceState(null, "", "/login");
              go("sign-in");
              setNotice("Password updated. Sign in with your new password.");
            }}
          />
        </>
      )}
    </>
  );
}

function SignInForm({
  email,
  setEmail,
  onError,
  onSuccess,
  onForgot,
}: {
  email: string;
  setEmail: (v: string) => void;
  onError: (e: string | null) => void;
  onSuccess: () => void;
  onForgot: () => void;
}) {
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    onError(null);
    setBusy(true);
    try {
      await signInWithEmail(email, password);
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="h-10"
        />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <button type="button" onClick={onForgot} className="text-[13px] font-medium text-primary hover:underline">
            Forgot password?
          </button>
        </div>
        <PasswordInput id="password" autoComplete="current-password" value={password} onChange={setPassword} />
      </div>
      <Button type="submit" size="lg" className="mt-1 w-full" loading={busy} disabled={!email.trim() || !password}>
        {busy ? "Signing in…" : (
          <>
            Sign in <ArrowRight />
          </>
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">New staff accounts are created by the admin.</p>
    </form>
  );
}

function ForgotForm({ email, setEmail, onError, onSent }: { email: string; setEmail: (v: string) => void; onError: (e: string | null) => void; onSent: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    onError(null);
    setBusy(true);
    try {
      await sendPasswordReset(email);
      onSent();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not send the reset email.");
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-6 grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="reset-email">Email</Label>
        <Input id="reset-email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email.trim()}>
        Send reset link
      </Button>
    </form>
  );
}

function NewPasswordForm({ onError, onDone }: { onError: (e: string | null) => void; onDone: () => Promise<void> }) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) return onError("Use at least 8 characters.");
    if (password !== confirm) return onError("The two passwords don't match.");
    onError(null);
    setBusy(true);
    try {
      await updatePassword(password);
      await onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update the password.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-6 grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="new-password">New password</Label>
        <PasswordInput id="new-password" autoComplete="new-password" value={password} onChange={setPassword} autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <PasswordInput id="confirm-password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!password || !confirm}>
        Save password
      </Button>
    </form>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, autoFocus }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; autoFocus?: boolean }) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Back to sign in
    </button>
  );
}

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "mt-4 flex gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-[13px] text-destructive"
          : "mt-4 flex gap-2.5 rounded-lg border border-primary/25 bg-primary-soft/60 p-3 text-[13px] text-foreground"
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

// ─── Local demo mode (no Supabase configured) ───────────────────────────────────

function DemoAccountPicker() {
  const { ds } = useData();
  const router = useRouter();
  const signIn = useSessionStore((s) => s.signIn);
  const users = ds.users
    .filter((u) => u.status === "active")
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));

  return (
    <>
      <h2 className="text-xl font-semibold tracking-tight">Sign in to {ds.settings.showroomName}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Choose your account to continue.</p>
      <div className="mt-4 flex gap-2.5 rounded-lg border border-[#fde7b0] bg-warning-soft p-3 text-[13px] text-[#7a3e06]">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">Local mode.</strong> Supabase isn&apos;t configured, so there are no passwords and all data
          stays in this browser.
        </p>
      </div>
      <ul className="mt-4 grid gap-2">
        {users.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => {
                signIn(u.id);
                router.replace("/");
              }}
              className="group flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-xs transition-colors hover:border-primary/40 hover:bg-primary-soft/40 focus-visible:ring-2 focus-visible:ring-ring/40 outline-none"
            >
              <UserAvatar name={u.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{u.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{ROLE_LABELS[u.role]}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{ROLE_SUMMARY[u.role]}</p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
