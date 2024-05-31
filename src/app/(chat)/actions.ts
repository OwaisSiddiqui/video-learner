"use server"

import { auth } from "@/auth";
import { db } from "@/server/db";
import { chats, messages } from "@/server/db/schema";
import { InferSelectModel, and, eq, or } from "drizzle-orm";
import OpenAI from "openai";
import { ElevenLabsClient } from "elevenlabs";
import pLimit from "p-limit";
import { getJson } from "serpapi";
import { z } from "zod";
import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/env";
import { Upload } from "@aws-sdk/lib-storage";
import { messages as messagesSchema } from "@/server/db/schema";
import { revalidatePath } from "next/cache";
import { redirect } from 'next/navigation'

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

const resultSchema = z.object({
  images_results: z.array(z.object({ original: z.string().optional() })),
});

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
    const result = await getJson({
      engine: "google_images",
      api_key:
        "e11e41633aaa6af2a344c1447dea63ab803754215e10238aa59e84c3b8a54cb5", // Get your API_KEY from https://serpapi.com/manage-api-key
      q: description,
      location: "Canada",
    }).catch(error => console.log(error))
    if (!result) {
      throw new Error("")
    }
    console.log("Result", result);
    let imageUrl: null | string = null;
    const resultValidated = resultSchema.parse(result);
    const imageUrlResult: string | undefined =
      resultValidated.images_results[0]?.original;
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
}

