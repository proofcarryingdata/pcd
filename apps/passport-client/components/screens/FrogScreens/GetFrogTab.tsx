import { EdDSAFrogPCD } from "@pcd/eddsa-frog-pcd";
import {
  FROG_FREEROLLS,
  FeedSubscriptionManager,
  FrogCryptoUserStateResponseValue,
  Subscription,
  SubscriptionErrorType
} from "@pcd/passport-interface";
import { Separator } from "@pcd/passport-ui";
import _ from "lodash";
import prettyMilliseconds from "pretty-ms";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import styled from "styled-components";
import { useDispatch, useSubscriptions } from "../../../src/appHooks";
import { PCDCardList } from "../../shared/PCDCardList";
import { ActionButton, FrogSearchButton } from "./Button";
import { useFrogConfetti } from "./useFrogParticles";

/**
 * The GetFrog tab allows users to get frogs from their subscriptions as well as view their frogs.
 */
export function GetFrogTab({
  pcds,
  userState,
  subscriptions,
  refreshUserState
}: {
  pcds: EdDSAFrogPCD[];
  userState: FrogCryptoUserStateResponseValue;
  subscriptions: Subscription[];
  refreshUserState: () => Promise<void>;
}) {
  const { value: subManager } = useSubscriptions();
  const userStateByFeedId = useMemo(
    () => _.keyBy(userState.feeds, (feed) => feed.feedId),
    [userState]
  );
  const activeSubs = useMemo(
    () => subscriptions.filter((sub) => userStateByFeedId[sub.feed.id]?.active),
    [subscriptions, userStateByFeedId]
  );

  return (
    <>
      <SearchGroup>
        {activeSubs.length === 0 &&
          // nb: workaround where feed state is not updated instantly when the
          // first feed is added. we look for a sub that has been added 5sec ago
          // and has not been active. we might find a more elegant solution
          // later
          !!subscriptions.find(
            (sub) => sub.subscribedTimestamp < Date.now() - 5000
          ) && (
            <ErrorBox>
              Oopsie-toad! We're sprucing up the lily pads. Return soon for
              leaps and bounds of fun!
            </ErrorBox>
          )}

        {activeSubs.map((sub) => {
          const userFeedState = userState?.feeds?.find(
            (feed) => feed.feedId === sub.feed.id
          );

          return (
            <SearchButton
              key={sub.id}
              sub={sub}
              refreshUserState={refreshUserState}
              nextFetchAt={userFeedState?.nextFetchAt}
              subManager={subManager}
              score={userState?.myScore?.score}
              pcds={pcds}
            />
          );
        })}
      </SearchGroup>

      {pcds.length > 0 && (
        <>
          <Separator style={{ margin: 0 }} />
          <PCDCardList
            pcds={pcds}
            defaultSortState={{
              sortBy: "index",
              sortOrder: "desc"
            }}
            allExpanded
          />
        </>
      )}
    </>
  );
}

/**
 * Button to get a frog from a feed. It calls refreshUserState after each
 * request to ensure cooldown is updated.
 */
