import { EdDSAFrogPCDPackage } from "@pcd/eddsa-frog-pcd";
import { EdDSAPCDPackage } from "@pcd/eddsa-pcd";
import { EdDSATicketPCDPackage } from "@pcd/eddsa-ticket-pcd";
import { EmailPCDPackage } from "@pcd/email-pcd";
import { EthereumOwnershipPCDPackage } from "@pcd/ethereum-ownership-pcd";
import { GPCPCDPackage } from "@pcd/gpc-pcd";
import { HaLoNoncePCDPackage } from "@pcd/halo-nonce-pcd";
import { MessagePCDPackage } from "@pcd/message-pcd";
import { requestLogToServer } from "@pcd/passport-interface";
import { PCDCollection } from "@pcd/pcd-collection";
import { PCD, PCDPackage, SerializedPCD } from "@pcd/pcd-types";
import { PODEmailPCDPackage } from "@pcd/pod-email-pcd";
import { PODPCDPackage } from "@pcd/pod-pcd";
import { PODTicketPCDPackage } from "@pcd/pod-ticket-pcd";
import { RSAImagePCDPackage } from "@pcd/rsa-image-pcd";
import { RSAPCDPackage } from "@pcd/rsa-pcd";
import { RSATicketPCDPackage } from "@pcd/rsa-ticket-pcd";
import { SemaphoreGroupPCDPackage } from "@pcd/semaphore-group-pcd";
import { SemaphoreIdentityPCDPackage } from "@pcd/semaphore-identity-pcd";
import { SemaphoreSignaturePCDPackage } from "@pcd/semaphore-signature-pcd";
import { UnknownPCDPackage, wrapUnknownPCD } from "@pcd/unknown-pcd";
import { getErrorMessage } from "@pcd/util";
import { ZKEdDSAEventTicketPCDPackage } from "@pcd/zk-eddsa-event-ticket-pcd";
import { ZKEdDSAFrogPCDPackage } from "@pcd/zk-eddsa-frog-pcd";
import { appConfig } from "./appConfig";
import { loadSelf } from "./localstorage";
import { makeEncodedVerifyLink } from "./qr";
import { getGPCArtifactsURL } from "./util";

let pcdPackages: Promise<PCDPackage[]> | undefined;

export async function getPackages(): Promise<PCDPackage[]> {
  if (pcdPackages !== undefined) {
    return pcdPackages;
  }

  pcdPackages = loadPackages();
  return pcdPackages;
}

async function loadPackages(): Promise<PCDPackage[]> {
  await SemaphoreGroupPCDPackage.init?.({
    wasmFilePath: "/semaphore-artifacts/16.wasm",
    zkeyFilePath: "/semaphore-artifacts/16.zkey"
  });

  await SemaphoreSignaturePCDPackage.init?.({
    wasmFilePath: "/semaphore-artifacts/16.wasm",
    zkeyFilePath: "/semaphore-artifacts/16.zkey"
  });

  await EthereumOwnershipPCDPackage.init?.({
    wasmFilePath: "/semaphore-artifacts/16.wasm",
    zkeyFilePath: "/semaphore-artifacts/16.zkey"
  });

  await RSATicketPCDPackage.init?.({
    makeEncodedVerifyLink
  });

  await ZKEdDSAEventTicketPCDPackage.init?.({
    wasmFilePath: "/artifacts/zk-eddsa-event-ticket-pcd/circuit.wasm",
    zkeyFilePath: "/artifacts/zk-eddsa-event-ticket-pcd/circuit.zkey"
  });

  await ZKEdDSAFrogPCDPackage.init?.({
    wasmFilePath: "/artifacts/zk-eddsa-frog-pcd/circuit.wasm",
    zkeyFilePath: "/artifacts/zk-eddsa-frog-pcd/circuit.zkey"
  });

  await MessagePCDPackage.init?.({});

  await PODPCDPackage.init?.({});

  await GPCPCDPackage.init?.({
    zkArtifactPath: getGPCArtifactsURL(
      "/" /* zupassURL can use a site-relative URL */
    )
  });

  await UnknownPCDPackage.init?.({ verifyBehavior: "error" });

  return [
    SemaphoreGroupPCDPackage,
    SemaphoreIdentityPCDPackage,
    SemaphoreSignaturePCDPackage,
    EthereumOwnershipPCDPackage,
    HaLoNoncePCDPackage,
    RSAPCDPackage,
    RSATicketPCDPackage,
    EdDSAPCDPackage,
    EdDSAFrogPCDPackage,
    ZKEdDSAFrogPCDPackage,
    EdDSATicketPCDPackage,
    ZKEdDSAEventTicketPCDPackage,
    RSAImagePCDPackage,
    EmailPCDPackage,
    MessagePCDPackage,
    PODPCDPackage,
    PODTicketPCDPackage,
    GPCPCDPackage,
    PODEmailPCDPackage,
    UnknownPCDPackage
  ];
}

export async function fallbackDeserializeFunction(
  _collection: PCDCollection,
  _pcdPackage: PCDPackage | undefined,
  serializedPCD: SerializedPCD,
  deserializeError: unknown
): Promise<PCD> {
  console.error(
    `Wrapping with UnknownPCD after failure to deserialize ${
      serializedPCD.type
    }.  ${getErrorMessage(deserializeError)}`
  );
  requestLogToServer(appConfig.zupassServer, "pcd-deserialize-fallback", {
    user: loadSelf()?.uuid,
    pcdType: serializedPCD.type,
    deserializeError,
    errorMessage: getErrorMessage(deserializeError)
  });
  return wrapUnknownPCD(serializedPCD, deserializeError);
}
