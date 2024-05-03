import { useZupassPopupMessages } from "@pcd/passport-interface/PassportPopup/react";
import { generateSnarkMessageHash, getErrorMessage } from "@pcd/util";
import { BallotConfig, BallotType } from "@pcd/zupoll-shared";
import { sha256 } from "js-sha256";
import stableStringify from "json-stable-stringify";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { Poll, UserType } from "../../api/prismaTypes";
import {
  BallotSignal,
  CreateBallotRequest,
  PollSignal
} from "../../api/requestTypes";
import { LoginState, PCDState, ZupollError } from "../../types";
import {
  USE_CREATE_BALLOT_REDIRECT,
  openGroupMembershipPopup,
  removeQueryParameters
} from "../../util";
import { CreateBallotResponse, createBallot } from "../../zupoll-server-api";
import { useHistoricVoterSemaphoreUrl } from "./useHistoricSemaphoreUrl";

/**
 * Hook that handles requesting a PCD for creating a ballot.
 *
 * @param ballotTitle title of ballot
 * @param ballotDescription description of ballot
 * @param ballotType type of ballot
 * @param expiry expiry date of ballot
 * @param polls polls in this ballot
 * @param onError Error handler to display in ErrorDialog
 * @param setServerLoading Passing server loading status to frontend
 */
export function useCreateBallot({
  ballotTitle,
  ballotDescription,
  ballotConfig,
  expiry,
  polls,
  isPublic,
  onError,
  setServerLoading,
  loginState,
  ballotFromUrl,
  pcdFromUrl,
  setBallotFromUrl,
  setPcdFromUrl,
  url
}: {
  ballotTitle: string;
  ballotDescription: string;
  ballotConfig?: BallotConfig;
  expiry: Date;
  polls: Poll[];
  isPublic: boolean;
  onError: (err: ZupollError) => void;
  setServerLoading: (loading: boolean) => void;
  loginState: LoginState;
  ballotFromUrl?: BallotFromUrl;
  pcdFromUrl?: string;
  setBallotFromUrl: (ballot?: BallotFromUrl) => void;
  setPcdFromUrl: (pcd: string) => void;
  url?: string;
}) {
  const router = useRouter();
  const pcdState = useRef<PCDState>(PCDState.DEFAULT);
  const [pcdStr, _passportPendingPCDStr] = useZupassPopupMessages();

  const {
    loading: loadingVoterGroupUrl,
    rootHash: voterGroupRootHash,
    voterGroupUrl
  } = useHistoricVoterSemaphoreUrl(ballotConfig, onError);

  const submitBallot = useCallback(
    async (finalRequest: CreateBallotRequest) => {
      setServerLoading(true);
      const res = await createBallot(finalRequest, loginState.token);

      if (res === undefined) {
        const serverDownError: ZupollError = {
          title: "Creating poll failed",
          message: "Server is down. Contact support@zupass.org."
        };
        onError(serverDownError);
        removeQueryParameters(["proof", "finished"]);
        localStorage.removeItem("pending-ballot");
        setServerLoading(false);
        return;
      }

      if (!res.ok) {
        const resErr = await res.text();
        console.error("error posting vote to the server: ", resErr);
        const err: ZupollError = {
          title: "Creating poll failed",
          message: `Server Error: ${resErr}`
        };
        onError(err);
        removeQueryParameters(["proof", "finished"]);
        localStorage.removeItem("pending-ballot");
        setServerLoading(false);
        return;
      }

      res
        .json()
        .then((res: CreateBallotResponse) => {
          router.push(`/ballot?id=${encodeURIComponent(res.url)}`);
        })
        .catch((e) => {
          setServerLoading(false);
          onError({
            title: "Creating poll failed",
            message: getErrorMessage(e)
          } satisfies ZupollError);
        });
    },
    [loginState.token, onError, router, setServerLoading]
  );

  // only accept pcdStr if we were expecting one
  useEffect(() => {
    if (pcdState.current === PCDState.AWAITING_PCDSTR) {
      pcdState.current = PCDState.RECEIVED_PCDSTR;
    }
  }, [pcdStr]);

  // process ballot
  useEffect(() => {
    if (ballotConfig && ballotFromUrl && pcdFromUrl) {
      setServerLoading(true);
      const parsedPcd = JSON.parse(decodeURIComponent(pcdFromUrl));
      const { ballotSignal, ballotConfig, polls } = ballotFromUrl;
      const request = generateBallotRequest({
        ballotConfig,
        ...ballotSignal,
        polls,
        voterGroupRoots: ballotSignal.voterSemaphoreGroupRoots,
        voterGroupUrls: ballotSignal.voterSemaphoreGroupUrls,
        proof: parsedPcd.pcd,
        creatorGroupUrl: ballotConfig.creatorGroupUrl,
        pipelineId: ballotSignal.pipelineId,
        isPublic: ballotFromUrl.ballotSignal.isPublic
      });
      // Do request
      submitBallot(request);
      setBallotFromUrl(undefined);
      setPcdFromUrl("");
    } else {
      if (pcdState.current !== PCDState.RECEIVED_PCDSTR) return;
      if (
        voterGroupUrl == null ||
        voterGroupRootHash == null ||
        ballotConfig == null
      )
        return;
      pcdState.current = PCDState.DEFAULT;
      const parsedPcd = JSON.parse(decodeURIComponent(pcdStr));
      const finalRequest = generateBallotRequest({
        ballotTitle,
        ballotDescription,
        proof: parsedPcd.pcd,
        polls,
        ballotType: ballotConfig.ballotType,
        voterGroupRoots: [voterGroupRootHash],
        voterGroupUrls: [voterGroupUrl],
        expiry,
        creatorGroupUrl: ballotConfig.creatorGroupUrl,
        pipelineId: loginState.config.pipelineId,
        isPublic
      });

      submitBallot(finalRequest);
    }
  }, [
    ballotDescription,
    ballotTitle,
    ballotConfig,
    expiry,
    pcdStr,
    polls,
    router,
    voterGroupRootHash,
    voterGroupUrl,
    ballotConfig?.creatorGroupUrl,
    pcdFromUrl,
    ballotFromUrl,
    setBallotFromUrl,
    setPcdFromUrl,
    submitBallot,
    setServerLoading,
    loginState.config.pipelineId,
    isPublic
  ]);

  // ran after ballot is submitted by user
  const createBallotPCD = useCallback(async () => {
    if (
      ballotConfig == null ||
      voterGroupUrl == null ||
      voterGroupRootHash == null
    ) {
      return onError({
        title: "Error Creating Poll",
        message: "Voter group not loaded yet."
      });
    }

    pcdState.current = PCDState.AWAITING_PCDSTR;

    const ballotSignal: BallotSignal = {
      pollSignals: [],
      ballotTitle: ballotTitle,
      ballotDescription: ballotDescription,
      ballotType: ballotConfig.ballotType,
      expiry: expiry,
      voterSemaphoreGroupUrls: [voterGroupUrl],
      voterSemaphoreGroupRoots: [voterGroupRootHash],
      pipelineId: loginState.config.pipelineId,
      isPublic
    };

    polls.forEach((poll: Poll) => {
      const pollSignal: PollSignal = {
        body: poll.body,
        options: poll.options
      };
      ballotSignal.pollSignals.push(pollSignal);
    });
    const signalHash = sha256(stableStringify(ballotSignal));
    const sigHashEnc = generateSnarkMessageHash(signalHash).toString();
    console.log(`[CREATED BALLOT]`, {
      ballotSignal,
      signalHash,
      sigHashEnc,
      ballotConfig
    });
    localStorage.setItem("lastBallotSignal", stableStringify(ballotSignal));
    localStorage.setItem("lastBallotSignalHash", signalHash);
    localStorage.setItem("lastBallotSignalHashEnc", sigHashEnc);
    localStorage.setItem("lastBallotConfig", stableStringify(ballotConfig));
    localStorage.setItem("lastBallotPolls", stableStringify(polls));
    localStorage.setItem(
      "pending-ballot",
      stableStringify({
        ballotConfig,
        ballotSignal,
        polls
      })
    );

    const ballotUrl = `/`;

    openGroupMembershipPopup(
      ballotConfig.passportAppUrl,
      window.location.origin + "/popup",
      ballotConfig.creatorGroupUrl,
      "zupoll",
      sigHashEnc,
      sigHashEnc,
      USE_CREATE_BALLOT_REDIRECT ? url + ballotUrl : undefined
    );
  }, [
    ballotConfig,
    voterGroupUrl,
    voterGroupRootHash,
    ballotTitle,
    ballotDescription,
    expiry,
    loginState.config.pipelineId,
    isPublic,
    polls,
    url,
    onError
  ]);

  return { loadingVoterGroupUrl, createBallotPCD };
}

