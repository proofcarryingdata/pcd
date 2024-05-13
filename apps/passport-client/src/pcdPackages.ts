import { EdDSAFrogPCDPackage } from "@pcd/eddsa-frog-pcd";
import { EdDSAPCDPackage } from "@pcd/eddsa-pcd";
import { EdDSATicketPCDPackage } from "@pcd/eddsa-ticket-pcd";
import { EmailPCDPackage } from "@pcd/email-pcd";
import { EthereumOwnershipPCDPackage } from "@pcd/ethereum-ownership-pcd";
import { GPCPCDPackage } from "@pcd/gpc-pcd";
import { HaLoNoncePCDPackage } from "@pcd/halo-nonce-pcd";
import { MessagePCDPackage } from "@pcd/message-pcd";
import { PCDPackage } from "@pcd/pcd-types";
import { PODPCDPackage } from "@pcd/pod-pcd";
import { PODTicketPCDPackage } from "@pcd/pod-ticket-pcd";
import { RSAImagePCDPackage } from "@pcd/rsa-image-pcd";
import { RSAPCDPackage } from "@pcd/rsa-pcd";
import { RSATicketPCDPackage } from "@pcd/rsa-ticket-pcd";
import { SemaphoreGroupPCDPackage } from "@pcd/semaphore-group-pcd";
import { SemaphoreIdentityPCDPackage } from "@pcd/semaphore-identity-pcd";
import { SemaphoreSignaturePCDPackage } from "@pcd/semaphore-signature-pcd";
import { ZKEdDSAEventTicketPCDPackage } from "@pcd/zk-eddsa-event-ticket-pcd";
import { ZKEdDSAFrogPCDPackage } from "@pcd/zk-eddsa-frog-pcd";
import { makeEncodedVerifyLink } from "./qr";

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
    zkArtifactPath:
      "https://github.com/proofcarryingdata/snark-artifacts/raw/artwyman/experimental/packages/proto-pod-gpc"
  });

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
    GPCPCDPackage
  ];
}
