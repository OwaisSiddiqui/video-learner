export type Message = {
  text: string;
  role: "user" | "assistant";
  sending?: boolean;
  id?: number;
};

export interface Session {
  user: {
    id: string;
    email: string;
  };
}

export type ChatGPTAgent = "user" | "system";

export interface ChatGPTMessage {
  role: ChatGPTAgent;
  content: string;
}

export interface OpenAIStreamPayload {
  model: string;
  messages: ChatGPTMessage[];
  temperature: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  max_tokens: number;
  stream: boolean;
  n: number;
}

export interface StatementTemplate {
  type: "statement";
  statement: string;
  narration: string;
  mp3: number;
}

export interface TitleBulletsTemplate {
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

export interface MiddleImageTemplate {
  type: "middle-image";
  imageDescription: string;
  narration: string;
  mp3: number;
  imageUrl?: string;
}

export interface SideBySideImagesTemplate {
  type: "side-by-side-images";
  firstImageDescription: {
    value: string;
    narration: string;
    mp3: number;
    imageUrl?: string;
  };
  secondImageDescription: {
    value: string;
    narration: string;
    mp3: number;
    imageUrl?: string;
  };
}

export interface User extends Record<string, unknown> {
  id: string;
  email: string;
  password: string;
  salt: string;
}

export type Slide =
  | StatementTemplate
  | TitleBulletsTemplate
  | MiddleImageTemplate
  | SideBySideImagesTemplate;
