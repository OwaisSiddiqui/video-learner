import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { createChat } from "./actions";

export const maxDuration = 60;

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const chatId = await createChat();
  redirect(`/chat/${chatId}`);
}
