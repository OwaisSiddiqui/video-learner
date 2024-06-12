"use server";

import { auth } from "@/auth";
import { db } from "@/server/db";
import { chats, messages } from "@/server/db/schema";
import { type InferSelectModel, and, eq } from "drizzle-orm";
import OpenAI from "openai";
import { ElevenLabsClient } from "elevenlabs";
import pLimit from "p-limit";
import { z } from "zod";
import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/env";
import { Upload } from "@aws-sdk/lib-storage";
import { messages as messagesSchema } from "@/server/db/schema";
import { redirect } from "next/navigation";
import { DEMOS } from "@/lib/constants";

interface SerperImageResponse {
  searchParameters: SearchParameters
  images: Image[]
}

interface SearchParameters {
  q: string
  type: string
  engine: string
  num: number
}
interface Image {
  title: string
  imageUrl: string
  imageWidth: number
  imageHeight: number
  thumbnailUrl: string
  thumbnailWidth: number
  thumbnailHeight: number
  source: string
  domain: string
  link: string
  googleUrl: string
  position: number
  copyright?: string
  creator?: string
}


interface StatementTemplate {
  type: "statement";
  statement: string;
  narration: string;
  mp3: number;
}

interface TitleBulletsTemplate {
  type: "title-bullets";
  title: {
    value: string;
    narration: string;
    mp3: number;
  };
  bullets: {
    value: string;
    narration: string;
    mp3: number;
  }[];
}

interface MiddleImageTemplate {
  type: "middle-image";
  imageDescription: string;
  imageUrl?: string;
  narration: string;
  mp3: number;
}

interface SideBySideImagesTemplate {
  type: "side-by-side-images";
  firstImageDescription: {
    value: string;
    imageUrl?: string;
    narration: string;
    mp3: number;
  };
  secondImageDescription: {
    value: string;
    imageUrl?: string;
    narration: string;
    mp3: number;
  };
}

type Slide =
  | StatementTemplate
  | TitleBulletsTemplate
  | MiddleImageTemplate
  | SideBySideImagesTemplate;

const openai = new OpenAI();
const elevenlabs = new ElevenLabsClient({
  apiKey: env.ELEVENLABS_API_KEY,
});

// Create an S3 client
const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

// Function to upload a stream to S3
const uploadStreamToS3 = async (stream: ReadableStream, key: string) => {
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: env.USER_AUDIO_FILES_S3_BUCKET_NAME,
      Key: key,
      Body: stream,
    },
  });

  try {
    const result = await upload.done();
    console.log("Upload success:", result);
    const location = result.Location;
    if (!location) {
      throw new Error("No location");
    }
    return location;
  } catch (error) {
    console.error("Upload error:", error);
    throw new Error("Error uploading to S3");
  }
};

const SYSTEM_PROMPT = `You are a function that generates a JSON structure for a slideshow presentation to help users learn new concepts based on user's query / concept / question. The slides should be straight to the point (no introduction or conclusion) and be concise. You can assume the user is generally aware of the knowledge based on their question. The JSON should follow this format according to the TypeScript type Result (an array of different types of templates):

interface StatementTemplate { 
    type: "statement" 
    statement: string 
    narration: string 
}

interface TitleBulletsTemplate { 
    type: "title-bullets" 
    title: { 
        value: string 
        narration: string 
    } 
    bullets: { 
        value: string 
        narration: string 
    }[] 
} 

interface MiddleImageTemplate { 
    type: "middle-image" 
    imageDescription: string 
    narration: string 
} 

interface SideBySideImagesTemplate { 
    type: "side-by-side-images" 
    firstImageDescription: { 
        value: string 
        narration: string 
    } 
    secondImageDescription: { 
        value: string 
        narration: string 
    }
} 

type Templates = "middle-image" | "title-bullets" | "statement" | "side-by-side-images" 

interface TemplateDescription { 
    "middle-image": "an image in the center of the slide" 
    "title-bullets": "a slide with a title and bullets at the bottom" 
    "statement": "a slide with text in the center of the slide" 
    "side-by-side-images": "a slide with two equally sized images in the center side by side to each other" 
} 

type Result = (StatementTemplate | TitleBulletsTemplate | MiddleImageTemplate | SideBySideImagesTemplate)[]

Description of JSON format:
- You are generating a slideshow presentation that is meant to have an AI voice narration to it.
- Each format has a narration key somewhere. This is where the narration should go (what is to be said on that slide). You can also see the narration key is in different places. This is because the narration is split up according to the things on the slide. Each slide will start off blank (no elements) and each element (either it be title, individual bullets, or images) are revealed at the start of narration for that element. Each bullet is revealed separately as well. So keep this things in mind when doing the narration.
- Unless necessary, do not make the text on the slide same as the narration. Remember, the slides are meant to be a visual help for the user and not a repeat of the narration.
- The result of the JSON is an array of slides. The slides are separated into different formats. Choose the best formation for the narration.`;

