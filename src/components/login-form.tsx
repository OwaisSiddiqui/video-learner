"use client";

import { useFormStatus } from "react-dom";
import { IconSpinner } from "./ui/icons";
import { Button } from "./ui/button";

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
      className="w-full"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="text-center text-lg font-bold text-[#450051]">
            Sign up with your email
          </h1>
          <h1 className="text-center text-xs text-[#74517A]">
            No password required (login through email link)
          </h1>
        </div>
        <div className="flex w-full flex-col gap-2">
          <div className="relative">
            <input
              className="w-full rounded-md border border-[#9372D3] px-4 py-4 text-sm placeholder:text-zinc-500"
              id="email"
              type="text"
              name="email"
              placeholder="Enter your email address"
              required
            />
          </div>
          <LoginButton />
        </div>
      </div>
    </form>
  );
}

function LoginButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="w-full rounded-lg bg-[#9372D3] py-5"
      aria-disabled={pending}
    >
      {pending ? <IconSpinner /> : "Continue"}
    </Button>
  );
}
