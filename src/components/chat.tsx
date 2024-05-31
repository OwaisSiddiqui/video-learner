"use client";

import type {
  Message,
  MiddleImageTemplate,
  SideBySideImagesTemplate,
  Slide,
  StatementTemplate,
  TitleBulletsTemplate,
} from "@/lib/types";
import type { Slide as SlideType } from "@/lib/types";
import { type Session } from "next-auth";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEventHandler,
} from "react";
import { useFormStatus } from "react-dom";
import { IconArrowDown, IconLogoIcon, IconSend } from "./ui/icons";
import { Textarea } from "./ui/textarea";
import { getSlides } from "@/app/(chat)/actions";
import Image from "next/image";
import { Button } from "./ui/button";
import { sleep } from "openai/core.mjs";

const DEMOS = [
  {
    title: "What is",
    question: "Next.js",
  },
  {
    title: "List the benefits",
    question: "of micro frontends",
  },
  {
    title: "How does",
    question: "the React component lifecycle work",
  },
  {
    title: "What are the best practices",
    question: "for building accessible React components",
  },
];

const LoadingDots = () => {
  return (
    <Slide>
      <div className="flex h-full w-full flex-col items-center justify-center gap-2">
        <div className="text-[12px] text-gray-500">Generating Presenation</div>
        <div className="flex items-center justify-center gap-1">
          <div
            className="h-2 w-2 animate-pulse rounded-full bg-gray-300"
            style={{ animationDelay: "250ms" }}
          ></div>
          <div
            className="h-2 w-2 animate-pulse rounded-full bg-gray-300"
            style={{ animationDelay: "500ms" }}
          ></div>
          <div
            className="h-2 w-2 animate-pulse rounded-full bg-gray-300"
            style={{ animationDelay: "1s" }}
          ></div>
        </div>
      </div>
    </Slide>
  );
};

const getNarrations = (slide: Slide) => {
  switch (slide.type) {
    case "statement":
      return [slide.narration];
    case "title-bullets":
      return [
        slide.title.narration,
        ...slide.bullets.map((bullet) => bullet.narration),
      ];
    case "side-by-side-images":
      return [
        slide.firstImageDescription.narration,
        slide.secondImageDescription.narration,
      ];
    case "middle-image":
      return [slide.narration];
    default:
      return [];
  }
};

const Presentation = ({
  slideDeck,
  isLast,
}: {
  slideDeck: {
    id: string;
    slides: SlideType[];
    audioS3Files: { index: number; path: string }[];
  };
  isLast: boolean;
}) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const [narrationIndex, setNarrationIndex] = useState(0);
  const [audioNumber, setAudioNumber] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isLast) {
      void audioRef.current?.play();
    }
  }, [isLast]);

  const handleAudioEnded = () => {
    if (!slideDeck) {
      return;
    }
    const slide = slideDeck.slides[slideIndex];
    if (!slide) {
      throw new Error("");
    }
    const narrations = getNarrations(slide);
    if (narrationIndex === narrations.length - 1) {
      setSlideIndex((prev) => {
        if (prev + 1 > slideDeck.slides.length - 1) {
          return prev;
        }
        return prev + 1;
      });
      setNarrationIndex(0);
    } else {
      setNarrationIndex((prev) => prev + 1);
    }
    setAudioNumber((prev) => {
      if (prev + 1 > slideDeck.audioS3Files.length - 1) {
        return prev;
      }
      return prev + 1;
    });
  };

  const renderSlide = () => {
    if (!slideDeck) {
      return;
    }
    const slide = slideDeck.slides[slideIndex];
    if (!slide) {
      throw new Error("");
    }
    switch (slide.type) {
      case "statement":
        return <StatementSlide audioNumber={audioNumber} slide={slide} />;
      case "title-bullets":
        return <TitleBulletsSlide audioNumber={audioNumber} slide={slide} />;
      case "side-by-side-images":
        return (
          <SideBySideImagesSlide audioNumber={audioNumber} slide={slide} />
        );
      case "middle-image":
        return <MiddleImageSlide audioNumber={audioNumber} slide={slide} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col items-start gap-3">
      {slideDeck && renderSlide()}
      {slideDeck && (
        <audio
          controls
          autoPlay={isLast}
          key={audioNumber}
          ref={audioRef}
          onEnded={handleAudioEnded}
        >
          <source
            src={
              slideDeck.audioS3Files.find((file) => file.index === audioNumber)
                ?.path
            }
            type="audio/mpeg"
          />
        </audio>
      )}
    </div>
  );
};