export async function generateData(id: string, question: string) {
  const completion = await openai.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: question },
    ],
    model: "gpt-4o",
    max_tokens: 4095,
    response_format: { type: "json_object" },
  });

  console.log("Data", completion);

  const data = completion.choices[0]?.message.content;
  if (!data) {
    throw new Error("respone was null");
  }
  const resultData = data.replace(/(\r\n|\n|\r)/gm, "");
  console.log(resultData);
  const generatedData = JSON.parse(resultData) as
    | { result: Slide[] }
    | { data: Slide[] }
    | { slides: Slide[] };
  console.log("Parsed", generatedData);

  let result: Slide[] = [];

  if ("result" in generatedData) {
    result = generatedData.result;
  } else if ("data" in generatedData) {
    result = generatedData.data;
  } else if ("slides" in generatedData) {
    result = generatedData.slides;
  } else {
    throw new Error("error in generated data format", generatedData);
  }

  return result;
}

export async function generateVoiceData(id: string, narrationArray: string[]) {
  console.log("Voice data");
  const limit = pLimit(5);
  const audioS3Files: { index: number; path: string }[] = [];

  const generateAndSaveVoice = async (narration: string, index: number) => {
    console.log("Narration");
    console.log("Generating voice");

    const audio = (await elevenlabs.generate({
      voice: "Rachel",
      text: narration,
      model_id: "eleven_multilingual_v2",
    })) as unknown as ReadableStream;

    const filePath = await uploadStreamToS3(audio, `/${id}/output${index}.mp3`);
    audioS3Files.push({ index: index, path: filePath });
  };

  const promises = narrationArray.map((narration, index) =>
    limit(() => generateAndSaveVoice(narration, index)),
  );

  await Promise.all(promises);
  return audioS3Files;
}

const searchParametersSchema = z.object({
  q: z.string(),
  type: z.string(),
  engine: z.string(),
  num: z.number()
})

const imageSchema = z.object({
  title: z.string(),
  imageUrl: z.string(),
  imageWidth: z.number(),
  imageHeight: z.number(),
  thumbnailUrl: z.string(),
  thumbnailWidth: z.number(),
  thumbnailHeight: z.number(),
  source: z.string(),
  domain: z.string(),
  link: z.string(),
  googleUrl: z.string(),
  position: z.number(),
  copyright: z.string().optional(),
  creator: z.string().optional()
})

const serperImageResponseSchema = z.object({
  searchParameters: searchParametersSchema,
  images: z.array(imageSchema)
})


