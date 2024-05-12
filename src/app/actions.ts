"use server";

import { auth } from "@/auth";
import { db } from "@/server/db";
import { chats, messages as messagesSchema } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getMessages({ chatId }: { chatId: number }) {
  const session = await auth();
  const sessionUserId = session?.user?.id;

  if (sessionUserId) {
    const chat = await db.query.chats.findFirst({
      where: and(eq(chats.id, chatId), eq(chats.userId, sessionUserId)),
    });
    if (!chat) {
      return []
    }
    const data = await db
      .select()
      .from(messagesSchema)
      .where(eq(messagesSchema.chatId, chat.id));
    revalidatePath(`/chat`);
    return data.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      if (timeA !== timeB) {
        return timeA - timeB;
      } else {
        if (a.role === b.role) {
          return 0;
        } else if (a.role === "user" && b.role === "assistant") {
          return -1;
        } else {
          return 1;
        }
      }
    });
  } else {
    return []
  }
}
