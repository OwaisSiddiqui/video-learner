"use client";

import LoginForm from "./login-form";
import { Button } from "./ui/button";
import { IconLogo } from "./ui/icons";
import { useState } from "react";
import Cookies from "js-cookie";

export default function GuestModal({
  isGuest,
  signIn,
}: {
  isGuest: string;
  signIn: (formData: FormData) => Promise<void>;
}) {
  const [showModal, setShowModal] = useState(isGuest !== "true");

  return (
    <div
      className={`absolute z-20 flex h-full w-full items-center justify-center bg-black bg-opacity-20 backdrop-blur-sm ${!showModal ? "hidden" : ""}`}
    >
      <div className="flex h-[500px] w-[400px] flex-col items-center gap-5 rounded-lg bg-gradient-to-b from-[#F7ECFF] to-white p-10">
        <IconLogo />
        <div className="text-center text-sm text-[#450051] ">
          Welcome to Video Learner! Enhance your learning experience with
          AI-generated presentations.
        </div>
        <div className="flex flex-col gap-6">
          <LoginForm signIn={signIn} />
          <div className="flex flex-col items-center gap-6">
            <span className="text-xs text-[#450051]">OR</span>
            <Button
              className="w-full rounded-lg py-5 "
              variant={"outline"}
              onClick={() => {
                Cookies.set("isGuest", "true");
                setShowModal(false);
              }}
            >
              Try as Guest
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