export async function getSlides(question: string, chatId: number | null, isGuest = false) {
  const session = await auth();
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) {
    if (!isGuest) {
      throw new Error("")
    }
    if (question === "What is Next.js") {
      return { "id": "89b37441-78ad-47fb-ba2a-0845dc435c75", "slides": [{ "type": "title-bullets", "title": { "value": "What is Next.js?", "narration": "Let's dive into Next.js and understand what it is.", "mp3": 1 }, "bullets": [{ "value": "React Framework", "narration": "Next.js is a popular framework built on top of React.", "mp3": 2 }, { "value": "Server-Side Rendering", "narration": "It offers server-side rendering, which allows pre-rendering pages on the server.", "mp3": 3 }, { "value": "Static Site Generation", "narration": "Additionally, Next.js supports static site generation, creating pre-built HTML pages.", "mp3": 4 }, { "value": "API Routes", "narration": "Next.js includes API routes, enabling you to build backend functionality directly in your application.", "mp3": 5 }] }, { "type": "statement", "statement": "Next.js enhances React apps with server-side rendering.", "narration": "Next.js makes React applications more powerful by adding server-side rendering, giving you improved performance and SEO benefits.", "mp3": 6 }, { "type": "title-bullets", "title": { "value": "Key Features", "narration": "Here are some key features of Next.js.", "mp3": 7 }, "bullets": [{ "value": "File-Based Routing", "narration": "One of the standout features is its file-based routing system which simplifies building navigations.", "mp3": 8 }, { "value": "Optimized Performance", "narration": "Next.js optimizes performance by leveraging server-side rendering and static site generation.", "mp3": 9 }, { "value": "Built-in CSS Support", "narration": "It also provides built-in support for CSS and Sass, making it easier to style your application.", "mp3": 10 }, { "value": "TypeScript Support", "narration": "Full TypeScript support out of the box, enhancing code quality and developer experience.", "mp3": 11 }] }, { "type": "middle-image", "imageUrl": "https://miro.medium.com/v2/resize:fit:1400/1*6LyIlAxDmwMisIMfZ8blHg.png", "imageDescription": "Diagram showing the architecture of a Next.js application with client-side and server-side components.", "narration": "This diagram illustrates the architecture of a Next.js application, highlighting both client-side and server-side components.", "mp3": 12 }, { "type": "side-by-side-images", "firstImageDescription": { "value": "A visual representation of Server-Side Rendering.", "narration": "On the left, you can see how Server-Side Rendering works, where HTML is generated on the server.", "mp3": 13 }, "secondImageDescription": { "value": "A visual representation of Static Site Generation.", "narration": "On the right, you can see how Static Site Generation works, where HTML is generated at build time.", "mp3": 14 } }], "audioS3Files": [{ "index": 1, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output1.mp3" }, { "index": 0, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output0.mp3" }, { "index": 3, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output3.mp3" }, { "index": 4, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output4.mp3" }, { "index": 2, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output2.mp3" }, { "index": 6, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output6.mp3" }, { "index": 5, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output5.mp3" }, { "index": 7, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output7.mp3" }, { "index": 8, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output8.mp3" }, { "index": 9, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output9.mp3" }, { "index": 10, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output10.mp3" }, { "index": 12, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output12.mp3" }, { "index": 11, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output11.mp3" }, { "index": 13, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//89b37441-78ad-47fb-ba2a-0845dc435c75/output13.mp3" }] }
    }
    if (question === "List the benefits of micro frontends") {
      return { "id": "9a844d49-6baa-4d52-95eb-40b8297fba89", "slides": [{ "type": "title-bullets", "title": { "value": "Benefits of Micro Frontends", "narration": "Let's explore the key benefits of micro frontends.", "mp3": 1 }, "bullets": [{ "value": "Scalability", "narration": "Micro frontends enhance scalability by allowing teams to work on different parts of the application simultaneously.", "mp3": 2 }, { "value": "Independent Deployment", "narration": "Teams can deploy their part of the frontend independently without affecting the entire application.", "mp3": 3 }, { "value": "Technology Agnostic", "narration": "Different micro frontends can be built using different technologies, enabling teams to choose the best tools for the job.", "mp3": 4 }, { "value": "Improved Maintainability", "narration": "Maintaining and updating smaller, decoupled parts of the frontend is generally easier and less risky.", "mp3": 5 }, { "value": "Enhanced Performance", "narration": "Micro frontends can improve performance by loading only the necessary parts of the application.", "mp3": 6 }] }, { "type": "side-by-side-images", "firstImageDescription": { "value": "Illustration of scalability", "narration": "On the left, we have an illustration showing how micro frontends allow different teams to scale their development efforts.", "mp3": 7 }, "secondImageDescription": { "value": "Diagram of independent deployment", "narration": "On the right, this diagram depicts the independent deployment capabilities of micro frontends.", "mp3": 8 } }, { "type": "middle-image", "imageDescription": "Chart showing technology choices in different micro frontends", "narration": "This chart highlights how different micro frontends can leverage diverse technologies, showcasing the flexibility in tool selection.", "mp3": 9 }, { "type": "statement", "statement": "Micro frontends make maintaining large applications more manageable.", "narration": "In summary, micro frontends significantly improve maintainability by breaking down the frontend architecture into smaller, manageable pieces.", "mp3": 10 }], "audioS3Files": [{ "index": 0, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//9a844d49-6baa-4d52-95eb-40b8297fba89/output0.mp3" }, { "index": 4, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//9a844d49-6baa-4d52-95eb-40b8297fba89/output4.mp3" }, { "index": 2, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//9a844d49-6baa-4d52-95eb-40b8297fba89/output2.mp3" }, { "index": 3, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//9a844d49-6baa-4d52-95eb-40b8297fba89/output3.mp3" }, { "index": 1, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//9a844d49-6baa-4d52-95eb-40b8297fba89/output1.mp3" }, { "index": 5, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//9a844d49-6baa-4d52-95eb-40b8297fba89/output5.mp3" }, { "index": 7, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//9a844d49-6baa-4d52-95eb-40b8297fba89/output7.mp3" }, { "index": 6, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//9a844d49-6baa-4d52-95eb-40b8297fba89/output6.mp3" }, { "index": 9, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//9a844d49-6baa-4d52-95eb-40b8297fba89/output9.mp3" }, { "index": 8, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//9a844d49-6baa-4d52-95eb-40b8297fba89/output8.mp3" }] }
    }
    if (question === "How does the React component lifecycle work") {
      return { "id": "8ebc8121-4108-4d50-8b86-7c72da8aad68", "slides": [{ "type": "statement", "statement": "React Component Lifecycle", "narration": "Let's explore how the React component lifecycle works.", "mp3": 1 }, { "type": "title-bullets", "title": { "value": "Lifecycle Phases", "narration": "The React component lifecycle can be divided into three main phases.", "mp3": 2 }, "bullets": [{ "value": "Mounting", "narration": "Mounting: This is when the component is being inserted into the DOM.", "mp3": 3 }, { "value": "Updating", "narration": "Updating: This phase happens when the component is being re-rendered as a result of changes to either props or state.", "mp3": 4 }, { "value": "Unmounting", "narration": "Unmounting: This is when the component is being removed from the DOM.", "mp3": 5 }] }, { "type": "side-by-side-images", "firstImageDescription": { "value": "Mounting Phase", "narration": "During the mounting phase, several methods are called in sequence, starting with the constructor, followed by static getDerivedStateFromProps, render, componentDidMount.", "mp3": 6 }, "secondImageDescription": { "value": "Updating Phase", "narration": "In the updating phase, the methods called are static getDerivedStateFromProps, shouldComponentUpdate, render, getSnapshotBeforeUpdate, and componentDidUpdate.", "mp3": 7 } }, { "type": "middle-image", "imageDescription": "Unmounting Phase", "narration": "For the unmounting phase, the main method involved is componentWillUnmount, where cleanup tasks can be performed.", "mp3": 8 }, { "type": "title-bullets", "title": { "value": "Key Lifecycle Methods", "narration": "Now, let's take a closer look at some key lifecycle methods.", "mp3": 9 }, "bullets": [{ "value": "constructor()", "narration": "constructor(): This initializes state and binds class methods.", "mp3": 10 }, { "value": "render()", "narration": "render(): This method returns the elements to be rendered in the DOM.", "mp3": 11 }, { "value": "componentDidMount()", "narration": "componentDidMount(): Called after the component is mounted. Ideal for AJAX requests.", "mp3": 12 }, { "value": "shouldComponentUpdate()", "narration": "shouldComponentUpdate(): Determines whether a re-render is needed. Return true or false.", "mp3": 13 }, { "value": "componentDidUpdate()", "narration": "componentDidUpdate(): Executed after updates are flushed to the DOM.", "mp3": 14 }, { "value": "componentWillUnmount()", "narration": "componentWillUnmount(): Useful for cleanup like cancelling network requests, clearing timers, etc.", "mp3": 15 }] }], "audioS3Files": [{ "index": 0, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output0.mp3" }, { "index": 4, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output4.mp3" }, { "index": 1, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output1.mp3" }, { "index": 2, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output2.mp3" }, { "index": 3, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output3.mp3" }, { "index": 8, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output8.mp3" }, { "index": 7, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output7.mp3" }, { "index": 9, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output9.mp3" }, { "index": 5, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output5.mp3" }, { "index": 6, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output6.mp3" }, { "index": 10, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output10.mp3" }, { "index": 11, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output11.mp3" }, { "index": 13, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output13.mp3" }, { "index": 12, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output12.mp3" }, { "index": 14, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//8ebc8121-4108-4d50-8b86-7c72da8aad68/output14.mp3" }] }
    }
    if (question === "What are the best practices for building accessible React components") {
      return { "id": "26d2faef-ef79-47ab-8e02-48c89d26974b", "slides": [{ "type": "title-bullets", "title": { "value": "Best Practices for Accessible React Components", "narration": "Let's explore the best practices for building accessible React components.", "mp3": 1 }, "bullets": [{ "value": "Semantic HTML", "narration": "Initially, always use semantic HTML elements like <header>, <nav>, <main>, and <footer> to provide meaning to the structure of your content.", "mp3": 2 }, { "value": "Aria Attributes", "narration": "Secondly, make effective use of ARIA attributes to enhance accessibility where necessary, such as role, aria-labelledby, and aria-describedby.", "mp3": 3 }, { "value": "Keyboard Navigation", "narration": "Ensure the components are fully navigable using a keyboard by managing focus and tab order.", "mp3": 4 }, { "value": "Color Contrast", "narration": "Maintain sufficient color contrast. The contrast ratio between text and background should meet the WCAG standards.", "mp3": 5 }] }, { "type": "middle-image", "imageDescription": "A diagram showing different HTML5 semantic elements.", "narration": "Here's an illustration showing various HTML5 semantic elements like header, section, and article, which convey meaning and structure to assistive technologies.", "mp3": 6 }, { "type": "title-bullets", "title": { "value": "More Best Practices", "narration": "Next, let's look at some more practices that can boost accessibility.", "mp3": 7 }, "bullets": [{ "value": "Form Labels", "narration": "Remember to always associate form elements with labels to ensure they can be easily read and interacted with by screen readers.", "mp3": 8 }, { "value": "Alt Text for Images", "narration": "Provide descriptive alt text for images to convey the purpose and content to visually impaired users.", "mp3": 9 }, { "value": "Error Handling", "narration": "Offer clear, concise error messages and instructions to help users understand what went wrong and how to fix it.", "mp3": 10 }, { "value": "Responsive Design", "narration": "Create responsive designs to ensure that content is accessible and usable on all device types and screen sizes.", "mp3": 11 }] }, { "type": "side-by-side-images", "firstImageDescription": { "value": "A form with proper labels.", "narration": "On the left, a form showcasing how to correctly associate inputs with labels.", "mp3": 12 }, "secondImageDescription": { "value": "An image with descriptive alt text.", "narration": "On the right, an image element with a descriptive alt attribute, ensuring the purpose is conveyed to those using screen readers.", "mp3": 13 } }, { "type": "statement", "statement": "Testing and Tools", "narration": "Finally, utilize accessibility testing tools like aXe and Lighthouse to evaluate and improve the accessibility of your components continuously.", "mp3": 14 }], "audioS3Files": [{ "index": 0, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output0.mp3" }, { "index": 3, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output3.mp3" }, { "index": 2, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output2.mp3" }, { "index": 4, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output4.mp3" }, { "index": 1, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output1.mp3" }, { "index": 6, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output6.mp3" }, { "index": 8, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output8.mp3" }, { "index": 7, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output7.mp3" }, { "index": 9, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output9.mp3" }, { "index": 5, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output5.mp3" }, { "index": 10, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output10.mp3" }, { "index": 11, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output11.mp3" }, { "index": 13, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output13.mp3" }, { "index": 12, "path": "https://video-learner-audio-files.s3.us-east-2.amazonaws.com//26d2faef-ef79-47ab-8e02-48c89d26974b/output12.mp3" }] }
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
    const chatResult = chatReturn[0]
    if (!chatResult) {
      throw new Error("")
    }
    chat = chatResult
    chatId = chat.id
  } else if (chatId) {
    chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });
  }
  if (!chatId || !chat) {
    throw new Error("")
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
  await db.update(chats).set({ lastAccessed: new Date() }).where(eq(chats.id, chatId))
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
  promises.push(getImageUrls(data).catch(error => console.log(error)));
  await Promise.all(promises).catch(error => console.log(error));
  // TODO: Save data
  const result = { id: newUUID, slides: data, audioS3Files: audioS3Files } as {
    id: string;
    slides: Slide[];
    audioS3Files: { index: number; path: string }[];
  };
  console.log("Got result", JSON.stringify(result));
  await db
    .insert(messages)
    .values({
      role: "assistant",
      chatId: chatId,
      text: JSON.stringify(result),
    });
  redirect(`/chat/${chatId}`)
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
    throw new Error("")
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
  console.log(data)
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
