import SwipableViews from "react-swipeable-views";
import styled, { FlattenSimpleInterpolation, css } from "styled-components";
import {
  ZAPP_BUTTON_HEIGHT,
  ZappButton
} from "../../../components/screens/ZappScreens/ZappButton";
import { ZappButtonsContainer } from "../../../components/screens/ZappScreens/ZappButtonsContainer";
import { ZappFullScreen } from "../../../components/screens/ZappScreens/ZappFullScreen";
import { AppContainer } from "../../../components/shared/AppContainer";
import { CardBody } from "../../../components/shared/PCDCard";
import { appConfig } from "../../../src/appConfig";
import {
  useDispatch,
  useIsDownloaded,
  useIsSyncSettled,
  usePCDCollection,
  useScrollTo,
  useSelf,
  useUserForcedToLogout
} from "../../../src/appHooks";
import { BANNER_HEIGHT, MAX_WIDTH_SCREEN } from "../../../src/sharedConstants";
import { useSyncE2EEStorage } from "../../../src/useSyncE2EEStorage";
import { nextFrame } from "../../../src/util";
import { FloatingMenu } from "../../shared/FloatingMenu";
import { NewModals } from "../../shared/Modals/NewModals";
import { NewLoader } from "../../shared/NewLoader";
import { SwipeViewContainer } from "../../shared/SwipeViewContainer";
import { TicketCard, TicketCardHeight } from "../../shared/TicketCard";
import { Typography } from "../../shared/Typography";
import {
  isMobile,
  replaceDotWithSlash,
  useOrientation
} from "../../shared/utils";
import { AddOnsModal } from "./AddOnModal";
import { NoUpcomingEventsState } from "./NoUpcomingTicketsState";
import { useTickets } from "./hooks/useTickets";
import { useWindowWidth } from "./hooks/useWindowWidth";

import { ITicketData } from "@pcd/eddsa-ticket-pcd";
import { TicketPack } from "./types";

