import { Identity } from "@semaphore-protocol/identity";
import { expect } from "chai";
import "mocha";
import httpMocks from "node-mocks-http";
import { startApplication } from "../src/application";
import { PCDPass } from "../src/types";
import { randomEmail } from "./util";

describe("login", function () {
  let application: PCDPass;

  this.beforeAll(async () => {
    console.log("starting application");
    application = await startApplication();
  });

  it("should be able to log in", async function () {
    const { userService } = application.globalServices;
    const testEmail = randomEmail();
    const identity = new Identity();
    const commitment = identity.commitment.toString();

    const sendEmailResponse = httpMocks.createResponse();
    await userService.handleSendPcdPassEmail(
      testEmail,
      commitment,
      true,
      sendEmailResponse
    );

    expect(sendEmailResponse.statusCode).to.eq(200);

    if (userService.bypassEmail) {
      const sendEmailResponseJson = sendEmailResponse._getJSONData();
      expect(sendEmailResponseJson).to.haveOwnProperty("token");

      const newUserResponse = httpMocks.createResponse();
      await userService.handleNewPcdPassUser(
        sendEmailResponseJson.token,
        testEmail,
        commitment,
        newUserResponse
      );

      const newUserResponseJson = newUserResponse._getJSONData();
      expect(newUserResponseJson).to.haveOwnProperty("uuid");
      expect(newUserResponseJson).to.haveOwnProperty("commitment");
      expect(newUserResponseJson).to.haveOwnProperty("participant_email");
      expect(newUserResponseJson.commitment).to.eq(commitment);
      expect(newUserResponseJson.participant_email).to.eq(testEmail);
    }
  });
});
