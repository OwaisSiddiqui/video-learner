import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Resend from "next-auth/providers/resend";
import { env } from "./env";
import { db } from "./server/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  providers: [
    Resend({
      apiKey: env.AUTH_RESEND_KEY,
      from: "no-reply@aiacademy.one",
    }),
  ],
});