const Slide = ({ children }: React.PropsWithChildren) => {
  return (
    <div className="border-1 flex h-[300px] w-full flex-col items-start gap-5 rounded-md border border-gray-200 bg-white px-5 py-3 text-left shadow-md lg:px-10 lg:py-8">
      {children}
    </div>
  );
};

const StatementSlide = ({
  slide,
  audioNumber,
}: {
  slide: StatementTemplate;
  audioNumber: number;
}) => (
  <Slide>
    <div
      className={`flex h-full w-full items-center justify-center text-center text-[26px] font-bold ${
        audioNumber + 1 >= slide.mp3 ? "flex" : "hidden"
      }`}
    >
      {slide.statement}
    </div>
  </Slide>
);

const TitleBulletsSlide = ({
  slide,
  audioNumber,
}: {
  slide: TitleBulletsTemplate;
  audioNumber: number;
}) => {
  return (
    <Slide>
      <h2
        className={`text-[20px] font-bold ${
          audioNumber + 1 >= slide.title.mp3 ? "flex" : "hidden"
        }`}
      >
        {slide.title.value}
      </h2>
      <ul className="list-inside list-disc ">
        {slide.bullets.map((bullet, index) => (
          <li
            className={`list-item ${
              audioNumber + 1 >= bullet.mp3 ? "block" : "hidden"
            }`}
            key={index}
          >
            {bullet.value}
          </li>
        ))}
      </ul>
    </Slide>
  );
};

const SideBySideImagesSlide = ({
  slide,
  audioNumber,
}: {
  slide: SideBySideImagesTemplate;
  audioNumber: number;
}) => {
  return (
    <Slide>
      <div className="flex h-full w-full justify-between">
        <div
          className={`w-1/2 ${
            audioNumber + 1 >= slide.firstImageDescription.mp3
              ? "flex"
              : "hidden"
          }`}
        >
          <Image
            alt=""
            width="200"
            height="200"
            className="h-full w-full object-contain"
            src={slide.firstImageDescription.imageUrl ?? ""}
          />
        </div>
        <div
          className={`w-1/2 ${
            audioNumber + 1 >= slide.secondImageDescription.mp3
              ? "flex"
              : "hidden"
          }`}
        >
          <Image
            alt=""
            width="200"
            height="200"
            className="h-full w-full object-contain"
            src={slide.secondImageDescription.imageUrl ?? ""}
          />
        </div>
      </div>
    </Slide>
  );
};

const MiddleImageSlide = ({
  slide,
  audioNumber,
}: {
  slide: MiddleImageTemplate;
  audioNumber: number;
}) => {
  return (
    <Slide>
      <div
        className={`flex ${
          audioNumber + 1 >= slide.mp3 ? "flex" : "hidden"
        } h-full w-full items-center justify-center`}
      >
        <Image
          alt=""
          width="200"
          height="200"
          className="h-full w-full object-contain"
          src={slide.imageUrl ?? ""}
          quality={100}
          loading="eager"
        />
      </div>
    </Slide>
  );
};

