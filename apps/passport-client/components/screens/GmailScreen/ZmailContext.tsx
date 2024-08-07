import { PCDCollection } from "@pcd/pcd-collection";
import { createContext, useContext } from "react";
import { ZmailFilter } from "./ZmailFilter";

export interface ZmailScreenContextValue {
  pcds: PCDCollection;
  searchTerm: string;
  filters: ZmailFilter[];
  update: (update: Partial<ZmailScreenContextValue>) => void;
}

export const ZmailContext = createContext<ZmailScreenContextValue>({
  pcds: new PCDCollection([]),
  searchTerm: "",
  filters: [],
  update: () => {}
});

export function useZmailContext(): ZmailScreenContextValue {
  return useContext(ZmailContext);
}
