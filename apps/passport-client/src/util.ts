import { v4 as uuid } from "uuid";
import { Dispatcher } from "./dispatch";

export function assertUnreachable(_: never): never {
  throw new Error("Unreachable");
}

export function getReferrerHost() {
  const referrer = document.referrer;
  if (!referrer) {
    return "";
  }
  const url = new URL(referrer);
  return url.host;
}

export function getReferrerOrigin() {
  const referrer = document.referrer;
  if (!referrer) {
    return "";
  }
  const url = new URL(referrer);
  return url.origin;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

export async function nextFrame() {
  await sleep(50);
}

export function err(dispatch: Dispatcher, title: string, message: string) {
  dispatch({
    type: "error",
    error: { title, message },
  });
}

export function uuidToBigint(uuid: string): bigint {
  return BigInt("0x" + uuid.replace(/-/g, ""));
}

export function bigintToUuid(bigint: bigint): string {
  const hex = bigint.toString(16).padStart(32, "0");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16) +
    "-" +
    hex.slice(16, 20) +
    "-" +
    hex.slice(20)
  );
}

export function randomEmail() {
  return uuid().slice(0, 8) + "@test.com";
}
