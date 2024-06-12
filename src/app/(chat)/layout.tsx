import { auth } from "@/auth";
import { Sidebar } from "@/components/sidebar";
import { SidebarMobile } from "@/components/sidebar-mobile";
import { IconEdit, IconLogo, IconMenu } from "@/components/ui/icons";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { UserMenu } from "@/components/user-menu";
import { getChats } from "./actions";

// export const maxDuration = 60;
// export const runtime = "edge";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
  params: {
    id: string;
  };
}) {
  const session = await auth();
  console.log("LAYOUT", session?.user?.email)
  const chats = await getChats();

  return (
    <div className="flex w-full flex-col overflow-hidden lg:flex-row">
      <div className="hidden h-full w-[300px] flex-col bg-[#f9f9f9] px-3 py-3 lg:flex">
        <div className="flex p-4">
          <IconLogo />
        </div>
        <Sidebar chats={chats ?? []} session={session} />
        {session?.user?.email && session?.user.id && (
          <UserMenu
            user={{
              email: session.user.email,
              id: session.user.id,
            }}
          />
        )}
      </div>
      <Sheet>
        <div className="border-1 flex justify-between border border-[#E7E0F5] p-2 lg:hidden">
          <SheetTrigger>
            <IconMenu className="size-6" />
          </SheetTrigger>
          <div className="text-base font-medium">Video Learner</div>
          <button>
            <a href="/">
              <IconEdit className="size-6" />
            </a>
          </button>
        </div>
        <SheetContent className="flex flex-col" side={"left"}>
          <SidebarMobile chats={chats ?? []} session={session} />
          {session?.user?.email && session?.user.id && (
            <UserMenu
              user={{
                email: session.user.email,
                id: session.user.id,
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      {children}
    </div>
  );
}
