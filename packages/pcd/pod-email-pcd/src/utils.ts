import { PCD } from "@pcd/pcd-types";
import { PODEmailPCD, PODEmailPCDTypeName } from "./PODEmailPCD";

export function isPODEmailPCD(pcd: PCD): pcd is PODEmailPCD {
  return pcd.type === PODEmailPCDTypeName;
}
