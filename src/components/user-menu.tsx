import { type Session } from "@/lib/types";

import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface UserMenuProps {
  user: Session["user"];
}

function getUserInitials(name: string) {
  const [firstName, lastName] = name.split(" ");
  if (firstName && lastName) {
    return lastName ? `${firstName[0]}${lastName[0]}` : firstName.slice(0, 2);
  }
  return name[0] ?? "";
}

export function UserMenu({ user }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="box-border flex h-auto justify-start"
        >
          <div className="flex size-7 shrink-0 select-none items-center justify-center rounded-full bg-[#DAD0EE] text-xs font-medium uppercase text-muted-foreground">
            {getUserInitials(user.email)}
          </div>
          <span className="ml-2 block">{user.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="dropdown-menu-content">
        <DropdownMenuItem className="flex-col items-start focus:bg-transparent">
          <div className="text-xs text-zinc-500">{user.email}</div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <button className=" relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none transition-colors hover:bg-red-500 hover:text-white focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
            Sign Out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