export const Chat = ({
  id,
  initialMessages,
  suggestions,
  session,
}: {
  id: number | null;
  initialMessages: Message[];
  session: Session | null;
  suggestions: {
    title: string;
    question: string;
  }[];
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isGuest, setIsGuest] = useState(!session?.user);

  const formRef = useRef<HTMLFormElement>(null);
  const { pending } = useFormStatus();
  const [text, setText] = useState("");
  const [scrollTopValue, setScrollTopValue] = useState(0);
  const showPrompts = useMemo(() => {
    return messages.length === 0;
  }, [messages]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [collapseDemos, setCollapseDemos] = useState(false);

  const router = useRouter();

  const onChangeTextarea: ChangeEventHandler<HTMLTextAreaElement> = (e) => {
    const textArea = e.currentTarget;
    if (textArea) {
      textArea.style.height = "1lh";
      textArea.style.height = `${textArea.scrollHeight}px`;
      setText(textArea.value);
    }
  };

  const scrollToBottom = () => {
    const scrollElm = scrollRef.current;
    if (!scrollElm) return;
    scrollElm.scrollTop = scrollElm.scrollHeight - scrollElm.clientHeight + 1;
  };

  useEffect(() => {
    scrollToBottom();
  }, []);

  useEffect(() => {
    if (isLoading) {
      scrollToBottom();
    }
  }, [isLoading]);

  useEffect(() => {
    const scrollElm = scrollRef.current;
    if (!scrollElm) return;
    if (
      scrollElm.scrollTop + 1 <
      scrollElm.scrollHeight - scrollElm.clientHeight
    ) {
      setShowScrollToBottomButton(true);
    } else {
      setShowScrollToBottomButton(false);
    }
  }, [scrollTopValue]);

  return (
    <div className="flex h-full w-full flex-1 flex-col overflow-hidden lg:pr-[150px]">
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col items-center overflow-y-auto overflow-x-hidden"
        onScroll={(e) => {
          const elm = e.target as HTMLDivElement;
          setScrollTopValue(elm.scrollTop);
        }}
      >
        <div className="mx-auto flex w-full flex-col gap-8 px-4 pb-20 pt-10 md:max-w-3xl lg:mx-0 lg:max-w-[40rem]">
          {messages.map((message, index) => {
            console.log(messages, message);
            return (
              <div className="flex flex-col gap-3 text-[15px]" key={index}>
                <div className="flex items-center gap-2">
                  {message.role === "user" ? (
                    <div className="flex size-4 rounded-full bg-[#DAD0EE]"></div>
                  ) : (
                    <IconLogoIcon />
                  )}
                  <div className="font-semibold">
                    {message.role === "user" ? "You" : "Video Learner"}
                  </div>
                </div>
                <div className="pl-[1.5rem] leading-relaxed">
                  {message.role === "assistant" && (
                    <Presentation
                      isLast={index === messages.length - 1}
                      slideDeck={
                        JSON.parse(message.text) as {
                          id: string;
                          slides: Slide[];
                          audioS3Files: { index: number; path: string }[];
                        }
                      }
                    />
                  )}
                  {message.role === "user" && message.text}
                </div>
              </div>
            );
          })}
          {isLoading && (
            <>
              <div className="flex flex-col gap-3 text-[15px]">
                <div className="gap flex items-center gap-2">
                  <IconLogoIcon />
                  <div className="font-semibold">Video Learner</div>
                </div>
                <div className="pl-[1.5rem] leading-relaxed">
                  <div className="flex w-full flex-col self-start">
                    <div>
                      <div className="flex self-start">
                        <LoadingDots />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="box-border flex w-full px-4 lg:w-3/5 lg:min-w-[500px] lg:self-center">
        <form
          ref={formRef}
          onSubmit={async (e) => {
            e.preventDefault();
            if (isGuest) {
              setCollapseDemos(true);
            }
            const form = e.currentTarget;
            const formData = new FormData(form);
            const prompt = formData.get("text");
            if (!(typeof prompt === "string")) {
              throw new Error();
            }
            form.reset();
            setText("");
            setMessages((prev) => [...prev, { role: "user", text: prompt }]);
            setIsLoading(true);
            if (isGuest) {
              textareaRef.current!.disabled = true;
            }
            if (isGuest) {
              await sleep(3000);
            }
            const data = await getSlides(prompt, id, isGuest);
            if (isGuest) {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", text: JSON.stringify(data) },
              ]);
            }
            setIsLoading(false);
          }}
          className={`relative flex flex-1 cursor-text items-center self-center rounded-[12px] border border-[#D6D6D6]  bg-gray-50 px-4 py-4 shadow-sm`}
        >
          <button
            type="button"
            className={`border-1 absolute right-[2rem] top-0 -translate-y-[calc(100%+2rem)] rounded-md border border-[#D6D6D6] bg-white p-1 ${showScrollToBottomButton ? "flex" : "hidden"}`}
            onClick={() => {
              scrollToBottom();
            }}
          >
            <IconArrowDown />
          </button>
          <Textarea
            disabled={isGuest}
            onChange={onChangeTextarea}
            name="text"
            placeholder={
              isGuest
                ? "Sign up to ask your own questions, or try out the demos!"
                : messages.length === 0
                  ? `What do you want to learn about? Or try the suggestions...`
                  : "Message Video Learner..."
            }
            className={`h-[1lh] max-h-60 min-h-0 resize-none rounded-none border-none p-0 shadow-none placeholder:text-[#BBBBBB] focus-visible:ring-0 ${isGuest && `placeholder:text-gray-700`}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && "form" in e.target) {
                e.preventDefault();
                (e.target.form as HTMLFormElement).requestSubmit();
              }
            }}
            ref={textareaRef}
          />
          <button
            disabled={!text}
            aria-disabled={pending}
            type="submit"
            className="size-6"
          >
            <IconSend className="size-6" inverted={!!text} />
          </button>
          {isGuest &&
            (collapseDemos ? (
              <div className="absolute left-0 top-0 flex w-full -translate-y-[calc(100%+1rem)] flex-col">
                <Button
                  variant={"secondary"}
                  onClick={() => {
                    setCollapseDemos(false);
                  }}
                  type="button"
                >
                  Show Demos
                </Button>
              </div>
            ) : (
              <div className="absolute left-0 top-0 flex w-full -translate-y-[calc(100%+2rem)] flex-col bg-white">
                <div className="flex w-full items-end justify-between pb-2">
                  <div className="pb-1 pl-4 text-[10px]">
                    {isGuest ? "Demos" : "Suggestions"}
                  </div>
                  <Button
                    variant={"ghost"}
                    className="text-[10px]"
                    type="button"
                    onClick={() => {
                      setCollapseDemos(true);
                    }}
                  >
                    <IconArrowDown className="size-4 text-black" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {DEMOS.map((demo, index) => {
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          textareaRef.current!.disabled = false;
                          textareaRef.current!.value = `${demo.title} ${demo.question}`;
                          console.log(textareaRef.current?.value);
                          formRef.current?.requestSubmit();
                        }}
                        className="border-1 flex flex-1 cursor-pointer flex-col overflow-hidden rounded-xl border border-[#d9d9d9] p-4 hover:bg-white"
                      >
                        <div className="text-[14px] font-semibold">
                          {demo.title}
                        </div>
                        <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-left text-[12px]">
                          {demo.question}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          {!isGuest && showPrompts && (
            <div className="absolute left-0 top-0 flex w-full -translate-y-[calc(100%+2rem)] flex-col">
              <div className="pb-1 pl-4 text-[10px]">
                {isGuest ? "Demos" : "Suggestions"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {suggestions.map((suggestion, index) => {
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        textareaRef.current!.value = `${suggestion.title} ${suggestion.question}`;
                        console.log(textareaRef.current?.value);
                        formRef.current?.requestSubmit();
                      }}
                      className="border-1 flex flex-1 cursor-pointer flex-col overflow-hidden rounded-xl border border-[#d9d9d9] p-4 hover:bg-white"
                    >
                      <div className="text-[14px] font-semibold">
                        {suggestion.title}
                      </div>
                      <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-left text-[12px]">
                        {suggestion.question}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </form>
      </div>
      <div className="flex w-full justify-center self-center text-ellipsis px-4 py-2 text-center text-[10px] text-[#B5B5B5]">
        Video Learner uses the ChatGPT API and will sometimes make mistakes.
        Consider checking important information.
      </div>
    </div>
  );
};
