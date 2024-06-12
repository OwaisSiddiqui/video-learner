import { type Config } from "drizzle-kit";

export default {
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.NODE_ENV !== "production"
      ? process.env.DATABASE_URL!
      : process.env.SUPABASE_DATABASE_URL!
  },
  out: "./src/server/db/migrations",
} satisfies Config;
