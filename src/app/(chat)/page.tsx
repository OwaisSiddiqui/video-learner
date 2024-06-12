import { Chat } from "@/components/chat";
import { getSuggestions } from "@/app/(chat)/actions";
import { auth } from "@/auth";

// export const maxDuration = 60;
// export const runtime = "edge";

export default async function HomePage() {
  const session = await auth();
  console.log(session)
  const suggestions = await getSuggestions();

  return (
    <>
      <Chat
        initialMessages={[]}
        session={session}
        id={null}
        suggestions={suggestions}
      />
    </>
  );
}
