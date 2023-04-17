import { ArgumentTypeName } from "@pcd/pcd-types";
import { SemaphoreSignaturePCDPackage } from "@pcd/semaphore-signature-pcd";
import { useEffect } from "react";
import { constructPassportPcdGetRequestUrl } from "./PassportInterface";
import { openPassportPopup } from "./PassportPopup";
import { useSerializedPCD } from "./SerializedPCDIntegration";

/**
 * Opens a passport popup to generate a Semaphore signature proof.
 *
 * @param urlToPassportWebsite URL of passport website
 * @param popupUrl Route where the usePassportPopupSetup hook is being served from
 * @param messageToSign Message being attested to
 * @param proveOnServer Boolean indicating whether proof should be generated on server
 */
export function openSemaphoreSignaturePopup(
  urlToPassportWebsite: string,
  popupUrl: string,
  messageToSign: string,
  proveOnServer?: boolean
) {
  const proofUrl = constructPassportPcdGetRequestUrl<
    typeof SemaphoreSignaturePCDPackage
  >(
    urlToPassportWebsite,
    popupUrl,
    SemaphoreSignaturePCDPackage.name,
    {
      identity: {
        argumentType: ArgumentTypeName.PCD,
        value: undefined,
        userProvided: true,
      },
      signedMessage: {
        argumentType: ArgumentTypeName.String,
        value: messageToSign,
        userProvided: false,
      },
    },
    {
      proveOnServer: proveOnServer,
    }
  );

  openPassportPopup(popupUrl, proofUrl);
}

/**
 * Opens a passport popup to generate a Semaphore signature proof on the user's
 * Zuzalu DB uuid, which can then be used to fetch user details from the passport
 * server. Built specifically for Zuzalu apps.
 *
 * @param urlToPassportWebsite URL of passport website
 * @param popupUrl Route where the usePassportPopupSetup hook is being served from
 * @param originalSiteName Name of site requesting proof
 */
export function openSignedZuzaluUUIDPopup(
  urlToPassportWebsite: string,
  popupUrl: string,
  originalSiteName: string
) {
  const proofUrl = constructPassportPcdGetRequestUrl<
    typeof SemaphoreSignaturePCDPackage
  >(
    urlToPassportWebsite,
    popupUrl,
    SemaphoreSignaturePCDPackage.name,
    {
      identity: {
        argumentType: ArgumentTypeName.PCD,
        value: undefined,
        userProvided: true,
      },
      signedMessage: {
        argumentType: ArgumentTypeName.String,
        userProvided: true,
        value: undefined,
      },
    },
    {
      title: "Zuzalu Auth",
      description: originalSiteName,
    }
  );

  openPassportPopup(popupUrl, proofUrl);
}

/**
 * React hook which can be used on 3rd party application websites that
 * parses and verifies a PCD representing a Semaphore signature proof.
 */
export function useSemaphoreSignatureProof(pcdStr: string, onVerified: (valid: boolean) => void) {
  const semaphoreSignaturePCD = useSerializedPCD(
    SemaphoreSignaturePCDPackage,
    pcdStr
  );

  useEffect(() => {
    if (semaphoreSignaturePCD) {
      const { verify } = SemaphoreSignaturePCDPackage;
      verify(semaphoreSignaturePCD).then(onVerified);
    }
  }, [semaphoreSignaturePCD, onVerified]);

  return {
    signatureProof: semaphoreSignaturePCD,
  };
}
