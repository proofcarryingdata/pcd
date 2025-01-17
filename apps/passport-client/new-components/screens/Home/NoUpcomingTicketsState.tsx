import { isEmailPCD } from "@pcd/email-pcd";
import { isPODEmailPCD } from "@pcd/pod-email-pcd";
import { isSemaphoreIdentityPCD } from "@pcd/semaphore-identity-pcd";
import {
  ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { useSearchParams } from "react-router-dom";
import styled from "styled-components";
import { ZappButton } from "../../../components/screens/ZappScreens/ZappButton";
import { ZappButtonsContainer } from "../../../components/screens/ZappScreens/ZappButtonsContainer";
import { ZappFullScreen } from "../../../components/screens/ZappScreens/ZappFullScreen";
import { appConfig } from "../../../src/appConfig";
import { useDispatch, usePCDCollection, useSelf } from "../../../src/appHooks";
import { BANNER_HEIGHT, MAX_WIDTH_SCREEN } from "../../../src/sharedConstants";
import { nextFrame } from "../../../src/util";
import { PodsCollectionList } from "../../shared/Modals/PodsCollectionBottomModal";
import { Typography } from "../../shared/Typography";
import { hideScrollCSS, replaceDotWithSlash } from "../../shared/utils";
import { ScrollIndicator } from "./ScrollIndicator";

const EMPTY_CARD_CONTAINER_HEIGHT = 220;
const EmptyCardContainer = styled.div<{ longVersion: boolean }>`
  display: flex;
  height: ${({ longVersion }): string =>
    longVersion ? "min(70vh, 499px)" : EMPTY_CARD_CONTAINER_HEIGHT + "px"};
  justify-content: center;
  align-items: center;
  border-radius: 16px;
  background: #e1e1e2;
  /* shadow-inset-black */
  box-shadow: 1px 1px 0px 0px rgba(0, 0, 0, 0.1) inset;
  padding: 0 40px;
  width: 100%;
  max-width: ${MAX_WIDTH_SCREEN}px;
`;

const InnerContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
`;

const ListContainer = styled.div`
  width: 100%;
  max-width: ${MAX_WIDTH_SCREEN}px;
  max-height: calc(
    100vh - ${EMPTY_CARD_CONTAINER_HEIGHT + 64 + BANNER_HEIGHT}px
  );
  overflow-y: scroll;
  border-radius: 20px;
  border: 2px solid var(--text-white);
  background: rgba(255, 255, 255, 0.8);
  padding-top: 24px;

  box-shadow: 0px 1px 2px 0px rgba(0, 0, 0, 0.05);
  position: relative;

  ${hideScrollCSS}
`;
const OuterContainer = styled.div`
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  width: 100%;
  position: relative;
`;

const Bar = styled.div`
  height: 36px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.05);
  box-shadow: 1px 1px 0px 0px rgba(0, 0, 0, 0.1) inset;
  width: 180px;
`;

const BarsContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 10px 48px 10px 48px;
  width: 100%;
  gap: 5px;
  margin-bottom: 20px;
`;

