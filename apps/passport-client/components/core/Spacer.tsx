import * as React from "react";

export function Spacer({
  w,
  h,
}: {
  w?: 8 | 16 | 24 | 32 | 64;
  h?: 8 | 16 | 24 | 32 | 64;
}) {
  const width = w && `${w}px`;
  const height = h && `${h}px`;
  return <div style={{ width, height }} />;
}
