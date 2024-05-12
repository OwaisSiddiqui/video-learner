import {
  createParser,
  type ParsedEvent,
  type ReconnectInterval,
} from "eventsource-parser";
import type { OpenAIStreamPayload } from "@/lib/types";
import { default as stream } from "node:stream";
import type { ReadableStream as ReadableStreamType } from "node:stream/web";
import { z } from "zod";
import { env } from "@/env";
import { auth } from "@/auth";
import { db } from "@/server/db";
import { chats, messages } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";

export async function OpenAIStream(
  payload: OpenAIStreamPayload,
  chatId: number,
) {
  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser) {
    throw new Error("No user");
  }
  const sessionUserId = sessionUser.id;
  if (!sessionUserId) {
    throw new Error("No user Id");
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY ?? ""}`,
    },
    method: "POST",
    body: JSON.stringify(payload),
  });

  const readableStream = new ReadableStream({
    async start(controller) {
      // callback
      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === "event") {
          const data = event.data;
          controller.enqueue(encoder.encode(data));
        }
      };

      // optimistic error handling
      if (res.status !== 200) {
        const data = {
          status: res.status,
          statusText: res.statusText,
          body: await res.text(),
        };
        console.log(
          `Error: recieved non-200 status code, ${JSON.stringify(data)}`,
        );
        controller.close();
        return;
      }

      // stream response (SSE) from OpenAI may be fragmented into multiple chunks
      // this ensures we properly read chunks and invoke an event for each SSE event stream
      const parser = createParser(onParse);
      // https://web.dev/streams/#asynchronous-iteration
      const readableStream = res.body;
      if (readableStream) {
        for await (const chunk of stream.Readable.fromWeb(
          res.body as ReadableStreamType<Uint8Array>,
        )) {
          parser.feed(decoder.decode(chunk as AllowSharedBufferSource));
        }
      }
    },
  });

  let counter = 0;
  const transformStream = new TransformStream({
    async transform(chunk, controller) {
      const data = decoder.decode(chunk as AllowSharedBufferSource);
      // https://betak.openai.com/docs/api-reference/completions/create#completions/create-stream
      if (data === "[DONE]") {
        controller.terminate();
        return;
      }
      try {
        const jsonUnknown = JSON.parse(data) as unknown;
        const jsonSchema = z.object({
          choices: z.array(
            z.object({ delta: z.object({ content: z.string().optional() }) }),
          ),
        });
        const json = jsonSchema.parse(jsonUnknown);
        const text = json.choices[0]?.delta?.content ?? "";
        if (counter < 2 && (text.match(/\n/) ?? []).length) {
          // this is a prefix character (i.e., "\n\n"), do nothing
          return;
        }
        const messagesDb = await db
          .select()
          .from(messages)
          .where(and(eq(messages.chatId, chatId)));
        const sortedMessages = messagesDb.sort((a, b) => {
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
        const lastAssistantMessage = sortedMessages.findLast(
          (message) => message.role === "assistant",
        );
        if (!lastAssistantMessage) {
          throw new Error("Weird");
        }
        await db
          .update(messages)
          .set({ text: lastAssistantMessage.text + text })
          .where(eq(messages.id, lastAssistantMessage.id));

        // stream transformed JSON resposne as SSE
        const payload = { text: text };
        // https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
        counter++;
      } catch (e) {
        // maybe parse error
        controller.error(e);
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  return readableStream.pipeThrough(transformStream as unknown as any);
}