export async function getImageUrls(data: Slide[]) {
  const limit = pLimit(5);

  const setImageUrl = async (
    slide: MiddleImageTemplate | SideBySideImagesTemplate,
    index?: 0 | 1,
  ) => {
    const description =
      slide.type === "middle-image"
        ? slide.imageDescription
        : index === 0
          ? slide.firstImageDescription.value
          : slide.secondImageDescription.value;
    const data = JSON.stringify({
      "q": description
    });

    const result: SerperImageResponse | void = await fetch('https://google.serper.dev/images', {
      method: 'post',
      headers: {
        'X-API-KEY': env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: data
    }).then(response => response.json() as unknown as SerperImageResponse).catch(error => console.log(error))

    if (!result) {
      throw new Error("");
    }
    console.log("Result", result);
    let imageUrl: null | string = null;
    const resultValidated = serperImageResponseSchema.parse(result);
    const imageUrlResult: string | undefined =
      resultValidated.images[0]?.imageUrl;
    if (!(typeof imageUrlResult === "string")) {
      throw new Error("");
    }
    imageUrl = imageUrlResult;
    if (slide.type === "middle-image") {
      slide.imageUrl = imageUrl;
    } else {
      if (index === 0) {
        slide.firstImageDescription.imageUrl = imageUrl;
      } else {
        slide.secondImageDescription.imageUrl = imageUrl;
      }
    }
  };

  const promises = data.map((slide) => {
    if (slide.type === "middle-image") {
      void limit(() => setImageUrl(slide));
    } else if (slide.type === "side-by-side-images") {
      void limit(() => setImageUrl(slide, 0));
      void limit(() => setImageUrl(slide, 1));
    }
  });

  await Promise.all(promises);
}

export async function getChats() {
  const session = await auth();
  const sessionUserId = session?.user?.id;

  if (sessionUserId) {
    return (
      await db.select().from(chats).where(eq(chats.userId, sessionUserId))
    ).map((chat) => {
      return { ...chat, title: chat.title.replaceAll(`"`, "").trim() };
    });
  }
}

const getTitle = async (text: string) => {
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
};

export async function getSlides(
  question: string,
  chatId: number | null,
  isGuest = false,
) {
  const session = await auth();
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) {
    if (!isGuest) {
      throw new Error("");
    }
    if (question === "What is Next.js") {
      return DEMOS.next;
    }
    if (question === "List the benefits of micro frontends") {
      return DEMOS.micro;
    }
    if (question === "How does the React component lifecycle work") {
      return DEMOS.react;
    }
    if (
      question ===
      "What are the best practices for building accessible React components"
    ) {
      return DEMOS.accessible;
    }
  }
  let chat: undefined | InferSelectModel<typeof chats> = undefined;
  if (!chat && sessionUserId) {
    const chatReturn = await db
      .insert(chats)
      .values({
        title: await getTitle(question),
        userId: sessionUserId,
        lastAccessed: new Date(),
      })
      .returning();
    const chatResult = chatReturn[0];
    if (!chatResult) {
      throw new Error("");
    }
    chat = chatResult;
    chatId = chat.id;
  } else if (chatId) {
    chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });
  }
  if (!chatId || !chat) {
    throw new Error("");
  }
  await db
    .insert(messages)
    .values({ chatId: chatId, role: "user", text: question });
  if (!chat.title || chat.title === "New Chat") {
    await db
      .update(chats)
      .set({ title: await getTitle(question) })
      .where(eq(chats.id, chatId));
  }
  await db
    .update(chats)
    .set({ lastAccessed: new Date() })
    .where(eq(chats.id, chatId));
  const newUUID = crypto.randomUUID();
  console.log("Generating data...");
  const data = await generateData(newUUID, question).catch((error) =>
    console.log(error),
  );
  if (!data) {
    console.log("Error!");
    throw new Error("");
  }
  console.log("Got data", JSON.stringify(data));
  const narrationArray: string[] = [];
  let narrationIndex = 1;
  data.forEach((slide) => {
    switch (slide.type) {
      case "middle-image":
        slide.mp3 = narrationIndex;
        narrationIndex++;
        return narrationArray.push(slide.narration);
      case "side-by-side-images":
        slide.firstImageDescription.mp3 = narrationIndex;
        narrationIndex++;
        slide.secondImageDescription.mp3 = narrationIndex;
        narrationIndex++;
        return narrationArray.push(
          ...[
            slide.firstImageDescription.narration,
            slide.secondImageDescription.narration,
          ],
        );
      case "statement":
        slide.mp3 = narrationIndex;
        narrationIndex++;
        return narrationArray.push(slide.narration);
      case "title-bullets":
        slide.title.mp3 = narrationIndex;
        slide.bullets.forEach((bullet) => {
          bullet.mp3 = narrationIndex + 1;
          narrationIndex++;
        });
        narrationIndex++;
        return narrationArray.push(
          ...[
            slide.title.narration,
            ...slide.bullets.map((bullet) => bullet.narration),
          ],
        );
      default:
        break;
    }
  });

  console.log("Narration array", narrationArray);
  console.log("Generating voice data...");
  const promises = [];
  const audioS3Files: { index: number; path: string }[] = [];
  promises.push(
    generateVoiceData(newUUID, narrationArray)
      .then((result) => {
        result.map((data) => {
          audioS3Files.push(data);
        });
      })
      .catch((error) => console.log(error)),
  );
  promises.push(getImageUrls(data).catch(error => console.log(error))); // Get Images for Slides
  await Promise.all(promises).catch((error) => console.log(error));
  // TODO: Save data
  const result = { id: newUUID, slides: data, audioS3Files: audioS3Files } as {
    id: string;
    slides: Slide[];
    audioS3Files: { index: number; path: string }[];
  };
  console.log("Got result", JSON.stringify(result));
  await db.insert(messages).values({
    role: "assistant",
    chatId: chatId,
    text: JSON.stringify(result),
  });
  redirect(`/chat/${chatId}`);
}

export async function getSuggestions() {
  const suggestions = [
    {
      title: "What is",
      question: "the Heisenberg Uncertainty Principle in quantum mechanics?",
    },
    { title: "What is", question: "a Riemann surface in complex analysis?" },
    {
      title: "How do",
      question: "catalysts lower the activation energy of reactions?",
    },
    { title: "What is", question: "CRISPR-Cas9 and how does it edit genes?" },
    { title: "How do", question: "externalities affect market efficiency?" },
    { title: "What does", question: "the Black-Scholes model calculate?" },
    { title: "Why is", question: "Big O notation important for algorithms?" },
    {
      title: "What principles",
      question: "underpin suspension bridge design?",
    },
    { title: "How does", question: "deforestation impact the carbon cycle?" },
    { title: "What does", question: "Porter's Five Forces model analyze?" },
  ];

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

  return shuffleArray(suggestions).slice(0, 4);
}

export async function getMessages({ chatId }: { chatId: number }) {
  const session = await auth();
  const sessionUserId = session?.user?.id;

  if (!sessionUserId) {
    throw new Error("");
  }
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, sessionUserId)),
  });
  if (!chat) {
    return [];
  }
  const data = await db
    .select()
    .from(messagesSchema)
    .where(eq(messagesSchema.chatId, chat.id));
  console.log(data);
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
}
