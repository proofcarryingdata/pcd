import "mocha";
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../src/util/declarations/circomlibjs.d.ts" />

import { ArgumentTypeName } from "@pcd/pcd-types";
import { expect } from "chai";
import { prove, verify } from "../src";

describe("eddsa-pcd should work", function () {
  this.timeout(10_000);

  it("should be able to sign and verify using the PCD class", async function () {
    const prvKey =
      "0001020304050607080900010203040506070809000102030405060708090001";

    const message: string[] = ["0x12345", "0x54321", "0xdeadbeef"];

    const pcd = await prove({
      message: {
        value: message,
        argumentType: ArgumentTypeName.StringArray
      },
      privateKey: {
        value: prvKey,
        argumentType: ArgumentTypeName.String
      },
      id: {
        value: undefined,
        argumentType: ArgumentTypeName.String
      }
    });

    expect(await verify(pcd)).to.be.true;
  });
});
