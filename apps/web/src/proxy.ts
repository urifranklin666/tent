import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const url = new URL(req.url);
  const isLogin = url.pathname.startsWith("/login");
  const isAuthApi = url.pathname.startsWith("/api/auth");
  if (isLogin || isAuthApi) return;
  if (!req.auth) {
    const signinUrl = new URL("/login", req.url);
    signinUrl.searchParams.set("from", url.pathname);
    return Response.redirect(signinUrl);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