export const NoUpcomingEventsState = ({
  isLandscape
}: {
  isLandscape: boolean;
}): ReactElement => {
  const dispatch = useDispatch();
  const pods = usePCDCollection();
  const timer = useRef<NodeJS.Timeout>();
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [expandedGroupsIds, setExpandedGroupsIds] = useState<
    Record<string, boolean>
  >({});
  const [params, setParams] = useSearchParams();
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [zappUrl, setZappUrl] = useState("");
  const self = useSelf();

  // New function to check scrollability
  const checkScrollability = (): void => {
    if (listContainerRef.current) {
      const scrollable =
        listContainerRef.current.scrollHeight >
        listContainerRef.current.clientHeight;
      setShowScrollIndicator(scrollable);
    }
  };

  // Check scrollability on mount and when pods change
  useEffect(() => {
    checkScrollability();
  }, [pods]);

  const noPods =
    pods
      .getAll()
      .filter(
        (pcd) =>
          !isEmailPCD(pcd) &&
          !isSemaphoreIdentityPCD(pcd) &&
          !isPODEmailPCD(pcd)
      ).length === 0;

  useLayoutEffect(() => {
    // Restore scroll position when list is shown again
    (async (): Promise<void> => {
      if (listContainerRef.current) {
        const folder = params.get("folder");
        // checks if url contains folder route, and if so, scrolls to it
        if (folder) {
          const decodedFolderId = replaceDotWithSlash(decodeURI(folder));
          const folderContainer = document.getElementById(decodedFolderId);
          setExpandedGroupsIds((old) => {
            console.log(old);
            return {
              ...old,
              [decodedFolderId]: true
            };
          });
          await nextFrame();
          if (folderContainer) {
            console.log(folderContainer.scrollTop);
            listContainerRef.current.scroll({ top: folderContainer.offsetTop });
          }
        }
      }
    })();
    // Check scrollability after layout changes
    checkScrollability();
  }, [noPods, params, setExpandedGroupsIds]);

  if (zappUrl) {
    return (
      <ZappFullScreen
        url={zappUrl}
        onReturn={() => {
          setZappUrl("");
          params.delete("folder");
          setParams(params);
        }}
      />
    );
  }
  return (
    <OuterContainer>
      <EmptyCardContainer longVersion={noPods}>
        <InnerContainer>
          {noPods && (
            <BarsContainer>
              <Bar />
              <Bar />
              <Bar />
              <Bar />
              <Bar />
            </BarsContainer>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Typography
              fontSize={20}
              color="var(--text-primary)"
              fontWeight={800}
            >
              NO UPCOMING EVENTS
            </Typography>
            <Typography>
              Don't see your ticket?{" "}
              <a
                style={{ fontWeight: 500 }}
                onClick={() => {
                  dispatch({
                    type: "set-bottom-modal",
                    modal: {
                      modalType: "help-modal"
                    }
                  });
                }}
              >
                Learn more
              </a>
            </Typography>
          </div>
        </InnerContainer>
      </EmptyCardContainer>
      {Object.keys(appConfig.embeddedZapps).length > 0 && (
        <ZappButtonsContainer>
          {Object.entries(appConfig.embeddedZapps).map(([zappName, url]) => (
            <ZappButton
              key={zappName}
              onClick={() => {
                setZappUrl(url);
                setParams({ folder: zappName });
              }}
            >
              <iframe
                style={{
                  width: "100%",
                  height: "100%"
                }}
                src={new URL(
                  `button/${self?.semaphore_v4_commitment ?? ""}`,
                  url
                ).toString()}
              />
            </ZappButton>
          ))}
        </ZappButtonsContainer>
      )}
      {isLandscape ||
        (!noPods && (
          <ListContainer
            ref={listContainerRef}
            onScroll={(e) => {
              const scrollTop = e.currentTarget.scrollTop;
              console.log(scrollTop);
              if (scrollTop === 0) {
                // start timer
                const id = setTimeout(() => {
                  setShowScrollIndicator(true);
                }, 2000);
                timer.current = id;
              } else {
                setShowScrollIndicator(false);

                // clearing timer on scroll so it won't flash to the user mid scroll
                if (timer.current) {
                  clearTimeout(timer.current);
                  timer.current = undefined;
                }
              }
            }}
          >
            <PodsCollectionList
              onPodClick={(pcd) => {
                dispatch({
                  type: "set-bottom-modal",
                  modal: { modalType: "pods-collection", activePod: pcd }
                });
              }}
              style={{ padding: "0 20px 24px" }}
              expandedGroupsIds={expandedGroupsIds}
              setExpandedGroupsIds={setExpandedGroupsIds}
            />
            {showScrollIndicator && <ScrollIndicator />}
          </ListContainer>
        ))}
    </OuterContainer>
  );
};
