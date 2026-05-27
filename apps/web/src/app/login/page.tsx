import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user) redirect(params.from ?? "/dashboard");

  async function loginWithDiscord() {
    "use server";
    const sp = await searchParams;
    await signIn("discord", { redirectTo: sp.from ?? "/dashboard" });
  }

  return (
    <main className="login">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark">▲</span>
          <span className="brand-name">tent</span>
        </div>
        <h1>operator sign-in</h1>
        <p>
          Only Discord IDs in <code>DISCORD_ADMIN_USER_IDS</code> can authenticate.
        </p>
        {params.error ? (
          <div className="error">
            sign-in failed. you are probably not on the allowlist, or
            DISCORD_CLIENT_* env vars are missing.
          </div>
        ) : null}
        <form action={loginWithDiscord}>
          <button type="submit">continue with discord</button>
        </form>
      </div>
    </main>
  );
}
