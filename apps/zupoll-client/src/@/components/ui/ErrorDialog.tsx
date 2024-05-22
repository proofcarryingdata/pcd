import { Dialog, Transition } from "@headlessui/react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Fragment, useRef } from "react";
import { ZupollError } from "../../../types";
import {
  SavedLoginState,
  savePreLoginRouteToLocalStorage
} from "../../../useLoginState";
import { Button } from "./button";

export default function ErrorDialog({
  close,
  logout,
  error
}: {
  close: () => void;
  error?: ZupollError;
  logout: SavedLoginState["logout"];
}) {
  const cancelButtonRef = useRef(null);

  return (
    <Transition.Root show={!!error} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-10"
        initialFocus={cancelButtonRef}
        onClose={() => {}}
      >
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-background px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="sm:flex sm:items-start">
                  {error?.friendly ? (
                    <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                      <ExclamationTriangleIcon
                        className="h-6 w-6 text-green-600"
                        aria-hidden="true"
                      />
                    </div>
                  ) : (
                    <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                      <ExclamationTriangleIcon
                        className="h-6 w-6 text-red-600"
                        aria-hidden="true"
                      />
                    </div>
                  )}

                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <Dialog.Title
                      as="h3"
                      className="text-base font-semibold leading-6 text-foreground/90"
                    >
                      {error?.title ?? "Error"}
                    </Dialog.Title>
                    <div className="mt-2">
                      <p className="text-sm text-foreground/90">
                        {error?.message}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:mt-4 flex flex-row-reverse gap-2">
                  {error?.loginAs && (
                    <Button
                      variant={"creative"}
                      type="button"
                      onClick={() => {
                        savePreLoginRouteToLocalStorage(window.location.href);

                        if (
                          error?.loginAs?.categoryId &&
                          error?.loginAs?.configName
                        ) {
                          logout(
                            error?.loginAs?.categoryId,
                            error?.loginAs?.configName
                          );
                        } else {
                          window.location.href = "/";
                        }
                      }}
                    >
                      Login
                    </Button>
                  )}

                  <Button
                    variant={"ghost"}
                    type="button"
                    onClick={() => {
                      window.location.href = "/";
                    }}
                    ref={cancelButtonRef}
                  >
                    Home
                  </Button>
                  <Button
                    variant={error?.loginAs ? "ghost" : "default"}
                    type="button"
                    onClick={() => {
                      window.location.reload();
                    }}
                    ref={cancelButtonRef}
                  >
                    Reload
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
