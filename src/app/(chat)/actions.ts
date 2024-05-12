import { auth } from "@/auth";
import { env } from "@/env";
import type { ChatGPTMessage, Message, OpenAIStreamPayload } from "@/lib/types";
import { db } from "@/server/db";
import { chats, messages as messagesSchema } from "@/server/db/schema";
import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export const config = {
  runtime: "edge",
};

const GPT = {
  getResponse: async (messages: Message[]) => {
    const response = await openai.chat.completions.create({
      messages: messages.map((message) => {
        return { role: message.role, content: message.text };
      }),
      model: "gpt-4-1106-preview",
    });
    if (response) {
      const text = response.choices[0]?.message.content;
      if (!text) {
        throw new Error("GPT could not get a response");
      }
      return text;
    } else {
      throw new Error("Error in getting response");
    }
  },
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
    return response.choices[0]?.message.content ?? "New chat";
  },
  getYoutubeVideo: async () => {
    // const { openai, youtube } = ctx;
    // const { userInput } = input;
    // const bestYoutubeSearchQueryForInput = await getBestYoutubeSearchQueryForInput(
    //   {
    //     openai: openai,
    //     input: userInput.text
    //   }
    // );
    // const bestYoutubeVideoIdForQuery = await getBestYoutubeVideoForQuery({
    //   youtube: youtube,
    //   query: bestYoutubeSearchQueryForInput,
    // });
    // return {
    //   timestamps: await getTimestampsFromYoutubeVideoForInput({ input: userInput.text, videoId: bestYoutubeVideoIdForQuery, openai: openai, query: bestYoutubeSearchQueryForInput }),
    //   videoId: bestYoutubeVideoIdForQuery
    // }
  },
};

export async function getChats() {
  const session = await auth();
  const sessionUserId = session?.user?.id;

  if (sessionUserId) {
    return (await db.select().from(chats).where(eq(chats.userId, sessionUserId))).map((chat) => {
      return { ...chat, title: chat.title.replaceAll(`"`, '').trim() }
    });
  }
}

export async function createChat() {
  const session = await auth();
  const sessionUserId = session?.user?.id;

  if (sessionUserId) {
    const hasEmptyChat = await db
      .select()
      .from(chats)
      .where(and(eq(chats.userId, sessionUserId), or(eq(chats.title, ""), eq(chats.title, "New Chat"))));
    if (hasEmptyChat[0]) {
      return hasEmptyChat[0].id;
    }
    const chat = await db
      .insert(chats)
      .values({ title: "New Chat", userId: sessionUserId, lastAccessed: new Date() })
      .returning();
    const chatReturn = chat[0];
    if (chatReturn) {
      return chatReturn.id;
    } else {
      throw new Error();
    }
  } else {
    throw new Error();
  }
}

export async function submitMessage({
  message,
  chatId,
}: {
  message: Message;
  chatId: number;
}): Promise<{ response: string; chatId: number }> {
  const session = await auth();
  const sessionUserId = session?.user?.id;

  if (sessionUserId) {
    const chatDb = await db
      .select()
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, sessionUserId)));
    const chat = chatDb[0];
    if (!chat) {
      throw new Error();
    }
    if (!chat.title) {
      const title = await GPT.getTitle(message.text);
      await db
        .update(chats)
        .set({ title: title })
        .where(and(eq(chats.id, chatId), eq(chats.userId, sessionUserId)));
    }
    const messagesFromDb = await db
      .select()
      .from(messagesSchema)
      .where(eq(messagesSchema.chatId, chatId));
    const payload: OpenAIStreamPayload = {
      model: "text-davinci-003",
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      max_tokens: 200,
      stream: true,
      n: 1,
      messages: [
        ...messagesFromDb.map((message) => {
          return {
            role: message.role === "user" ? "user" : "system",
            content: message.text,
          } as ChatGPTMessage;
        }),
        { role: "user", content: message.text },
      ],
    };

    const response = await GPT.getResponse([
      ...messagesFromDb.map((message) => {
        return { role: message.role, text: message.text };
      }),
      { role: "user", text: message.text },
    ]);
    await db.insert(messagesSchema).values([
      { chatId: chatId, text: response, role: "assistant" },
      { chatId: chatId, text: message.text, role: "user" },
    ]);
    revalidatePath("/(chat)", "page");
    revalidatePath(`/chat/${chatId}`, "page");

    return { response: response, chatId: chatId };
  } else {
    throw new Error();
  }
}

export async function getSuggestions() {
  const suggestions = [
    { "title": "What is", "question": "the Heisenberg Uncertainty Principle in quantum mechanics?" },
    { "title": "What is", "question": "a Riemann surface in complex analysis?" },
    { "title": "How do", "question": "catalysts lower the activation energy of reactions?" },
    { "title": "What is", "question": "CRISPR-Cas9 and how does it edit genes?" },
    { "title": "How do", "question": "externalities affect market efficiency?" },
    { "title": "What does", "question": "the Black-Scholes model calculate?" },
    { "title": "Why is", "question": "Big O notation important for algorithms?" },
    { "title": "What principles", "question": "underpin suspension bridge design?" },
    { "title": "How does", "question": "deforestation impact the carbon cycle?" },
    { "title": "What does", "question": "Porter's Five Forces model analyze?" }
  ]

  function shuffleArray(array: { title: string; question: string }[]) {
    for (let i = array.length - 1; i > 0; i--) {
      // Generate a random index between 0 and i
      const j = Math.floor(Math.random() * (i + 1));

      // Swap elements at indices i and j
      const temp = array[i] as { title: string; question: string };
      array[i] = array[j] as { title: string; question: string };
      array[j] = temp;
    }
    return array;
  }

  return shuffleArray(suggestions).slice(0, 4)
}