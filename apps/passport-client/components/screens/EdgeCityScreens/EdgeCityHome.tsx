import { EdDSATicketPCD, EdDSATicketPCDTypeName } from "@pcd/eddsa-ticket-pcd";
import {
  EVENT_NAME_TO_TOTAL_SUPPLY,
  EdgeCityFolderName,
  HAT_TOKEN_NAME
} from "@pcd/passport-interface";
import { useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";
import {
  useFolders,
  usePCDCollection,
  usePCDsInFolder
} from "../../../src/appHooks";
import { PCDCardList } from "../../shared/PCDCardList";
import { BalancesTab } from "./BalancesTab";
import { ExperienceModal } from "./ExperienceModal";

const TABS = [
  {
    tab: "ticket",
    label: "me"
  },
  {
    tab: "experiences",
    label: "exp"
  },
  {
    tab: "score",
    label: "bal"
  }
] as const;
type TabId = (typeof TABS)[number]["tab"];

/**
 * Renders FrogCrypto UI including rendering all EdDSAFrogPCDs.
 */
export function EdgeCityHome(): JSX.Element {
  const edgeCityPCDs = usePCDsInFolder(EdgeCityFolderName);
  const [tab, setTab] = useState<TabId>("ticket");
  const [selectedExperience, setSelectedExperience] =
    useState<EdDSATicketPCD>(null);
  const pcds = usePCDCollection();
  // const openInfo = (): void => {
  //   console.log("hi");
  // };
  useEffect(() => {
    // Set CSS variables on the html element
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--bg-dark-primary", "black");
    rootStyle.setProperty("--bg-lite-primary", "black");
    rootStyle.setProperty("--primary-dark", "black");
    rootStyle.setProperty("--accent-dark", "white");
    rootStyle.setProperty("--accent-lite", "white");

    // Optional: Cleanup function to reset the variables when the component unmounts
    return () => {
      rootStyle.removeProperty("--bg-dark-primary");
      rootStyle.removeProperty("--bg-lite-primary");
      rootStyle.removeProperty("--primary-dark");
      rootStyle.removeProperty("--accent-dark");
      rootStyle.removeProperty("--accent-lite");
      rootStyle.removeProperty("background");
    };
  }, []);
  // TODO: Query param
  const folders = useFolders(EdgeCityFolderName);

  const pcdsByEventName: Record<string, EdDSATicketPCD[]> = folders
    .flatMap((folder) => pcds.getAllPCDsInFolder(folder))
    .filter((pcd): pcd is EdDSATicketPCD => pcd.type === EdDSATicketPCDTypeName)
    .reduce((acc, pcd) => {
      // Check if the accumulator already has the eventName key
      if (!acc[pcd.claim.ticket.eventName]) {
        // If not, create it and initialize with the current item in an array
        acc[pcd.claim.ticket.eventName] = [pcd];
      } else {
        // If it exists, push the current item to the corresponding array
        acc[pcd.claim.ticket.eventName].push(pcd);
      }
      return acc; // Return the accumulator for the next iteration
    }, {}); // Initial value of the accumulator is an empty object

  return (
    <Container>
      <Title
        style={{
          margin: "0 auto",
          whiteSpace: "nowrap",
          fontFamily: "PressStart2P"
        }}
      >
        EDGE CITY
      </Title>
      {/* <img src="/images/edgecity/edgecity-banner.png" draggable={false} /> */}

      {/* TODO: Progress bar? Ranks? */}
      <div>
        <Caption>Balance</Caption>
        <Balance>
          <span>🐸</span>{" "}
          <span>
            9.4872 <ColorText>${HAT_TOKEN_NAME}</ColorText>
          </span>
        </Balance>
      </div>
      {/* <CircleButton diameter={16} padding={8} onClick={openInfo}>
        <img draggable="false" src={icons.infoPrimary} width={34} height={34} />
      </CircleButton> */}
      {/* <Score>▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░ 62%</Score> */}
      <ButtonGroup>
        {TABS.map(({ tab: t, label }) => (
          <Button
            style={{ border: "1px white solid" }}
            key={t}
            disabled={tab === t}
            onClick={(): void => setTab(t)}
          >
            {label}
          </Button>
        ))}
      </ButtonGroup>
      {tab === "ticket" && <PCDCardList hideRemoveButton pcds={edgeCityPCDs} />}
      {tab === "experiences" && (
        <div>
          <ExperiencesHeader>
            <p>
              Earn <strong>${HAT_TOKEN_NAME}</strong> by participating in
              community experiences.
            </p>
            {/* <p>Current $ZUPOINTS / $EXP exchange rate = 0.2201</p> */}
          </ExperiencesHeader>
          {Object.entries(pcdsByEventName).map(([eventName, pcds]) => {
            const maxTimes = EVENT_NAME_TO_TOTAL_SUPPLY[eventName] ?? null;
            return (
              <div>
                <CategoryHeader>
                  <span>{eventName}</span>
                  {/* TODO: Actually read N from config */}
                  <span>{`${pcds.length}/${maxTimes}`}</span>
                </CategoryHeader>
                <ItemContainer>
                  {/* ONCLICK */}
                  {pcds.flatMap((pcd) => (
                    <ItemCard onClick={(): void => setSelectedExperience(pcd)}>
                      <img
                        src={pcd.claim.ticket?.imageUrl}
                        draggable={false}
                        // style={{ opacity: 0.2 }}
                      />
                    </ItemCard>
                  ))}
                  {maxTimes &&
                    Array.from({ length: maxTimes - pcds.length }).map((_) => (
                      <ItemCard style={{ cursor: "default" }}>
                        <img
                          src={pcds[0].claim.ticket?.imageUrl}
                          draggable={false}
                          style={{ opacity: 0.5 }}
                        />
                      </ItemCard>
                    ))}
                </ItemContainer>
              </div>
            );
          })}

          {selectedExperience && (
            <ExperienceModal
              color="black"
              pcd={selectedExperience}
              onClose={(): void => setSelectedExperience(null)}
            />
          )}
        </div>
      )}
      {/* TODO: Leaderboard */}
      {tab === "score" && (
        <BalancesTab
          score={{
            score: 37,
            rank: 2,
            semaphore_id_hash: "2",
            has_telegram_username: false
          }}
          refreshScore={async (): Promise<void> => {
            console.log();
          }}
        />
      )}

      {/* {frogSubs.length > 0 &&
        (frogPCDs.length === 0 && !myScore ? (
          <>
            <TypistText
              onInit={(typewriter): TypewriterClass => {
                const text = isFromSubscriptionRef.current
                  ? `you hear a whisper. "come back again when you're stronger."`
                  : "you're certain you saw a frog wearing a monocle.";

                return typewriter
                  .typeString(text)
                  .pauseFor(500)
                  .changeDeleteSpeed(20)
                  .deleteChars(text.length)
                  .typeString(
                    retreatRef.current
                      ? "retreat was ineffective. you enter the SWAMP."
                      : "you enter the SWAMP."
                  );
              }}
            >
              <GetFrogTab
                subscriptions={frogSubs}
                userState={userState}
                refreshUserState={refreshUserState}
                pcds={frogPCDs}
              />
            </TypistText>
          </>
        ) : (
          <>
            {
              // show frog card on first pull
              // show tabs on second pull
              myScore >= 2 && (
                <ButtonGroup>
                  {TABS.map(({ tab: t, label }) => (
                    <Button
                      key={t}
                      disabled={tab === t}
                      onClick={(): void => setTab(t)}
                    >
                      {label}
                    </Button>
                  ))}
                </ButtonGroup>
              )
            }

            {tab === "get" && (
              <GetFrogTab
                subscriptions={frogSubs}
                userState={userState}
                refreshUserState={refreshUserState}
                pcds={frogPCDs}
              />
            )}
            {tab === "score" && (
              <ScoreTab
                score={userState?.myScore}
                refreshScore={refreshUserState}
              />
            )}
            {tab === "dex" && (
              <DexTab possibleFrogs={userState.possibleFrogs} pcds={frogPCDs} />
            )}
          </>
        ))} */}
    </Container>
  );
}

const Container = styled.div`
  padding: 16px;
  width: 100%;
  height: 100%;
  max-width: 100%;
  font-family: monospace;
  font-variant-numeric: tabular-nums;

  display: flex;
  flex-direction: column;
  gap: 32px;
`;

const ExperiencesHeader = styled.div`
  padding-bottom: 16px;
  border-bottom: 1px solid grey;
  margin-bottom: 16px;
`;

const Caption = styled.div`
  font-size: 16px;
  color: grey;
  text-align: center;
`;

const Balance = styled.div`
  /* display: flex;
  align-items: center;
  justify-content: space-between; */

  font-size: 16px;
  text-align: center;
`;

const Title = styled.div`
  letter-spacing: 3.5px;
  font-size: 36px;
  font-weight: 200;
`;

const CategoryHeader = styled.div`
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  /* border-bottom: 1px solid grey; */
  margin-bottom: 8px;
`;

const ItemContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-row-gap: 0px;
  grid-column-gap: 10px;
`;

const ItemCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 4px;
  aspect-ratio: 3 / 4;
  min-width: 0;
  cursor: pointer;
`;

const pulse = keyframes`
  0% {
    background-size: 100% 100%;
  }
  50% {
    background-size: 150% 150%;
  }
  100% {
    background-size: 100% 100%;
  }
`;

const lightGreen = "#94EF69";
const darkGreen = "#406F3A";

const ColorText = styled.span`
  -webkit-animation: color_change 1s infinite alternate;
  -moz-animation: color_change 1s infinite alternate;
  -ms-animation: color_change 1s infinite alternate;
  -o-animation: color_change 1s infinite alternate;
  animation: color_change 1s infinite alternate;

  /* background: radial-gradient(circle, #76b852, #8dc73f, #76b852);

  background-size: 100% 100%;
  animation: ${pulse} 2s infinite;
  color: white;
  font-size: 2rem;
  font-weight: bold;
  text-shadow: 0px 0px 8px rgba(0, 0, 0, 0.5); */
  /* color: #92eb6e;
  
  font-weight: bold;
  cursor: pointer; */

  @-webkit-keyframes color_change {
    from {
      color: ${lightGreen};
    }
    to {
      color: ${darkGreen};
    }
  }
  @-moz-keyframes color_change {
    from {
      color: ${lightGreen};
    }
    to {
      color: ${darkGreen};
    }
  }
  @-ms-keyframes color_change {
    from {
      color: ${lightGreen};
    }
    to {
      color: ${darkGreen};
    }
  }
  @-o-keyframes color_change {
    from {
      color: ${lightGreen};
    }
    to {
      color: ${darkGreen};
    }
  }
  @keyframes color_change {
    from {
      color: ${lightGreen};
    }
    to {
      color: ${darkGreen};
    }
  }
`;

// 417A35
const Button = styled.button<{ pending?: boolean }>`
  font-size: 16px;
  padding: 8px;
  border: none;
  border-radius: 4px;
  background-color: var(--black);
  color: var(--white);
  cursor: pointer;
  flex: 1;
  user-select: none;
  font-family: monospace;

  &:disabled {
    background-color: rgba(var(--white-rgb), 0.2);
    filter: drop-shadow(0px 4px 4px rgba(0, 0, 0, 0.25));
    cursor: ${(props): string => (props.pending ? "wait" : "unset")};
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  align-items: stretch;
  height: min-content;
  gap: 8px;
`;
