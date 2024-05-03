/* eslint-disable @next/next/no-img-element */
import { Dialog as HeadlessDialog, Transition } from "@headlessui/react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  getOptionImage,
  getOptionLink,
  getOptionName
} from "../../../app/ballot/BallotPoll";
import { Button } from "./button";

export default function VoteDialog({
  text,
  show,
  close,
  onVoted,
  submitButtonText
}: {
  text: string | undefined;
  show: boolean;
  close: () => void;
  onVoted: () => void;
  submitButtonText: string;
}) {
  const [memoText, setMemoText] = useState<string>(text ?? "");

  useEffect(() => {
    if (text !== undefined) {
      setMemoText(text);
    }
  }, [text]);

  const link = useMemo(() => {
    return getOptionLink(memoText);
  }, [memoText]);

  const name = useMemo(() => {
    return getOptionName(memoText);
  }, [memoText]);

  const imageUrl = useMemo(() => {
    return getOptionImage(memoText);
  }, [memoText]);

  return (
    <Transition.Root show={show} as={Fragment}>
      <HeadlessDialog as="div" className="relative z-10" onClose={close}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <HeadlessDialog.Panel className="relative transform overflow-hidden rounded-lg bg-background px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm sm:p-6">
                <div>
                  <div className="mt-3 text-center sm:mt-5">
                    <HeadlessDialog.Title
                      as="h3"
                      className="text-lg font-semibold leading-6 text-foreground"
                    >
                      {name ?? "Vote"}
                    </HeadlessDialog.Title>
                  </div>
                </div>
                {imageUrl && (
                  <div className="mt-2 min-h-10 flex items-center justify-center bg-black/5">
                    <img
                      src={imageUrl}
                      className="rounded overflow-hidden"
                      alt="project image"
                      width="100%"
                    />
                  </div>
                )}
                <div className="mt-2 sm:mt-6 flex flex-col gap-1">
                  <input type="hidden" autoFocus={true} />
                  <Button
                    variant={"creative"}
                    className="w-full"
                    onClick={onVoted}
                  >
                    {submitButtonText}
                  </Button>
                  {link ? (
                    <Link target="_blank" href={link} className="w-full">
                      <Button variant="outline" className="w-full">
                        More Details
                      </Button>
                    </Link>
                  ) : null}

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => close()}
                  >
                    Close
                  </Button>
                </div>
              </HeadlessDialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </HeadlessDialog>
    </Transition.Root>
  );
}