const SearchButton = ({
  sub: { id, feed },
  nextFetchAt,
  refreshUserState,
  score,
  subManager,
  pcds
}: {
  sub: Subscription;
  nextFetchAt?: number;
  refreshUserState: () => Promise<void>;
  score: number | undefined;
  subManager: FeedSubscriptionManager;
  pcds: EdDSAFrogPCD[];
}) => {
  const dispatch = useDispatch();
  const countDown = useCountDown(nextFetchAt || 0);
  const canFetch = !nextFetchAt || nextFetchAt < Date.now();
  const confetti = useFrogConfetti();

  const pcdsRef = useRef(pcds);
  useEffect(() => {
    pcdsRef.current = pcds;
  }, [pcds]);

  const onClick = useCallback(async () => {
    await toast
      .promise(
        Promise.all([
          new Promise<void>((resolve) => {
            setTimeout(resolve, 6000);
          }),
          new Promise<void>((resolve, reject) => {
            dispatch({
              type: "sync-subscription",
              subscriptionId: id,
              onSucess: () => {
                // nb: sync-subscription swallows http errors and always resolve as success
                const error = subManager.getError(id);
                if (error?.type === SubscriptionErrorType.FetchError) {
                  const fetchErrorMsg = error?.e?.message?.toLowerCase();
                  if (fetchErrorMsg?.includes("not active")) {
                    subManager.resetError(id);
                    return reject(
                      `Ribbit! ${feed.name} has vanished into a mist of mystery. It might return after a few bug snacks, or it might find new ponds to explore. Keep your eyes peeled for the next leap of adventure!`
                    );
                  }
                  if (fetchErrorMsg?.includes("next fetch")) {
                    subManager.resetError(id);
                    return reject(
                      "Froggy hiccup! Seems like one of our amphibians is playing camouflage. Zoo staff are peeking under every leaf. Hop back later for another try!"
                    );
                  }
                }

                resolve();
              },
              onError: reject
            });
          })
        ]).then(([, res]) => {
          confetti();
          return res;
        }),
        {
          loading: <LoadingMessages biome={feed.name} />,
          success: () => {
            const frog = _.maxBy(
              pcdsRef.current,
              (pcd) => pcd.claim.data.timestampSigned
            );
            return `You found a ${frog?.claim?.data?.name || "new frog"} in ${
              feed.name
            }!`;
          },
          error: (e) =>
            typeof e === "string" ? e : "Oopsie-toad! Something went wrong."
        }
      )
      .finally(() => refreshUserState());
  }, [confetti, dispatch, feed.name, id, refreshUserState, subManager]);
  const name = useMemo(() => `search ${_.upperCase(feed.name)}`, [feed.name]);
  const freerolls = FROG_FREEROLLS + 1 - score;

  return (
    <ActionButton
      key={id}
      onClick={onClick}
      disabled={!canFetch}
      ButtonComponent={FrogSearchButton}
    >
      {canFetch
        ? `${name}${freerolls > 0 ? ` (${freerolls} remaining)` : ""}`
        : `${name}${countDown}`}
    </ActionButton>
  );
};

const LoadingMessages = ({ biome }: { biome: string }) => {
  const messages = useMemo(
    () => [
      `Searching ${biome}...`,
      `Froggy radar scanning ${biome}...`,
      `Frogs, where are you?`,
      `Pond-ering where the frogs are hiding...`
    ],
    [biome]
  );

  const [currentMessage, setCurrentMessage] = useState("");

  // Function to get a random message
  const getRandomMessage = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * messages.length);
    setCurrentMessage(messages[randomIndex]);
  }, [messages]);

  useEffect(() => {
    // Set the initial message
    getRandomMessage();
    // Change the message every 3 seconds
    const interval = setInterval(getRandomMessage, 3000);

    // Clean up interval on unmount
    return () => clearInterval(interval);
  }, [getRandomMessage]);

  return currentMessage;
};

/**
 * Takes a future timestamp and returns a " (wait X)" string where X is a human
 * readable duration until the timestamp. Returns an empty string if the
 * timestamp is in the past.
 */
function useCountDown(timestamp: number) {
  const end = useMemo(() => new Date(timestamp), [timestamp]);
  const getDiffText = useCallback((end: Date) => {
    const now = new Date();
    const diffMs = Math.ceil((end.getTime() - now.getTime()) / 1000) * 1000;
    if (diffMs <= 0) {
      return "";
    } else {
      const diffString = prettyMilliseconds(diffMs, {
        millisecondsDecimalDigits: 0,
        secondsDecimalDigits: 0,
        unitCount: 4
      });
      return diffString;
    }
  }, []);
  const [diffText, setDiffText] = useState(() => getDiffText(end));

  useEffect(() => {
    const interval = setInterval(() => setDiffText(getDiffText(end)), 500);

    return () => {
      clearInterval(interval);
    };
  }, [end, getDiffText]);

  return diffText ? ` (wait ${diffText})` : "";
}

const SearchGroup = styled.div`
  display: flex;
  gap: 8px;
  flex-direction: column;
`;

const ErrorBox = styled.div`
  user-select: none;
  padding: 16px;
  background-color: rgba(var(--white-rgb), 0.05);
  border-radius: 16px;
  color: var(--danger-bright);
`;
