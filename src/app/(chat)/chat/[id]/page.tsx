import { getMessages } from "@/app/(chat)/actions";
import { auth } from "@/auth";
import { Chat } from "@/components/chat";
import { getSuggestions } from "../../actions";

export const maxDuration = 60;

export default async function HomePage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const session = await auth();
  const initialMessages = await getMessages({ chatId: parseInt(params.id) });
  const suggestions = await getSuggestions();

  console.log("** INTIIAL", JSON.stringify(initialMessages));

  return (
    <Chat
      initialMessages={
        initialMessages.map((message) => {
          return { role: message.role, text: message.text };
        }) ?? []
      }
      session={session}
      id={parseInt(params.id)}
      suggestions={suggestions}
    />
  );
}