export interface BallotFromUrl {
  ballotConfig: BallotConfig;
  ballotSignal: BallotSignal;
  polls: Poll[];
}

interface GenerateBallotArgs {
  ballotTitle: string;
  ballotDescription: string;
  expiry: Date;
  ballotConfig?: BallotConfig;
  voterGroupUrls: string[];
  voterGroupRoots: string[];
  proof: string;
  ballotType: BallotType;
  polls: Poll[];
  creatorGroupUrl: string;
  pipelineId?: string;
  isPublic: boolean;
}

const generateBallotRequest = (
  args: GenerateBallotArgs
): CreateBallotRequest => {
  const finalRequest: CreateBallotRequest = {
    ballot: {
      ballotId: "",
      ballotURL: 0,
      ballotTitle: args.ballotTitle,
      ballotDescription: args.ballotDescription,
      createdAt: new Date(),
      expiry: args.expiry,
      proof: args.proof,
      pollsterType: UserType.ANON,
      pollsterNullifier: "",
      pollsterName: null,
      pollsterUuid: null,
      pollsterCommitment: null,
      expiryNotif: null,
      pollsterSemaphoreGroupUrl: args.creatorGroupUrl,
      voterSemaphoreGroupUrls: args.voterGroupUrls,
      voterSemaphoreGroupRoots: args.voterGroupRoots,
      ballotType: args.ballotType,
      pipelineId: args.pipelineId,
      isPublic: args.isPublic
    },
    polls: args.polls,
    proof: args.proof
  };
  return finalRequest;
};
