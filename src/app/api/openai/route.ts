import { auth } from "@/auth";
import { env } from "@/env";
import { OpenAIStream } from "@/lib/openai";
import type { ChatGPTMessage, OpenAIStreamPayload } from "@/lib/types";
import { db } from "@/server/db";
import { chats, messages } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import OpenAI from "openai";

// export const runtime = "edge"

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

const GPT = {
  getTitle: async (text: string) => {
    const response = await openai.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Generate a single sentence short title for the following user query for a chatbot conversation title: ${text}`,
        },
      ],
      model: "gpt-4-1106-preview",
    });
    return response.choices[0]?.message.content ?? "Convo";
  },
};

export async function POST(req: Request) {
  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser) {
    throw new Error("No user");
  }
  const { prompt, chatId } = (await req.json()) as {
    prompt: string;
    chatId: number;
  };
  const chat = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
  });
  if (!chat) {
    throw new Error();
  }
  await db
    .insert(messages)
    .values({ chatId: chatId, role: "user", text: prompt });
  await db
    .insert(messages)
    .values({ chatId: chatId, role: "assistant", text: "" });
  if (!chat.title || chat.title === "New Chat") {
    await db
      .update(chats)
      .set({ title: await GPT.getTitle(prompt) })
      .where(eq(chats.id, chatId));
  }
  await db.update(chats).set({ lastAccessed: new Date() }).where(eq(chats.id, chatId))
  const messagesDb = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId));
  messagesDb.sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

    if (timeA !== timeB) {
      return timeA - timeB; // For ascending order
    } else {
      // Sort by role if dates are the same: 'user' should come before 'assistant'
      if (a.role === b.role) {
        return 0;
      } else if (a.role === "user" && b.role === "assistant") {
        return -1;
      } else {
        return 1;
      }
    }
  });

  if (!prompt) {
    return new Response("No prompt in the request", { status: 400 });
  }

  const payload: OpenAIStreamPayload = {
    model: "gpt-4-1106-preview",
    messages: [
      ...messagesDb.map((message) => {
        return {
          role: message.role === "assistant" ? "system" : "user",
          content: message.text,
        } as ChatGPTMessage;
      }),
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: 4096,
    stream: true,
    n: 1,
  };

  revalidatePath("/", "layout");
  revalidatePath("/(chat)", "page");
  revalidatePath(`/chat/${chatId}`, "page");

  const stream = await OpenAIStream(payload, chatId);
  // return stream response (SSE)
  return new Response(stream, {
    headers: new Headers({
      // since we don't use browser's EventSource interface, specifying content-type is optional.
      // the eventsource-parser library can handle the stream response as SSE, as long as the data format complies with SSE:
      // https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#sending_events_from_the_server

      // 'Content-Type': 'text/event-stream',
      "Cache-Control": "no-cache",
    }),
  });
}
