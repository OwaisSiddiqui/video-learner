import { Chat } from "@/components/chat";
import { getSuggestions } from "@/app/(chat)/actions";
import { cookies } from "next/headers";
import { auth, signIn as signInAuth } from "@/auth";
import GuestModal from "@/components/guest-modal";

export const maxDuration = 60;

export default async function HomePage() {
  const session = await auth();
  const suggestions = await getSuggestions();
  const cookieStore = cookies();
  const isGuest = cookieStore.get("isGuest");

  async function signIn(formData: FormData) {
    "use server";
    await signInAuth("resend", formData);
  }

  return (
    <>
      <Chat
        initialMessages={[]}
        session={session}
        id={null}
        suggestions={suggestions}
      />
      <GuestModal
        isGuest={session?.user ? "true" : isGuest?.value ?? ""}
        signIn={signIn}
      />
    </>
  );
}
