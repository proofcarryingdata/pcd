import { ReactNode, useEffect, useState } from "react";
import { usePCDCollection } from "../../../src/appHooks";
import { PCDCard } from "../../shared/PCDCard";
import { useZmailContext } from "./ZmailContext";
import { PCDtoRow, ZmailRow } from "./ZmailTable";

export function ZmailPopover(): ReactNode {
  const ctx = useZmailContext();
  const pcds = usePCDCollection();
  const [containerRef, setContainerRef] = useState<
    HTMLDivElement | undefined
  >();

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      if (!containerRef) return;

      const sw = window.innerWidth;
      const sh = window.innerHeight;

      const r = containerRef.getBoundingClientRect();

      containerRef.style.display = "initial";

      // Calculate positions
      let left = e.clientX + 20;
      let top = e.clientY + 20;

      const margin = 20; // Minimum distance from screen edges

      // Adjust horizontal position if it overflows
      if (left + r.width > sw - margin) {
        left = Math.max(margin, e.clientX - 20 - r.width);
      }

      // Adjust vertical position if it overflows
      if (top + r.height > sh - margin) {
        top = Math.max(margin, e.clientY - 20 - r.height);
      }

      // Ensure left and top are at least 20px from edges
      left = Math.max(margin, Math.min(sw - r.width - margin, left));
      top = Math.max(margin, Math.min(sh - r.height - margin, top));

      // Apply the calculated positions
      containerRef.style.left = `${left}px`;
      containerRef.style.top = `${top}px`;

      // Clear other positioning styles
      containerRef.style.right = "";
      containerRef.style.bottom = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [containerRef]);

  let content: ReactNode;

  if (ctx.hoveringPCDID) {
    const pcd = pcds.getById(ctx.hoveringPCDID);
    if (pcd) {
      content = (
        <div className="w-[300px]">
          <PCDCard pcd={pcd} expanded={true} />
        </div>
      );
    }
  } else if (ctx.hoveringFolder) {
    const pcdsInFolder = pcds.getAllPCDsInFolder(ctx.hoveringFolder);

    content = (
      <div className="border-4 border-green-950 rounded-lg shadow-lg bg-white p-4 text-black">
        {(
          pcdsInFolder
            .map((p) => PCDtoRow(pcds, p))
            .filter((r) => !!r) as ZmailRow[]
        ).map((r) => (
          <div className="whitespace-nowrap">{r.name}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="absolute top-0 left-0 z-50">
      <div
        className="absolute"
        style={{ display: "none" }}
        ref={(e) => setContainerRef(e ?? undefined)}
      >
        {content}
      </div>
    </div>
  );
}