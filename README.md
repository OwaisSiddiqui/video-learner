
# VideoLearner.app

Video Learner is an AI chatbot that helps learn concepts by replying with a presentation-style response with AI voice narration over text-based explanations
## Features
- Accounts, sign up / log in with magic link
- Chat history
- Stream text response
- Mobile UI
## Technologies

Everything was written in TypeScript.

#### Frontend:
- React
- Next.js
- Tailwind CSS

Other:
- ShadCN UI (components library)
- React Markdown (to style text responses)
- Sonner (toast component)

#### Backend:
- Next.js App Router

Other:
- Auth.js (for authentication) (w/ Resend provider)
- Drizzle ORM (Postgres)
- OpenAI GPT API (for LLM)
- Zod (for data validation)
#### Deploy
- Vercel (CDN)
- Supabase (hosted Postgres database)
- Pusher (hosted WebSockets)