"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/app/lib/supabase/client";
import type { PlanId } from "@/app/lib/plans";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Alert, AlertDescription } from "@/app/components/ui/alert";

const VALID_PLANS: PlanId[] = ["starter", "pro", "business", "enterprise", "per_minute_1", "per_minute_2", "per_minute_3"];

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const plan = planParam && VALID_PLANS.includes(planParam as PlanId) ? (planParam as PlanId) : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      if (!data.user?.id) {
        setError("Sign up failed. Please try again.");
        setLoading(false);
        return;
      }
      const dashboardUrl = plan ? `/dashboard?plan=${encodeURIComponent(plan)}` : "/dashboard";
      router.push(dashboardUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const dashboardPath = plan ? `/dashboard?plan=${encodeURIComponent(plan)}` : "/dashboard";
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${dashboardPath}`,
        },
      });
      if (oauthError) {
        setError(oauthError.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            {plan
              ? "Sign up and you’ll be taken to choose your plan."
              : "Sign up for free. Upgrade to a plan later to unlock the full AI receptionist."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Sign up free"}
            </Button>
            <div className="relative">
              <span className="bg-card absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </span>
              <span className="bg-card relative px-2 text-xs text-muted-foreground">
                or
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={handleGoogleSignUp}
            >
              Continue with Google
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary underline">
                Log in
              </Link>
              {" · "}
              <Link href="/" className="text-primary underline">
                Back to home
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
