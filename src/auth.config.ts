import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  providers: []
} satisfies NextAuthConfig;