import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/16/solid";
import { isEmailPCD } from "@pcd/email-pcd";
import { PCDGetRequest } from "@pcd/passport-interface";
import { Spacer } from "@pcd/passport-ui";
import { isPODEmailPCD } from "@pcd/pod-email-pcd";
import { isSemaphoreIdentityPCD } from "@pcd/semaphore-identity-pcd";
import {
  ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import { SyncIndicator } from "./SyncIndicator";

// @ts-expect-error TMP fix for bad lib
const _SwipableViews = SwipableViews.default;

const SCREEN_HORIZONTAL_PADDING = 20;
const TICKET_VERTICAL_GAP = 20;
const CARD_GAP = isMobile ? 8 : SCREEN_HORIZONTAL_PADDING * 2;
const SYNC_INDICATOR_CONTAINER = 12;
const disabledCSS = css`
  cursor: not-allowed;
  opacity: 0.2;
  pointer-events: none;
`;

export const PageCircleButton = styled.button<{
  disabled: boolean;
}>`
  width: 40px;
  height: 32px;
  cursor: pointer;
  border-radius: 200px;
  border: 2px solid #ffffff;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0px 1px 3px 0px rgba(0, 0, 0, 0.1),
    0px 1px 2px 0px rgba(0, 0, 0, 0.06);

  background: rgba(255, 255, 255, 0.8);
  ${({ disabled }): FlattenSimpleInterpolation | undefined =>
    disabled ? disabledCSS : undefined}
`;

const NavigationContainer = styled.div`
  display: flex;
  gap: 12px;
  align-self: center;
  border-radius: 200px;
  backdrop-filter: blur(12px);
  padding-bottom: 12px;
  width: 100%;
  justify-content: space-between;
  padding-left: 20px;
  padding-right: 20px;
`;
const ButtonsContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0 16px;
  position: absolute;
  align-items: center;
  gap: 20px;
  top: ${TicketCardHeight +
  SYNC_INDICATOR_CONTAINER}px; /* 20 px gap above card */
  left: 50%;
  transform: translateX(-50%);
`;

const getZapps = (eventId: string): [string, string][] => {
  const zapps = Object.entries(appConfig.embeddedZapps);
  if (eventId === "5074edf5-f079-4099-b036-22223c0c6995") {
    return zapps;
  }
  return [];
};
const getZappsHeight = (zapps: [string, string][]): number => {
  return zapps.length * ZAPP_BUTTON_HEIGHT + zapps.length * TICKET_VERTICAL_GAP;
};

const TicketsContainer = styled.div<{ $width: number; eventId: string }>`
  width: ${({ $width }): number => $width}px;
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: ${({ eventId }): number =>
    getZappsHeight(getZapps(eventId))
      ? getZappsHeight(getZapps(eventId)) + 28 + TICKET_VERTICAL_GAP
      : 28 + TICKET_VERTICAL_GAP}px;
  transition: gap 0.2s ease-in-out;
`;

const LoadingScreenContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin: auto 0;
`;

const MaxWidthContainer = styled.div`
  margin: auto;
  flex: 1;
  width: 100%;
  max-width: ${MAX_WIDTH_SCREEN}px;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  height: calc(100vh - ${BANNER_HEIGHT}px);
  position: relative;
  overflow: hidden;
`;

const TicketCardsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${TICKET_VERTICAL_GAP}px;
  height: 100%;
`;
const getEventDetails = (tickets: TicketPack): ITicketData => {
  return tickets.eventTicket.claim.ticket as ITicketData;
};

export const NewHomeScreen = (): ReactElement => {
  useSyncE2EEStorage();
  const tickets = useTickets();
  const collection = usePCDCollection();
  const [currentPos, setCurrentPos] = useState(0);
  const dispatch = useDispatch();
  const ticketsRef = useRef<Map<string, HTMLDivElement[]>>(new Map());
  const scrollTo = useScrollTo();
  const windowWidth = useWindowWidth();
  const self = useSelf();
  const navigate = useNavigate();
  const isDownloaded = useIsDownloaded();
  const isSyncSettled = useIsSyncSettled();
  const [params, setParams] = useSearchParams();
  const [zappUrl, setZappUrl] = useState("");
  const isInvalidUser = useUserForcedToLogout();
  const location = useLocation();
  const regularParams = useParams();
  const noPods =
    collection
      .getAll()
      .filter(
        (pcd) =>
          !isEmailPCD(pcd) &&
          !isSemaphoreIdentityPCD(pcd) &&
          !isPODEmailPCD(pcd)
      ).length === 0;

  const orientation = useOrientation();
  const isLandscape =
    isMobile &&
    (orientation.type === "landscape-primary" ||
      orientation.type === "landscape-secondary");
  useEffect(() => {
    if (!self && !location.pathname.includes("one-click-preview")) {
      navigate("/login", { replace: true });
    }
  });
  const showPodsList = tickets.length === 0 && !isLandscape && !noPods;

  // default wait for full sync, but "short-circuit" this process
  // if finished downloading and already fetched devcon tickets,
  // similar to https://github.com/proofcarryingdata/zupass/pull/2120
  const isReadyToLoadPage =
    isSyncSettled ||
    (isDownloaded && collection.getAllPCDsInFolder("Devcon SEA").length > 0);

  useLayoutEffect(() => {
    // if we haven't loaded all pcds yet, dont process the prove request
    if (!isReadyToLoadPage) return;

    const maybeExistingFolder = params.get("folder");
    if (maybeExistingFolder) {
      // Check if folder matches any zapp name (case insensitive)
      const zappEntry = Object.entries(appConfig.embeddedZapps).find(
        ([key]) => key.toLowerCase() === maybeExistingFolder.toLowerCase()
      );
      if (zappEntry) {
        setZappUrl(zappEntry[1]);
        return;
      }

      // Original folder check logic
      if (
        collection
          .getAllFolderNames()
          .includes(replaceDotWithSlash(decodeURI(maybeExistingFolder)))
      ) {
        if (!showPodsList) {
          dispatch({
            type: "set-bottom-modal",
            modal: { modalType: "pods-collection" }
          });
        }
        return;
      }
    }

    if (location.pathname.includes("prove")) {
      const params = new URLSearchParams(location.search);
      const request = JSON.parse(
        params.get("request") ?? "{}"
      ) as PCDGetRequest;
      dispatch({
        type: "set-bottom-modal",
        modal: { request, modalType: "prove" }
      });
      return;
    }
    if (params.size > 0) setParams("");
  }, [
    regularParams,
    params,
    collection,
    setParams,
    isReadyToLoadPage,
    location,
    dispatch,
    showPodsList,
    setZappUrl
  ]);
  useLayoutEffect(() => {
    const handleOneClick = async (): Promise<void> => {
      if (location.pathname.includes("one-click-preview")) {
        const queryString = window.location.hash.includes("?")
          ? window.location.hash.split("?")[1]
          : "";
        const params = new URLSearchParams(queryString);
        const redirectHash = params.get("redirectHash");
        const { email, code, targetFolder } = regularParams;

        if (!email || !code) return;

        if (self) {
          if (!self.emails?.includes(email as string)) {
            await dispatch({
              type: "reset-passport",
              redirectTo: window.location.href
            });
          } else {
            window.location.hash = targetFolder
              ? "/?folder=" + targetFolder
              : "/";
            window.location.reload();
          }
          return;
        }
        await dispatch({
          type: "one-click-login",
          email,
          code,
          targetFolder
        });

        // If there is a redirect hash, redirect to it (happens on auto login)
        if (redirectHash) {
          window.location.hash = redirectHash;
          return;
        }

        const zappEntry = Object.entries(appConfig.embeddedZapps).find(
          ([key]) => key.toLowerCase() === targetFolder?.toLowerCase()
        );
        if (zappEntry) {
          setZappUrl(zappEntry[1]);
          return;
        }
      }
    };
    handleOneClick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollTo && isSyncSettled && tickets.length > 0) {
      // getting the pos of the event card
      const eventPos = tickets.findIndex(
        (pack) => pack[0] === scrollTo.eventId
      );
      if (eventPos < 0) return;
      // scrolling to it and re-running the hook
      if (eventPos !== currentPos) {
        setCurrentPos(eventPos);
        return;
      }
      (async (): Promise<void> => {
        // making sure we let the tickets render before we fetch them from the dom
        await nextFrame();
        const elToScroll = document.getElementById(
          scrollTo.eventId + scrollTo.attendee
        );

        window.scroll({
          top: elToScroll?.offsetTop,
          left: elToScroll?.offsetLeft
        });
        dispatch({ type: "scroll-to-ticket", scrollTo: undefined });
      })();
    }
  }, [dispatch, scrollTo, currentPos, setCurrentPos, tickets, isSyncSettled]);

  const cardWidth =
    (windowWidth > MAX_WIDTH_SCREEN ? MAX_WIDTH_SCREEN : windowWidth) -
    SCREEN_HORIZONTAL_PADDING * 2;

  // if not ready yet and the user session is valid
  if (!isReadyToLoadPage && !isInvalidUser) {
    return (
      <AppContainer fullscreen={true} bg="gray">
        <LoadingScreenContainer>
          <NewLoader columns={5} rows={5} />
          <Typography
            fontSize={18}
            fontWeight={800}
            color="var(--text-tertiary)"
          >
            {isDownloaded ? "COLLECTING PODS" : "GENERATING PODS"}
          </Typography>
        </LoadingScreenContainer>
      </AppContainer>
    );
  }

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

  const moreThanOneTicket = tickets.length > 1;

  return (
    <AppContainer
      bg="gray"
      noPadding={tickets.length > 0}
      fullscreen={tickets.length > 0}
    >
      {!tickets.length && (
        <>
          <Spacer h={20} />
          <NoUpcomingEventsState isLandscape={isLandscape} />
        </>
      )}
      {tickets.length > 0 && (
        <>
          <MaxWidthContainer>
            {!(showPodsList || noPods) && <Spacer h={96} />}
            <SwipeViewContainer>
              <_SwipableViews
                disabled={!moreThanOneTicket}
                style={{
                  padding: `0 ${SCREEN_HORIZONTAL_PADDING - CARD_GAP / 2}px`
                }}
                slideStyle={{
                  padding: `0 ${CARD_GAP / 2}px`
                }}
                resistance={true}
                index={currentPos}
                onChangeIndex={(e: number) => {
                  setCurrentPos(e);
                }}
              >
                {tickets.map(([eventId, packs]) => {
                  const eventDetails = getEventDetails(packs[0]);

                  return (
                    <TicketsContainer
                      eventId={tickets[currentPos][0]}
                      $width={cardWidth}
                      key={packs.map((pack) => pack.eventTicket.id).join("-")}
                    >
                      <TicketCard
                        ticketWidth={cardWidth}
                        address={eventDetails.eventLocation}
                        title={eventDetails.eventName}
                        imgSource={eventDetails.imageUrl}
                        ticketCount={packs.length}
                        cardColor={eventDetails.accentColor ?? "#9a4ac9"}
                      />
                      <TicketCardsContainer>
                        {packs.map((pack) => {
                          return (
                            <CardBody
                              key={pack.eventName + pack.attendeeEmail}
                              addOns={
                                pack.addOns.length > 0
                                  ? {
                                      text: `View ${pack.addOns.length} add-on items`,
                                      onClick(): void {
                                        dispatch({
                                          type: "set-bottom-modal",
                                          modal: {
                                            addOns: pack.addOns,
                                            modalType: "ticket-add-ons"
                                          }
                                        });
                                      }
                                    }
                                  : undefined
                              }
                              ref={(ref) => {
                                if (!ref) return;
                                const group = ticketsRef.current.get(eventId);
                                if (!group) {
                                  ticketsRef.current.set(eventId, [ref]);
                                  return;
                                }
                                group.push(ref);
                              }}
                              pcd={pack.eventTicket}
                              isMainIdentity={false}
                            />
                          );
                        })}
                      </TicketCardsContainer>
                    </TicketsContainer>
                  );
                })}
              </_SwipableViews>
              <ButtonsContainer>
                <SyncIndicator />
                {getZapps(tickets[currentPos]?.[0]).length > 0 && (
                  <ZappButtonsContainer>
                    {Object.entries(appConfig.embeddedZapps).map(
                      ([zappName, url]) => (
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
                      )
                    )}
                  </ZappButtonsContainer>
                )}
              </ButtonsContainer>
            </SwipeViewContainer>
            {moreThanOneTicket && (
              <NavigationContainer>
                <PageCircleButton
                  disabled={currentPos === 0}
                  onClick={() => {
                    setCurrentPos((old) => {
                      if (old === 0) return old;
                      return old - 1;
                    });
                  }}
                >
                  <ChevronLeftIcon
                    width={24}
                    height={24}
                    color="var(--text-tertiary)"
                  />
                </PageCircleButton>
                <Typography
                  fontSize={14}
                  color="#8B94AC"
                  fontWeight={500}
                  family="Rubik"
                  style={{ display: "flex", alignItems: "center" }}
                >
                  {currentPos + 1} OF {tickets.length}
                </Typography>
                <PageCircleButton
                  disabled={currentPos === tickets.length - 1}
                  onClick={() => {
                    setCurrentPos((old) => {
                      if (old === tickets.length - 1) return old;
                      return old + 1;
                    });
                  }}
                >
                  <ChevronRightIcon
                    width={24}
                    height={24}
                    color="var(--text-tertiary)"
                  />
                </PageCircleButton>
              </NavigationContainer>
            )}
            <Spacer h={20} />
          </MaxWidthContainer>
        </>
      )}
      <FloatingMenu onlySettings={showPodsList || noPods} />
      <AddOnsModal />
      <NewModals />
    </AppContainer>
  );
};

export const ZappsAndTicketsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;
