import { isEdDSAFrogPCD } from "@pcd/eddsa-frog-pcd";
import { isEdDSATicketPCD } from "@pcd/eddsa-ticket-pcd";
import { isEmailPCD } from "@pcd/email-pcd";
import { PCD } from "@pcd/pcd-types";
import {
  getImageUrlEntry,
  getDisplayOptions as getPodDisplayOptions,
  isPODPCD
} from "@pcd/pod-pcd";
import { isPODTicketPCD } from "@pcd/pod-ticket-pcd";
import { isUnknownPCD } from "@pcd/unknown-pcd";
import { isZKEdDSAFrogPCD } from "@pcd/zk-eddsa-frog-pcd";
import intersectionWith from "lodash/intersectionWith";
import styled, { CSSProperties } from "styled-components";
import {
  ReactElement,
  ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useSearchParams } from "react-router-dom";
import { CardBody } from "../../../components/shared/PCDCard";
import {
  useBottomModal,
  useDispatch,
  usePCDCollection
} from "../../../src/appHooks";
import { Avatar } from "../Avatar";
import { BottomModal } from "../BottomModal";
import { Button2 } from "../Button";
import { GroupType, List } from "../List";
import { Typography } from "../Typography";
import { useOrientation } from "../utils";

const getPcdName = (pcd: PCD<unknown, unknown>): string => {
  switch (true) {
    case isEdDSATicketPCD(pcd) || isPODTicketPCD(pcd):
      return pcd.claim.ticket.eventName + " - " + pcd.claim.ticket.ticketName;
    case isEmailPCD(pcd):
      return pcd.claim.emailAddress;
    case isPODPCD(pcd):
      return getPodDisplayOptions(pcd).header ?? pcd.id;
    case isEdDSAFrogPCD(pcd):
      return pcd.claim.data.name;
    case isZKEdDSAFrogPCD(pcd):
      return pcd.claim.partialFrog.name ?? pcd.id;
    case isUnknownPCD(pcd):
    default:
      return pcd.id;
  }
};
const getPCDImage = (pcd: PCD<unknown, unknown>): ReactNode | undefined => {
  switch (true) {
    case isEdDSATicketPCD(pcd) || isPODTicketPCD(pcd):
      return <Avatar imgSrc={pcd.claim.ticket.imageUrl} />;
    case isPODPCD(pcd):
      const imageUrl = getImageUrlEntry(pcd)?.value;
      if (typeof imageUrl === "string") {
        return <Avatar imgSrc={imageUrl} />;
      }
      return undefined;
    case isEdDSAFrogPCD(pcd):
      return <Avatar imgSrc={pcd.claim.data.imageUrl} />;
    case isZKEdDSAFrogPCD(pcd):
      return <Avatar imgSrc={pcd.claim.partialFrog.imageUrl} />;
    case isUnknownPCD(pcd):
    default:
      return undefined;
  }
};

