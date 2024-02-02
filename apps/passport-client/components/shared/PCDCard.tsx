import {
  EdDSATicketPCD,
  TicketCategory,
  isEdDSATicketPCD
} from "@pcd/eddsa-ticket-pcd";
import { EdDSATicketPCDUI } from "@pcd/eddsa-ticket-pcd-ui";
import { PCD, PCDUI } from "@pcd/pcd-types";
import { memo, useCallback, useContext, useMemo } from "react";
import styled from "styled-components";
import { usePCDCollection, useUserIdentityPCD } from "../../src/appHooks";
import { StateContext } from "../../src/dispatch";
import { pcdRenderers } from "../../src/pcdRenderers";
import { usePackage } from "../../src/usePackage";
import { Button, H4, Spacer, TextCenter } from "../core";
import { MainIdentityCard } from "./MainIdentityCard";

export const PCDCard = memo(PCDCardImpl);

/**
 * Shows a card representing a PCD in Zupass. If expanded, the full card, otherwise
 * just the top of the card to allow stacking.
 */
function PCDCardImpl({
  isMainIdentity,
  pcd,
  expanded,
  onClick,
  hideRemoveButton
}: {
  pcd: PCD;
  expanded?: boolean;
  isMainIdentity?: boolean;
  onClick?: (id: string) => void;
  hideRemoveButton?: boolean;
}): JSX.Element {
  const clickHandler = useCallback(() => {
    onClick(pcd.id);
  }, [onClick, pcd.id]);

  if (expanded) {
    return (
      <CardContainerExpanded>
        <CardOutlineExpanded>
          <CardHeader>
            <HeaderContent pcd={pcd} isMainIdentity={isMainIdentity} />
          </CardHeader>
          <CardBodyContainer>
            <CardBody pcd={pcd} isMainIdentity={isMainIdentity} />
            {!hideRemoveButton && (
              <CardFooter pcd={pcd} isMainIdentity={isMainIdentity} />
            )}
            {hideRemoveButton && <Spacer h={8} />}
          </CardBodyContainer>
        </CardOutlineExpanded>
      </CardContainerExpanded>
    );
  }

  return (
    <CardContainerCollapsed onClick={clickHandler}>
      <CardOutlineCollapsed>
        <CardHeaderCollapsed>
          <HeaderContent pcd={pcd} isMainIdentity={isMainIdentity} />
        </CardHeaderCollapsed>
      </CardOutlineCollapsed>
    </CardContainerCollapsed>
  );
}

function HeaderContent({
  pcd,
  isMainIdentity
}: {
  pcd: PCD;
  isMainIdentity: boolean;
}): JSX.Element {
  const pcdPackage = usePackage(pcd);

  const displayOptions = useMemo(() => {
    if (pcdPackage?.getDisplayOptions) {
      return pcdPackage?.getDisplayOptions(pcd);
    }
  }, [pcd, pcdPackage]);

  const ui = getUI(pcdPackage.name);

  let header = null;
  if (isMainIdentity) {
    header = <>ZUPASS IDENTITY</>;
  } else if (ui.getHeader) {
    header = ui.getHeader({ pcd });
  } else if (displayOptions?.header) {
    header = <>{displayOptions.header.toUpperCase()}</>;
  }

  return header;
}

const CardFooter = memo(CardFooterImpl);

function CardFooterImpl({
  pcd,
  isMainIdentity
}: {
  pcd: PCD;
  isMainIdentity: boolean;
}): JSX.Element {
  const { dispatch } = useContext(StateContext);

  const onRemoveClick = useCallback(() => {
    if (
      window.confirm(
        "Are you sure you want to remove this PCD? It will be permanently deleted!"
      )
    ) {
      dispatch({ type: "remove-pcd", id: pcd.id });
    }
  }, [pcd, dispatch]);

  if (isMainIdentity) {
    return null;
  }

  return (
    <FooterContainer>
      <Button style="danger" size="small" onClick={onRemoveClick}>
        Remove
      </Button>
    </FooterContainer>
  );
}

