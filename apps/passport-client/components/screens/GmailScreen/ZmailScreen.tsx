import React, { useMemo, useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { usePCDCollection } from "../../../src/appHooks";
import { NewButton } from "../../NewButton";
import { ZupassTitle } from "../HomeScreen/HomeScreen";
import { ZmailContext, ZmailScreenContextValue } from "./ZmailContext";
import { ZmailPCDScreenImpl } from "./ZmailPCDScreen";
import { ZmailSidebar } from "./ZmailSidebar";
import { ZmailTable } from "./ZmailTable";

export const ZmailScreen = React.memo(ZmailScreenImpl);

export function ZmailScreenImpl(): JSX.Element | null {
  const pcds = usePCDCollection();
  const [ctx, setCtx] = useState<ZmailScreenContextValue>({
    pcds,
    filters: [],
    searchTerm: "",
    update: () => {}
  });
  ctx.update = useMemo(() => {
    return (update: Partial<ZmailScreenContextValue>) => {
      setCtx({ ...ctx, ...update });
    };
  }, [ctx]);

  return (
    <ZmailContext.Provider value={ctx}>
      <div className="h-[100vh] max-h-[100vh] overflow-hidden flex flex-col">
        {/* header */}
        <div className="flex flex-row justify-between px-4 pt-4">
          <ZupassTitle
            className="w-[300px] box-border px-4"
            style={{ fontSize: "2.5em", lineHeight: "1.5em" }}
          >
            <span
              className="cursor-pointer"
              onClick={() => {
                ctx.update({
                  filters: [],
                  searchTerm: "",
                  viewingPCDID: undefined
                });
              }}
            >
              Zmail
            </span>
          </ZupassTitle>

          <NewButton
            className="inline-block"
            onClick={() => {
              window.location.href = "/#/";
            }}
          >
            Back to Zupass
          </NewButton>
        </div>

        {/* content */}
        <div className="flex flex-row flex-grow overflow-hidden">
          <div className="w-[300px] flex-shrink-0 box-border h-full">
            <ZmailSidebar />
          </div>
          <div className="flex-grow flex flex-col gap-4 p-4 pl-0 h-full">
            <div className="h-full bg-white overflow-hidden rounded-lg flex flex-col">
              <div className="min-h-3 bg-gray-300 flex-shrink-0">
                {ctx.viewingPCDID && (
                  <>
                    <div
                      className="bg-red-500 flex items-center justify-center"
                      style={{
                        borderRadius: "50%",
                        width: "30px",
                        minWidth: "30px",
                        maxWidth: "30px",
                        height: "30px",
                        minHeight: "30px",
                        maxHeight: "30px"
                      }}
                    >
                      <FaArrowLeft />
                    </div>
                  </>
                )}
              </div>
              {ctx.viewingPCDID ? <ZmailPCDScreenImpl /> : <ZmailTable />}

              <div className="h-3 bg-gray-300 flex-shrink-0"></div>
            </div>
          </div>
        </div>
      </div>
    </ZmailContext.Provider>
  );
}