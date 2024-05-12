"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { IconLogo, IconSpinner } from "./ui/icons";

export default function LoginForm({
  signIn,
}: {
  signIn: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={async function (formData) {
        await signIn(formData);
      }}
      className="relative flex flex-col items-center gap-4"
    >
      <div className="w-full flex-1 rounded-lg border bg-white px-6 pb-4 pt-8 shadow-md  dark:bg-zinc-950 md:w-96">
        <h1 className="mb-3 text-2xl font-bold">
          Get started with your email below
        </h1>
        <div className="w-full">
          <div>
            <label
              className="mb-3 mt-5 block text-xs font-medium text-zinc-400"
              htmlFor="email"
            >
              Email
            </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-md border bg-zinc-50 px-2 py-[9px] text-sm outline-none placeholder:text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950"
                id="email"
                type="text"
                name="email"
                placeholder="Enter your email address"
                required
              />
            </div>
          </div>
        </div>
        <LoginButton />
      </div>

      <Link
        href="/signup"
        className="flex flex-row gap-1 text-sm text-zinc-400"
      >
        Use this for both sign up and log in.
      </Link>
      <IconLogo className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+2rem)]" />
    </form>
  );
}

function LoginButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="my-4 flex h-10 w-full flex-row items-center justify-center rounded-md bg-zinc-900 p-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      aria-disabled={pending}
    >
      {pending ? <IconSpinner /> : "Log in"}
    </button>
  );
}
