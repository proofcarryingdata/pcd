import {
  openSignedZuzaluSignInPopup,
  SignInMessagePayload,
  useFetchParticipant,
  usePassportPopupMessages,
  useSemaphoreSignatureProof,
} from "@pcd/passport-interface";
import { useEffect, useState } from "react";
import { CollapsableCode, HomeLink } from "../../components/Core";
import { ExampleContainer } from "../../components/ExamplePage";
import { PASSPORT_SERVER_URL, PASSPORT_URL } from "../../src/constants";

/**
 * Example page which shows how to use a Zuzalu-specific prove screen to
 * request a Semaphore Signature PCD containing the user's uuid as a third
 * party developer.
 */
export default function Page() {
  // We only do client-side proofs for Zuzalu UUID proofs, which means we can
  // ignore any PendingPCDs that would result from server-side proving
  const [pcdStr, _passportPendingPCDStr] = usePassportPopupMessages();

  const [signatureProofValid, setSignatureProofValid] = useState<
    boolean | undefined
  >();
  const onProofVerified = (valid: boolean) => {
    setSignatureProofValid(valid);
  };

  const { signatureProof } = useSemaphoreSignatureProof(
    pcdStr,
    onProofVerified
  );

  // Extract UUID, the signed message of the returned PCD
  const [signedMessage, setSignedMessage] = useState<
    SignInMessagePayload | undefined
  >();
  useEffect(() => {
    if (signatureProofValid && signatureProof) {
      const signInPayload = JSON.parse(
        signatureProof.claim.signedMessage
      ) as SignInMessagePayload;
      setSignedMessage(signInPayload);
    }
  }, [signatureProofValid, signatureProof]);

  // Finally, once we have the UUID, fetch the participant data from Passport.
  const { participant } = useFetchParticipant(
    PASSPORT_SERVER_URL,
    signedMessage?.uuid
  );

  return (
    <>
      <HomeLink />
      <h2>Zuzalu UUID-revealing proof </h2>
      <p>
        This proof type is almost the same as <code>SempahoreSignaturePCD</code>
        , except one key feature: the message that is 'signed' within this PCD
        is the user's unique identifier according the the Zuzalu application.
        This uuid can be used to download information about the user from the
        Passport Server, including their name, email, and role.
      </p>
      <ExampleContainer>
        <button
          disabled={signatureProofValid}
          onClick={() =>
            openSignedZuzaluSignInPopup(
              PASSPORT_URL,
              window.location.origin + "/popup",
              "consumer-client"
            )
          }
        >
          Sign In
        </button>

        {signatureProof != null && (
          <>
            <h3>Got Semaphore Signature Proof from Passport</h3>
            <p>{`Message signed: ${signatureProof.claim.signedMessage}`}</p>
            {signatureProofValid === undefined && <p>❓ Proof verifying</p>}
            {signatureProofValid === false && <p>❌ Proof is invalid</p>}
            {signatureProofValid === true && <p>✅ Proof is valid</p>}
            {signedMessage &&
            signedMessage.referrer === window.location.host ? (
              <p>✅ Origin Matches</p>
            ) : (
              <p>❌ Origin Does Not Match</p>
            )}
            <CollapsableCode
              label="PCD Response"
              code={JSON.stringify(signatureProof, null, 2)}
            />
          </>
        )}
        {participant && (
          <>
            {participant.commitment ===
            signatureProof?.claim.identityCommitment ? (
              <p>✅ Commitment matches</p>
            ) : (
              <p>❌ Commitment does not match</p>
            )}
            <CollapsableCode
              label="Participant Response"
              code={JSON.stringify(participant, null, 2)}
            />
          </>
        )}
      </ExampleContainer>
    </>
  );
}