type PodsCollectionListProps = {
  onPodClick?: (pcd: PCD<unknown, unknown>) => void;
  style?: CSSProperties;
};
export const PodsCollectionList = ({
  onPodClick,
  style
}: PodsCollectionListProps): ReactElement => {
  const pcdCollection = usePCDCollection();

  const podsCollectionList = useMemo(() => {
    const allPcds = pcdCollection.getAll();
    // If we have the same ticket in both POD and EDSA, we want to show only the POD one
    const podTickets = allPcds.filter(isPODTicketPCD);
    const eddsaTickets = allPcds.filter(isEdDSATicketPCD);
    const badTicketsIds = intersectionWith(eddsaTickets, podTickets, (a, b) => {
      return a.claim.ticket.ticketId === b.claim.ticket.ticketId;
    }).map((ticket) => ticket.id);
    const filteredPcds = allPcds.filter(
      (pcd) =>
        (!isEdDSATicketPCD(pcd) || !badTicketsIds.includes(pcd.id)) &&
        !isEmailPCD(pcd)
    );

    // Group PCDs by folder and create a list of groups with the items inside
    const result: Record<string, GroupType> = {};
    for (const [key, value] of Object.entries(pcdCollection.folders)) {
      if (!result[value]) {
        result[value] = {
          title: value.replace(/\//g, " · "),
          id: value, // setting the folder path as a key
          children: []
        };
      }

      const pcd = filteredPcds.find((pcd) => pcd.id === key);
      if (!pcd) continue;

      result[value].children.push({
        title: getPcdName(pcd),
        key: pcd.id || getPcdName(pcd),
        onClick: () => {
          onPodClick?.(pcd);
        },
        LeftIcon: getPCDImage(pcd)
      });
    }

    return Object.values(result).filter((group) => group.children.length > 0);
  }, [pcdCollection, onPodClick]);

  return <List style={style} list={podsCollectionList} />;
};

export const PodsCollectionBottomModal = (): JSX.Element | null => {
  const activeBottomModal = useBottomModal();
  const [scrollPosition, setScrollPosition] = useState(0);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const dispatch = useDispatch();
  const [params, setParams] = useSearchParams();
  const orientation = useOrientation();
  const isLandscape =
    orientation.type === "landscape-primary" ||
    orientation.type === "landscape-secondary";
  const isPodsCollectionModalOpen =
    activeBottomModal.modalType === "pods-collection";

  const activePod = isPodsCollectionModalOpen
    ? activeBottomModal.activePod
    : undefined;

  const modalGoBackBehavior =
    isPodsCollectionModalOpen && activeBottomModal.modalGoBackBehavior
      ? activeBottomModal.modalGoBackBehavior
      : "close";
  useLayoutEffect(() => {
    // Restore scroll position when list is shown again
    if (isPodsCollectionModalOpen && listContainerRef.current) {
      if (!activePod) {
        let pos = scrollPosition;
        const folder = params.get("folder");
        // checks if url contains folder route, and if so, scrolls to it
        if (folder) {
          const decodedFolderId = decodeURI(folder);
          const folderContainer = document.getElementById(decodedFolderId);
          if (folderContainer) {
            pos = folderContainer.offsetTop;
          }
        }
        listContainerRef.current.scrollTop = pos;
      } else {
        listContainerRef.current.scrollTop = 0;
        // resetting params when user opens a pod
        setParams("");
      }
    }
  }, [activePod, scrollPosition, params, setParams, isPodsCollectionModalOpen]);

  return (
    <BottomModal
      modalContainerStyle={{ padding: 0, paddingTop: 24 }}
      isOpen={isPodsCollectionModalOpen}
    >
      <Container isLandscape={isLandscape}>
        {!activePod && (
          <UserTitleContainer>
            <Typography fontSize={20} fontWeight={800} align="center">
              COLLECTED PODS
            </Typography>
          </UserTitleContainer>
        )}
        <ListContainer ref={listContainerRef}>
          {activePod ? (
            <CardBody isMainIdentity={false} pcd={activePod} />
          ) : (
            <PodsCollectionList
              style={{ padding: "12px 24px", paddingTop: 0 }}
              onPodClick={(pcd) => {
                listContainerRef.current &&
                  setScrollPosition(listContainerRef.current.scrollTop);
                dispatch({
                  type: "set-bottom-modal",
                  modal: {
                    modalType: "pods-collection",
                    activePod: pcd,
                    modalGoBackBehavior: "back"
                  }
                });
              }}
            />
          )}
        </ListContainer>
        <ContainerWithPadding>
          <Button2
            onClick={() => {
              if (activePod && modalGoBackBehavior !== "close") {
                dispatch({
                  type: "set-bottom-modal",
                  modal: { modalType: "pods-collection" }
                });
              } else {
                dispatch({
                  type: "set-bottom-modal",
                  modal: { modalType: "none" }
                });
              }
            }}
          >
            {activePod && modalGoBackBehavior !== "close" ? "Back" : "Close"}
          </Button2>
        </ContainerWithPadding>
      </Container>
    </BottomModal>
  );
};

const ListContainer = styled.div`
  position: relative; // important for scrolling to the right position of the folder
  overflow-y: auto;
`;

const Container = styled.div<{ isLandscape: boolean }>`
  display: flex;
  flex-direction: column;
  // 50px comes from 24px padding we have on the bottom modal
  max-height: calc(
    100vh - ${({ isLandscape }): number => (isLandscape ? 50 : 120)}px
  );
`;
const ContainerWithPadding = styled.div`
  padding: 24px 24px 24px 24px;
`;

const UserTitleContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-bottom: 24px;
`;
