import {
  EdDSATicketPCD,
  EdDSATicketPCDPackage,
  getQRCodeColorOverride
} from "@pcd/eddsa-ticket-pcd";
import {
  QRDisplayWithRegenerateAndStorage,
  encodeQRPayload,
  icons,
  styled
} from "@pcd/passport-ui";
import { ArgumentTypeName, SerializedPCD } from "@pcd/pcd-types";
import {
  SemaphoreIdentityPCD,
  SemaphoreIdentityPCDPackage
} from "@pcd/semaphore-identity-pcd";
import {
  ZKEdDSAEventTicketPCD,
  ZKEdDSAEventTicketPCDPackage
} from "@pcd/zk-eddsa-event-ticket-pcd";
import { useCallback } from "react";
import urlJoin from "url-join";
import { EdDSATicketPCDCardProps } from "./CardBody";

function makeVerifyLink(baseUrl: string, qrPayload: string): string {
  return urlJoin(baseUrl, `?pcd=${encodeURIComponent(qrPayload)}`);
}

function makeIdBasedVerifyLink(baseUrl: string, ticketId: string): string {
  return urlJoin(baseUrl, `?id=${ticketId}`);
}

export function TicketQR({
  pcd,
  zk,
  identityPCD,
  verifyURL,
  idBasedVerifyURL
}: {
  pcd: EdDSATicketPCD;
  zk: boolean;
} & EdDSATicketPCDCardProps): JSX.Element {
  const generate = useCallback(async () => {
    if (idBasedVerifyURL && !zk) {
      // For ID-based verification, we encode the ID with a timestamp to
      // mitigate QR code re-use.
      const encodedId = Buffer.from(
        JSON.stringify({
          ticketId: pcd.claim.ticket.ticketId,
          eventId: pcd.claim.ticket.eventId,
          timestamp: Date.now().toString()
        })
      ).toString("base64");
      return makeIdBasedVerifyLink(idBasedVerifyURL, encodedId);
    } else {
      // If we're not doing ID-based verification, then we need a ZK proof
      const serializedZKPCD = await makeSerializedZKProof(pcd, identityPCD);
      return makeVerifyLink(
        verifyURL,
        encodeQRPayload(JSON.stringify(serializedZKPCD))
      );
    }
  }, [idBasedVerifyURL, zk, pcd, identityPCD, verifyURL]);
  if (zk) {
    return (
      <QRDisplayWithRegenerateAndStorage
        // Key is necessary so that React notices that this isn't the non-ZK
        // QR code component.
        key={`zk-${pcd.id}`}
        generateQRPayload={generate}
        loadingLogo={
          <LoadingIconContainer>
            <LoadingIcon src={icons.qrCenterLoading} />
          </LoadingIconContainer>
        }
        maxAgeMs={1000 * 60}
        // QR codes are cached by ID, so we need to distinguish the ZK version
        // by this prefix.
        uniqueId={`zk-${pcd.id}`}
        fgColor={getQRCodeColorOverride(pcd)}
      />
    );
  } else {
    return (
      <QRDisplayWithRegenerateAndStorage
        key={pcd.id}
        generateQRPayload={generate}
        maxAgeMs={1000 * 60}
        uniqueId={pcd.id}
        fgColor={getQRCodeColorOverride(pcd)}
      />
    );
  }
}

async function makeSerializedZKProof(
  pcd: EdDSATicketPCD,
  identityPCD: SemaphoreIdentityPCD
): Promise<SerializedPCD<ZKEdDSAEventTicketPCD>> {
  const serializedTicketPCD = await EdDSATicketPCDPackage.serialize(pcd);
  const serializedIdentityPCD =
    await SemaphoreIdentityPCDPackage.serialize(identityPCD);
  const zkPCD = await ZKEdDSAEventTicketPCDPackage.prove({
    ticket: {
      value: serializedTicketPCD,
      argumentType: ArgumentTypeName.PCD
    },
    identity: {
      value: serializedIdentityPCD,
      argumentType: ArgumentTypeName.PCD
    },
    fieldsToReveal: {
      value: {
        revealEventId: true,
        revealProductId: true,
        revealTicketId: true,
        revealTicketCategory: true
      },
      argumentType: ArgumentTypeName.ToggleList
    },
    validEventIds: {
      value: [pcd.claim.ticket.eventId],
      argumentType: ArgumentTypeName.StringArray
    },
    externalNullifier: {
      value: undefined,
      argumentType: ArgumentTypeName.BigInt
    },
    watermark: {
      value: Date.now().toString(),
      argumentType: ArgumentTypeName.BigInt
    }
  });

  return await ZKEdDSAEventTicketPCDPackage.serialize(zkPCD);
}

const LoadingIconContainer = styled.div`
  height: 100%;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const LoadingIcon = styled.img`
  height: 100px;
  width: 100px;
`;
