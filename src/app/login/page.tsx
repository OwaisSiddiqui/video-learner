import { auth, signIn as signInAuth } from "@/auth";
import LoginForm from "@/components/login-form";
import { type Session } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = (await auth()) as Session;

  if (session) {
    redirect("/");
  }

  async function signIn(formData: FormData) {
    "use server";
    await signInAuth("resend", formData);
  }

  return (
    <main className="flex w-full flex-col items-center justify-center gap-5 p-4">
      <LoginForm signIn={signIn} />
    </main>
  );
}
