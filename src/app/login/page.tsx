import { auth, signIn as signInAuth } from "@/auth";
import LoginForm from "@/components/login-form";
import { IconLogo } from "@/components/ui/icons";
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
    <main className="flex w-full items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <IconLogo />
        <div className="w-max rounded-lg border border-[#DEC7E0] px-8 py-8">
          <LoginForm signIn={signIn} />
        </div>
      </div>
    </main>
  );
}
