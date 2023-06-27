import {
  PendingPCDStatus,
  ProveRequest,
  StatusResponse,
} from "@pcd/passport-interface";
import { ArgumentTypeName } from "@pcd/pcd-types";
import { SemaphoreIdentityPCDPackage } from "@pcd/semaphore-identity-pcd";
import { SemaphoreSignaturePCDPackage } from "@pcd/semaphore-signature-pcd";
import { Identity } from "@semaphore-protocol/identity";
import chai, { expect } from "chai";
import spies from "chai-spies";
import "mocha";
import { step } from "mocha-steps";
import { startApplication, stopApplication } from "../src/application";
import { PCDPass } from "../src/types";
import { submitAndWaitForPendingPCD } from "./proving/proving";

chai.use(spies);

describe("semaphore service", function () {
  this.timeout(0);

  let application: PCDPass;

  this.beforeAll(async () => {
    console.log("starting application");
    application = await startApplication();
  });

  this.afterAll(async () => {
    await stopApplication(application);
  });

  step(
    "should handle case when there is no matching pcd package",
    async function () {
      const proveRequest: ProveRequest = {
        args: {},
        pcdType: "",
      };

      await submitAndWaitForPendingPCD(application, proveRequest, async (r) => {
        const settledStatusResponse = r.body as StatusResponse;
        expect(settledStatusResponse.status).to.eq(PendingPCDStatus.ERROR);
      });
    }
  );

  step(
    "should be able to remotely prove semaphore signature pcd",
    async function () {
      const proveRequest: ProveRequest<typeof SemaphoreSignaturePCDPackage> = {
        args: {
          identity: {
            argumentType: ArgumentTypeName.PCD,
            pcdType: SemaphoreIdentityPCDPackage.name,
            value: await SemaphoreIdentityPCDPackage.serialize(
              await SemaphoreIdentityPCDPackage.prove({
                identity: new Identity(),
              })
            ),
          },
          signedMessage: {
            argumentType: ArgumentTypeName.String,
            value: "test",
          },
        },
        pcdType: SemaphoreSignaturePCDPackage.name,
      };

      const expectedResult = await SemaphoreSignaturePCDPackage.prove(
        proveRequest.args
      );
      expect(await SemaphoreSignaturePCDPackage.verify(expectedResult)).to.eq(
        true
      );

      await submitAndWaitForPendingPCD(application, proveRequest, async (r) => {
        const settledStatusResponse = r.body as StatusResponse;
        expect(settledStatusResponse.status).to.eq(PendingPCDStatus.COMPLETE);
        expect(settledStatusResponse).to.haveOwnProperty("serializedPCD");

        const parsedPCD = await SemaphoreSignaturePCDPackage.deserialize(
          JSON.parse(settledStatusResponse.serializedPCD!).pcd
        );

        expect(parsedPCD.claim).to.deep.eq(expectedResult.claim);
        expect(await SemaphoreSignaturePCDPackage.verify(parsedPCD)).to.eq(
          true
        );
      });
    }
  );
});