function getUI(
  pcdPackageName: string
): PCDUI<PCD<unknown, unknown>, unknown> | undefined {
  return pcdRenderers[pcdPackageName];
}

/**
 * EdDSATicketPCD cards require some extra context and configuration. In
 * particular, they require access to the user's identity PCD for generation
 * of ZK proofs, and can be configured to include different URLs in their QR
 * codes based on the type of ticket provided.
 */
function TicketWrapper({ pcd }: { pcd: EdDSATicketPCD }): JSX.Element {
  const Card = EdDSATicketPCDUI.renderCardBody;
  const identityPCD = useUserIdentityPCD();
  // Only Devconnect and ZuConnect tickets support ID-based verification
  const ticketCategory = pcd.claim.ticket.ticketCategory;
  const idBasedVerifyURL =
    ticketCategory === TicketCategory.Devconnect
      ? `${window.location.origin}/#/checkin-by-id`
      : ticketCategory === TicketCategory.ZuConnect
      ? `${window.location.origin}/#/verify`
      : undefined;

  // Regular (not "ID-based") verification/check-in works by sending the whole
  // PCD in the URL. Generic issuance-based tickets have a separate workflow
  // for this.
  // In the long run, we will want issuers to be able to provide more metadata
  // about how check-in should work, either in the PCD itself or to be looked
  // up via some kind of registry (e.g. starting from the issuer's public key).
  // For now, we can assume that all generic tickets are coming from the
  // Zupass generic issuance server. This will change, but that change will
  // probably occur alongside other changes (e.g. ZKDF tickets) that make it
  // seem unnecessary to future-proof at this stage.
  const verifyURL =
    ticketCategory === TicketCategory.Generic
      ? `${window.location.origin}/#/generic-checkin`
      : `${window.location.origin}/#/verify`;

  return (
    <Card
      pcd={pcd}
      identityPCD={identityPCD}
      verifyURL={verifyURL}
      idBasedVerifyURL={idBasedVerifyURL}
    />
  );
}

function CardBody({
  pcd,
  isMainIdentity
}: {
  pcd: PCD;
  isMainIdentity: boolean;
}): JSX.Element {
  const pcdCollection = usePCDCollection();

  if (isMainIdentity) {
    return <MainIdentityCard />;
  }
  if (pcdCollection.hasPackage(pcd.type)) {
    const ui = getUI(pcd.type);
    if (ui) {
      if (isEdDSATicketPCD(pcd)) {
        return <TicketWrapper pcd={pcd} />;
      }
      const Component = ui.renderCardBody;
      return <Component pcd={pcd} />;
    } else {
      console.warn(`Could not find a UI renderer for PCD type "${pcd.type}"`);
    }
  }

  return (
    <>
      <TextCenter>
        {pcd.type} unsupported <br />
        no implementation of a ui for this type of card found
      </TextCenter>
      <Spacer h={16} />
    </>
  );
}

export const CardContainerExpanded = styled.div`
  width: 100%;
  padding: 8px;
`;

const CardContainerCollapsed = styled(CardContainerExpanded)`
  cursor: pointer;
  padding: 12px 8px;
`;

export const CardOutlineExpanded = styled.div`
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--accent-dark);
  background: var(--primary-dark);
  overflow: hidden;
`;

const CardOutlineCollapsed = styled.div`
  width: 100%;
  border-radius: 12px 12px 0 0;
  border: 1px solid var(--primary-lite);
  color: var(--primary-lite);
  border-bottom: none;

  :hover {
    opacity: 0.9;
  }
`;

const CardHeaderCollapsed = styled.div`
  user-select: none;
  text-align: center;
  font-size: 16px;
  padding: 8px;
`;

export const CardHeader = styled(H4)`
  text-align: center;
  padding: 10px;
`;

const FooterContainer = styled.div`
  padding: 0px 16px 16px 16px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
`;

export const CardBodyContainer = styled.div`
  background-color: white;
  color: var(--bg-dark-primary);
`;
