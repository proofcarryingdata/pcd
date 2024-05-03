import ImportDialog, { ImportedQuestions } from "@/components/ui/ImportDialog";
import { LoadingPlaceholderCard } from "@/components/ui/LoadingPlaceholder";
import { Switch } from "@/components/ui/switch";
import { BallotConfig } from "@pcd/zupoll-shared";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaRegTrashAlt } from "react-icons/fa";
import { IoMdAdd } from "react-icons/io";
import styled from "styled-components";
import { Button } from "../../@/components/ui/button";
import { Card, CardContent, CardHeader } from "../../@/components/ui/card";
import { Input } from "../../@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../../@/components/ui/select";
import { Subtitle, Title } from "../../@/components/ui/text";
import { Poll } from "../../api/prismaTypes";
import { APP_CONFIG } from "../../env";
import { LoginState, ZupollError } from "../../types";
import { USE_CREATE_BALLOT_REDIRECT } from "../../util";
import { DividerWithText } from "./DividerWithText";
import { NewQuestionPlaceholder } from "./NewQuestionPlaceholder";
import { BALLOT_CONFIGS } from "./ballotConfig";
import { BallotFromUrl, useCreateBallot } from "./useCreateBallot";

export function CreateBallot({
  onError,
  loginState
}: {
  onError: (err: ZupollError) => void;
  loginState: LoginState;
}) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [ballotTitle, setBallotTitle] = useState("");
  const [ballotDescription, setBallotDescription] = useState("");
  const [ballotExpiry, setBallotExpiry] = useState<Date>(
    new Date(new Date().getTime() + 1000 * 60 * 60 * 24)
  );
  const [ballotFromUrl, setBallotFromUrl] = useState<BallotFromUrl>();
  const [pcdFromUrl, setPcdFromUrl] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const [useLastBallot, setUseLastBallot] = useState(false);
  const getDateString = (date: Date) => {
    const newDate = new Date(date);
    newDate.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return newDate.toISOString().slice(0, 16);
  };
  const updatePollBody = (pollBody: string, index: number) => {
    const newPolls = [...polls];
    newPolls[index].body = pollBody;
    setPolls(newPolls);
  };
  const updatePollOptions = (
    newOption: string,
    pollIndex: number,
    optionIndex: number
  ) => {
    const newPolls = [...polls];
    newPolls[pollIndex].options[optionIndex] = newOption;
    setPolls(newPolls);
  };

  const [serverLoading, setServerLoading] = useState(false);
  const query = useSearchParams();
  useEffect(() => {
    // Use URLSearchParams to get the proof query parameter
    const proofString = query?.get("proof") as string;
    const ballotString = localStorage.getItem("pending-ballot");
    if (proofString && ballotString) {
      // Decode the URL-encoded string
      const decodedProofString = decodeURIComponent(proofString);
      // Parse the decoded string into an object
      const proofObject = JSON.parse(decodedProofString);
      const pcdStr = JSON.stringify(proofObject);

      const ballot = JSON.parse(ballotString) as BallotFromUrl;
      console.log(`[RECEIVED BALLOT]`, ballot);
      setPcdFromUrl(pcdStr);
      setBallotFromUrl(ballot);
    }
  }, [query]);

  const possibleBallotConfigs = useMemo(
    () =>
      [
        ...(loginState.config.ballotConfigs ?? []),
        ...loginState.config.canCreateBallotTypes.map((t) => BALLOT_CONFIGS[t])
      ]
        .filter((c) => c != null)
        .filter((c) => c.canCreate !== false),
    [loginState.config.ballotConfigs, loginState.config.canCreateBallotTypes]
  );

  const [selectedBallotConfig, setSelectedBallotConfig] = useState<
    BallotConfig | undefined
  >(possibleBallotConfigs.find((c) => c.isDefault) ?? possibleBallotConfigs[0]);

  const [isPublic, setIsPublic] = useState(false);
  const { loadingVoterGroupUrl, createBallotPCD } = useCreateBallot({
    ballotTitle,
    ballotDescription,
    ballotConfig: selectedBallotConfig,
    expiry: ballotExpiry,
    polls,
    isPublic,
    onError,
    setServerLoading,
    loginState,
    ballotFromUrl,
    pcdFromUrl,
    setBallotFromUrl,
    setPcdFromUrl,
    url: window.location.href // If exists, will use redirect instead of pop up
  });

  const stableCreateRef = useRef(createBallotPCD);
  useEffect(() => {
    stableCreateRef.current = createBallotPCD;
  }, [createBallotPCD]);

  const setExpiry = useCallback((ms: number) => {
    setBallotExpiry(new Date(getDateString(new Date(Date.now() + ms))));
  }, []);

  if (serverLoading) {
    return (
      <LoadingPlaceholderCard>
        <div className="text-center m-4">Creating Poll</div>
      </LoadingPlaceholderCard>
    );
  }

  return (
    <div>
      {USE_CREATE_BALLOT_REDIRECT ? (
        ""
      ) : (
        <p style={{ color: "white" }}>
          Can only create polls in the browser, not Telegram
        </p>
      )}

      <ImportDialog
        show={importDialogOpen}
        close={function (): void {
          setImportDialogOpen(false);
        }}
        onImported={(imported: ImportedQuestions) => {
          setImportDialogOpen(false);
          setBallotTitle("Hackathon Voting");
          setBallotDescription("Vote on your favorite hackathon project!");
          setBallotExpiry(new Date(Date.now() + 60 * 1000 * 60 * 24));
          setPolls([
            {
              ballotURL: 0,
              body: "Choose your favorite project below.",
              createdAt: new Date(),
              expiry: new Date(Date.now() + 60 * 1000 * 60 * 24),
              id: "0",
              options: imported.questions.map((q) => q)
            }
          ]);
        }}
      />

      <Card>
        <CardHeader>
          <Title className="mb-0">Create a Poll</Title>
        </CardHeader>
        <CardContent style={{ marginTop: "-20px" }}>
          <div style={APP_CONFIG.debugToolsEnabled ? {} : { display: "none" }}>
            <Subtitle>Debug Tools</Subtitle>
            <div className="flex flex-row gap-2">
              <Button
                variant="outline"
                className=""
                onClick={() => {
                  const options = [];

                  options.push(
                    "EcoCommute: A smart carpooling app for reducing carbon footprint"
                  );
                  options.push(
                    "MindMate: An AI-powered mental health companion"
                  );
                  options.push(
                    "FoodShare: A platform for reducing food waste by connecting restaurants with charities"
                  );
                  options.push(
                    "VirtualVenue: An immersive virtual event platform for conferences and exhibitions"
                  );
                  options.push(
                    "SmartCity Navigator: A real-time city guide with personalized recommendations"
                  );
                  options.push(
                    "HealthHub: A centralized platform for managing personal health records"
                  );
                  options.push(
                    "AgroTech: An IoT-based solution for precision farming and crop management"
                  );
                  options.push(
                    "BlockVote: A secure, blockchain-based voting system for elections"
                  );
                  options.push(
                    "EduQuest: A gamified learning platform for interactive online education"
                  );
                  options.push(
                    "EmergencyAlert: A real-time disaster management and communication system"
                  );
                  options.push(
                    "FinancialFit: An AI-driven personal finance coach and budgeting tool"
                  );
                  options.push(
                    "SocialGood: A crowdfunding platform for supporting community projects"
                  );
                  options.push(
                    "TalentMatch: An AI-powered job matching platform for connecting employers and job seekers"
                  );
                  options.push(
                    "EnergyOptimizer: A smart energy management system for homes and businesses"
                  );
                  options.push(
                    "VirtualFit: An AR-based fitness app with personalized workout plans"
                  );
                  options.push(
                    "SafeCity: A crime reporting and prevention platform using crowd-sourced data"
                  );
                  options.push(
                    "WasteWise: An IoT-based waste management solution for smart cities"
                  );
                  options.push(
                    "LanguageBridge: A real-time language translation app for breaking communication barriers"
                  );
                  options.push(
                    "MemoryLane: An AI-powered storytelling app for preserving family histories"
                  );
                  options.push(
                    "AccessibleWorld: An assistive technology platform for people with disabilities"
                  );

                  setBallotTitle("Hackathon Voting");
                  setBallotDescription(
                    "Anonymously vote on your favorite project!"
                  );
                  setPolls([
                    {
                      id: polls.length.toString(),
                      body: "Choose your favorite project.",
                      options: options,
                      ballotURL: 0,
                      createdAt: new Date(),
                      expiry: new Date(Date.now() + 1000 * 60 * 60 * 24)
                    },
                    {
                      id: "1",
                      body: "smoll questions.",
                      options: ["option uno", "option dos"],
                      ballotURL: 0,
                      createdAt: new Date(),
                      expiry: new Date(Date.now() + 1000 * 60 * 60 * 24)
                    }
                  ]);
                  setTimeout(() => {
                    stableCreateRef.current();
                  }, 1);
                }}
              >
                Create Long Poll
              </Button>
              <Button
                style={APP_CONFIG.debugToolsEnabled ? {} : { display: "none" }}
                variant="outline"
                className=""
                onClick={() => {
                  const options = [];

                  options.push(
                    "EcoCommute: A smart carpooling app for reducing carbon footprint"
                  );
                  options.push(
                    "MindMate: An AI-powered mental health companion"
                  );
                  options.push(
                    "FoodShare: A platform for reducing food waste by connecting restaurants with charities"
                  );

                  setBallotTitle("Hackathon Voting");
                  setBallotDescription(
                    "Anonymously vote on your favorite project!"
                  );
                  setPolls([
                    {
                      id: polls.length.toString(),
                      body: "Choose your favorite project.",
                      options: options,
                      ballotURL: 0,
                      createdAt: new Date(),
                      expiry: new Date(Date.now() + 1000 * 60 * 60 * 24)
                    }
                  ]);
                  setTimeout(() => {
                    stableCreateRef.current();
                  }, 1);
                }}
              >
                Create Poll
              </Button>
            </div>
          </div>

          <Subtitle>Title</Subtitle>
          <Input
            type="text"
            id="body"
            autoComplete="off"
            value={ballotTitle}
            onChange={(e) => setBallotTitle(e.target.value)}
            placeholder="Advisory Vote 04/25"
          />
          <Subtitle>Description</Subtitle>
          <Input
            type="text"
            autoComplete="off"
            id="options"
            value={ballotDescription}
            onChange={(e) => setBallotDescription(e.target.value)}
            placeholder="Advisory vote for 04/25 town hall"
          />
          <Subtitle>Expiration</Subtitle>
          <Input
            type="datetime-local"
            autoComplete="off"
            id="expiry"
            value={getDateString(ballotExpiry)}
            onChange={(e) => {
              const newExpiry = e.target.value;
              const parsedDate = Date.parse(newExpiry);
              const dateIsValid = !isNaN(parsedDate);
              if (dateIsValid) {
                const minTimestamp = Date.now();
                const maxTimestamp = Date.now() + 1000 * 60 * 60 * 24 * 365 * 5;
                const selectedDate = new Date(e.target.value);
                const clampedTimestamp = Math.max(
                  minTimestamp,
                  Math.min(maxTimestamp, selectedDate.getTime())
                );
                const clampedDate = new Date(clampedTimestamp);
                setBallotExpiry(clampedDate);
              }
            }}
          />

          <DateQuickActions className="flex flex-row gap-2 m-2 w-full justify-evenly">
            <Button variant="ghost" onClick={() => setExpiry(1000 * 60 * 60)}>
              1hr
            </Button>
            <Button
              variant="ghost"
              onClick={() => setExpiry(1000 * 60 * 60 * 24)}
            >
              24hr
            </Button>
            <Button
              variant="ghost"
              onClick={() => setExpiry(1000 * 60 * 60 * 24 * 3)}
            >
              3d
            </Button>
            <Button
              variant="ghost"
              onClick={() => setExpiry(1000 * 60 * 60 * 24 * 7)}
            >
              1wk
            </Button>
            <Button
              variant="ghost"
              onClick={() => setExpiry(1000 * 60 * 60 * 24 * 30)}
            >
              1mo
            </Button>
            <Button
              variant="ghost"
              onClick={() => setExpiry(1000 * 60 * 60 * 24 * 90)}
            >
              3mo
            </Button>
            <Button
              variant="ghost"
              onClick={() => setExpiry(1000 * 60 * 60 * 24 * 365)}
            >
              1yr
            </Button>
          </DateQuickActions>

          <div
            style={{
              display: possibleBallotConfigs.length > 1 ? undefined : "none"
            }}
          >
            <Subtitle>Poll Type</Subtitle>
            <Select
              value={
                selectedBallotConfig ? selectedBallotConfig.name : undefined
              }
              onValueChange={(newName: string) =>
                setSelectedBallotConfig(
                  possibleBallotConfigs.find((c) => c.name === newName)
                )
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Poll Type" />
              </SelectTrigger>

              <SelectContent>
                <SelectGroup>
                  {possibleBallotConfigs.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Subtitle>Public Poll</Subtitle>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </CardContent>
      </Card>

      <DividerWithText>Questions</DividerWithText>

      <div className="flex flex-col gap-4 mb-2">
        {polls.map((poll, i) => {
          return (
            <Card key={i} className="pt-4 relative overflow-hidden">
              <Button
                onClick={() => {
                  const newPolls = [...polls];
                  newPolls.splice(i, 1);
                  setPolls(newPolls);
                }}
                variant={"ghost"}
                style={{
                  position: "absolute",
                  top: "4px",
                  right: "4px"
                }}
              >
                <FaRegTrashAlt />
              </Button>
              <CardContent>
                <Subtitle>Question</Subtitle>
                <Input
                  className=""
                  type="text"
                  id="body"
                  autoComplete="off"
                  value={poll.body}
                  onChange={(e) => updatePollBody(e.target.value, i)}
                  placeholder="Should we do this?"
                />
                <Subtitle>Choices</Subtitle>
                <div className="flex flex-col gap-2">
                  {poll.options.map((option, j) => (
                    <div key={j} className="flex row gap-2">
                      <Input
                        className="w-full"
                        type="text"
                        autoComplete="off"
                        id="options"
                        value={option}
                        onChange={(e) =>
                          updatePollOptions(e.target.value, i, j)
                        }
                        placeholder={`Option #${j + 1}`}
                      />
                      <Button
                        variant="ghost"
                        disabled={polls[i].options.length <= 2}
                        onClick={() => {
                          const newPolls = [...polls];
                          if (newPolls[i].options.length > 2) {
                            newPolls[i].options.splice(j, 1);
                            setPolls(newPolls);
                          }
                        }}
                      >
                        <FaRegTrashAlt />
                      </Button>
                    </div>
                  ))}

                  <div className="flex flex-row justify-center content-center gap-1 mt-1">
                    <Button
                      className="grow"
                      variant="ghost"
                      onClick={() => {
                        const newPolls = [...polls];
                        newPolls[i].options.push("");
                        setPolls(newPolls);
                      }}
                    >
                      <IoMdAdd size={16} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {polls.length === 0 ? (
        <NewQuestionPlaceholder
          onClick={() => {
            setPolls([
              ...polls,
              {
                id: polls.length.toString(),
                body: "",
                options: ["", ""],
                ballotURL: 0,
                createdAt: new Date(),
                expiry: new Date()
              }
            ]);
          }}
        />
      ) : (
        <div className="flex flex-row justify-center content-center gap-1 mb-1">
          <Button
            className="flex-grow"
            variant="ghost"
            onClick={() =>
              setPolls([
                ...polls,
                {
                  id: polls.length.toString(),
                  body: "",
                  options: ["", ""],
                  ballotURL: 0,
                  createdAt: new Date(),
                  expiry: new Date()
                }
              ])
            }
          >
            Add Question
          </Button>
        </div>
      )}
      {loadingVoterGroupUrl || serverLoading ? (
        <></>
      ) : (
        <>
          <Button
            className="w-full mb-1"
            variant="ghost"
            onClick={() => {
              setImportDialogOpen(true);
            }}
          >
            Import
          </Button>
          <Button
            className="w-full"
            variant="creative"
            disabled={
              ballotTitle === "" ||
              polls.length === 0 ||
              polls.some((poll) => poll.body === "" || poll.options.length < 2)
            }
            onClick={createBallotPCD}
          >
            Create
          </Button>
        </>
      )}
    </div>
  );
}

const DateQuickActions = styled.div`
  /**
   * mobile styling
   */
  @media screen and (max-width: 640px) {
    flex-wrap: wrap;

    button {
      flex-grow: 1;
    }
  }
`;
