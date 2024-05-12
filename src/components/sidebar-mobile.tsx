"use client";

import type { chats as chatsSchema } from "@/server/db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { type Session } from "next-auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { Button } from "./ui/button";
import { IconEdit } from "./ui/icons";
import { SheetTrigger } from "./ui/sheet";

type ChatType = InferSelectModel<typeof chatsSchema>;
type CategoriesType = {
  today: ChatType[];
  yesterday: ChatType[];
  other: ChatType[];
};

export function SidebarMobile({
  chats,
  session,
}: {
  chats: ChatType[];
  session: Session | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const categorizedChats = useMemo(() => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Helper to format date for comparison
    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    const todayStr = formatDate(today);
    const yesterdayStr = formatDate(yesterday);

    // Initialize categories
    const categories: CategoriesType = {
      today: [],
      yesterday: [],
      other: [],
    };

    // Sort chats into categories
    chats.forEach((chat) => {
      const chatDateStr = formatDate(new Date(chat.lastAccessed ?? new Date()));
      if (chatDateStr === todayStr) {
        categories.today.push(chat);
      } else if (chatDateStr === yesterdayStr) {
        categories.yesterday.push(chat);
      } else {
        categories.other.push(chat);
      }
    });

    // Sort each category by createdAt
    Object.keys(categories).forEach((key) => {
      categories[key as keyof CategoriesType].sort(
        (a, b) =>
          new Date(b.lastAccessed ?? new Date()).getTime() -
          new Date(a.lastAccessed ?? new Date()).getTime(),
      );
    });

    return categories;
  }, [chats]); // Depend on chats prop

  return (
    <>
      {session && (
        <div className="flex h-full flex-col gap-5 overflow-hidden">
          <Button
            className="border-1 flex gap-2 border border-[#E7E0F5] bg-transparent px-4 font-normal text-black shadow-none hover:bg-[#E7E0F5]"
            asChild
          >
            <a href="/">
              <IconEdit className="size-3.5 stroke-2" />
              New Chat
            </a>
          </Button>
          <div className="flex h-full flex-1 flex-col gap-1 overflow-y-scroll">
            {categorizedChats.today.length > 0 && (
              <>
                <div className="pl-2 text-[12px] text-[#A8A8A8]">Today</div>
                {categorizedChats.today.map((chat) => {
                  return (
                    <SheetTrigger key={chat.id}>
                      <Button
                        onClick={() => {
                          router.push(`/chat/${chat.id}`);
                        }}
                        key={chat.id}
                        className={`w-full items-start justify-start whitespace-nowrap ${pathname === `/chat/${chat.id}` ? "bg-[#9F83D8] bg-opacity-25" : "bg-transparent"} px-2 py-1.5 text-left font-normal text-black shadow-none hover:bg-[#9F83D8] hover:bg-opacity-25`}
                      >
                        <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
                          {chat.title}
                        </div>
                      </Button>
                    </SheetTrigger>
                  );
                })}
              </>
            )}
            {categorizedChats.yesterday.length > 0 && (
              <>
                <div className="pl-2 pt-7 text-[12px] text-[#A8A8A8]">
                  Yesterday
                </div>
                {categorizedChats.yesterday.map((chat) => {
                  return (
                    <SheetTrigger key={chat.id}>
                      <Button
                        onClick={() => {
                          router.push(`/chat/${chat.id}`);
                        }}
                        key={chat.id}
                        className={`w-full items-start justify-start whitespace-nowrap ${pathname === `/chat/${chat.id}` ? "bg-[#9F83D8] bg-opacity-25" : "bg-transparent"} px-2 py-1.5 text-left font-normal text-black shadow-none hover:bg-[#9F83D8] hover:bg-opacity-25`}
                      >
                        <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
                          {chat.title}
                        </div>
                      </Button>
                    </SheetTrigger>
                  );
                })}
              </>
            )}
            {categorizedChats.other.length > 0 && (
              <>
                <div className="pl-2 pt-7 text-[12px] text-[#A8A8A8]">
                  Previous 7 Days
                </div>
                {categorizedChats.other.map((chat) => {
                  return (
                    <SheetTrigger key={chat.id}>
                      <Button
                        onClick={() => {
                          router.push(`/chat/${chat.id}`);
                        }}
                        key={chat.id}
                        className={`w-full items-start justify-start whitespace-nowrap ${pathname === `/chat/${chat.id}` ? "bg-[#9F83D8] bg-opacity-25" : "bg-transparent"} px-2 py-1.5 text-left font-normal text-black shadow-none hover:bg-[#9F83D8] hover:bg-opacity-25`}
                      >
                        <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
                          {chat.title}
                        </div>
                      </Button>
                    </SheetTrigger>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
      {!session && (
        <div className="mt-auto flex flex-col gap-5 text-[14px] text-[#8F8F8F]">
          <div className="flex flex-col gap-2">
            <span className="font-semibold">Sign up or log in</span>
            <span>Save your chat history and personalize your experience.</span>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="default"
              asChild
              className="border-1 flex border border-[#E7E0F5] bg-[#E7E0F5] py-5 font-normal text-black shadow-none hover:bg-[#E7E0F5]"
            >
              <Link href="/login">Sign Up</Link>
            </Button>
            <Button
              variant="secondary"
              asChild
              className="border-1 flex border border-[#E7E0F5] py-5 font-normal text-black shadow-none"
            >
              <Link href="/login">Log In</Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
