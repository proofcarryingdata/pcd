import { requestUser, User } from "@pcd/passport-interface";
import { decodeQRPayload } from "@pcd/passport-ui";
import {
  SemaphoreSignaturePCDPackage,
  SemaphoreSignaturePCDTypeName
} from "@pcd/semaphore-signature-pcd";
import { useEffect, useState } from "react";
import { appConfig } from "../../src/appConfig";
import { useDispatch, useQuery } from "../../src/appHooks";
import { QRPayload } from "../../src/createQRProof";
import { bigintToUuid } from "../../src/util";
import { CenterColumn, H4, Placeholder, Spacer, TextCenter } from "../core";
import { LinkButton } from "../core/Button";
import { icons } from "../icons";
import { AppContainer } from "../shared/AppContainer";
import { MainIdentityCard } from "../shared/MainIdentityCard";
import {
  CardContainerExpanded,
  CardHeader,
  CardOutlineExpanded
} from "../shared/PCDCard";

/** You can either prove who you are, or you can prove anonymously that you're a Zuzalu resident or visitor. */
type VerifyType = "identity-proof" | "anon-proof";

type VerifyResult =
  | { valid: false; type: VerifyType; message: string }
  | { valid: true; type: "identity-proof"; user: User }
  | { valid: true; type: "anon-proof"; role: string };

// Shows whether a proof is valid. On success, shows the PCD claim visually.
export function VerifyScreen() {
  const dispatch = useDispatch();
  const query = useQuery();
  const encodedQRPayload = query.get("pcd");
  const [verifyResult, setVerifyResult] = useState<VerifyResult | undefined>();

  useEffect(() => {
    console.log(
      `Verifying Zuzalu ID proof, ${encodedQRPayload.length}b gzip+base64`
    );
  }, [encodedQRPayload.length]);

  useEffect(() => {
    deserializeAndVerify(encodedQRPayload)
      .then((res: VerifyResult) => {
        console.log("Verification result", res);
        setVerifyResult(res);
      })
      .catch((err: Error) => {
        console.error(err);
        dispatch({
          type: "error",
          error: {
            title: "Verification error",
            message: err.message,
            stack: err.stack
          }
        });
      });
  }, [encodedQRPayload, setVerifyResult, dispatch]);

  const bg = verifyResult?.valid ? "primary" : "gray";

  const icon = {
    true: icons.verifyValid,
    false: icons.verifyInvalid,
    undefined: icons.verifyInProgress
  }["" + verifyResult?.valid];

  return (
    <AppContainer bg={bg}>
      <Spacer h={48} />
      <TextCenter>
        <img draggable="false" width="90" height="90" src={icon} />
        <Spacer h={24} />
        {verifyResult == null && <H4>VERIFYING PROOF...</H4>}
        {verifyResult?.valid && (
          <H4 col="var(--accent-dark)">PROOF VERIFIED.</H4>
        )}
        {verifyResult?.valid === false && <H4>PROOF INVALID.</H4>}
      </TextCenter>
      <Spacer h={48} />
      <Placeholder minH={160}>
        {verifyResult?.valid === false && (
          <TextCenter>{verifyResult.message}</TextCenter>
        )}
        {verifyResult && verifyResult.valid && getCard(verifyResult)}
      </Placeholder>
      <Spacer h={64} />
      {verifyResult != null && (
        <CenterColumn>
          <LinkButton to="/scan">Verify another</LinkButton>
          <Spacer h={8} />
          <LinkButton to="/">Back to Zupass</LinkButton>
          <Spacer h={24} />
        </CenterColumn>
      )}
    </AppContainer>
  );
}

function getCard(result: VerifyResult) {
  if (!result.valid) throw new Error("Invalid proof");
  if (result.type !== "identity-proof") throw new Error("Not an ID proof");

  return (
    <CardContainerExpanded>
      <CardOutlineExpanded>
        <CardHeader col="var(--accent-lite)">VERIFIED ZUPASS</CardHeader>
        <MainIdentityCard user={result.user} />
      </CardOutlineExpanded>
    </CardContainerExpanded>
  );
}

async function deserializeAndVerify(pcdStr: string): Promise<VerifyResult> {
  const { deserialize, verify } = SemaphoreSignaturePCDPackage;
  const decodedPCD = decodeQRPayload(pcdStr);
  const deserializedPCD = await deserialize(JSON.parse(decodedPCD).pcd);
  console.log(
    `Got PCD, should be a Zuzalu ID semaphore proof`,
    deserializedPCD
  );

  if (deserializedPCD.type !== SemaphoreSignaturePCDTypeName) {
    throw new Error(
      `PCD type '${deserializedPCD.type}' is not a Zuzalu ID proof`
    );
  }

  const valid = await verify(deserializedPCD);
  if (!valid) {
    return { valid: false, type: "identity-proof", message: "Invalid proof" };
  }

  // Verify identity proof
  const payload = JSON.parse(deserializedPCD.claim.signedMessage) as QRPayload;
  const uuid = bigintToUuid(BigInt(payload.uuid));
  const userResult = await requestUser(appConfig.zupassServer, uuid);

  if (userResult.error?.userMissing) {
    return {
      valid: false,
      type: "identity-proof",
      message: "User not found"
    };
  }

  if (!userResult.success) {
    console.log("error lodaing user", userResult.error);
    return {
      valid: false,
      type: "identity-proof",
      message: "Error loading user"
    };
  }

  if (
    userResult.value.commitment !== deserializedPCD.claim.identityCommitment
  ) {
    return {
      valid: false,
      type: "identity-proof",
      message: "User doesn't match proof"
    };
  }

  const timeDifferenceMs = Date.now() - payload.timestamp;

  if (timeDifferenceMs >= appConfig.maxIdentityProofAgeMs) {
    return {
      valid: false,
      type: "identity-proof",
      message: "Proof expired"
    };
  }

  return { valid: true, type: "identity-proof", user: userResult.value };
}
