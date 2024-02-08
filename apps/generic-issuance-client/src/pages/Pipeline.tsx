import { useStytch } from "@stytch/react";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import styled from "styled-components";
import { PageContent } from "../components/Core";
import { Header } from "../components/Header";
import { pipelineIcon, pipelineStatus } from "../components/PipelineListEntry";
import { deletePipeline, savePipeline } from "../helpers/Mutations";
import { useFetchPipeline } from "../helpers/useFetchPipeline";
import { useFetchPipelineInfo } from "../helpers/useFetchPipelineInfo";
import { useFetchSelf } from "../helpers/useFetchSelf";
import { useJWT } from "../helpers/userHooks";
import { LatestAtomsSection } from "../sections/LatestAtomsSection";
import { LatestRunSection } from "../sections/LatestRunSection";

function stringifyAndFormat(obj: object): string {
  return JSON.stringify(obj, null, 2);
}

export default function Pipeline(): ReactNode {
  const stytchClient = useStytch();
  const userJWT = useJWT();
  const params = useParams();
  const pipelineId: string | undefined = params.id;
  const [textareaValue, setTextareaValue] = useState("");
  const userFromServer = useFetchSelf();
  const pipelineFromServer = useFetchPipeline(pipelineId);
  const pipelineInfoFromServer = useFetchPipelineInfo(pipelineId);
  const pipelineInfo = pipelineInfoFromServer?.value;
  const [actionInProgress, setActionInProgress] = useState(false);

  useEffect(() => {
    if (pipelineFromServer?.value) {
      setTextareaValue(stringifyAndFormat(pipelineFromServer.value));
    }
  }, [pipelineFromServer?.value]);

  const onSaveClick = useCallback(async () => {
    alert("save click");
    if (userJWT) {
      alert("userjwt");
      setActionInProgress(true);
      const res = await savePipeline(userJWT, textareaValue);
      if (res.success) {
        window.location.reload();
      } else {
        alert(res.error);
      }
      setActionInProgress(false);
    }
  }, [textareaValue, userJWT]);

  const onDeleteClick = useCallback(async () => {
    if (userJWT && pipelineFromServer?.value?.id) {
      if (!confirm("Are you sure you would like to delete this pipeline?")) {
        return;
      }
      setActionInProgress(true);
      const res = await deletePipeline(userJWT, pipelineFromServer.value.id);
      if (res.success) {
        window.location.href = "/#/dashboard";
      } else {
        alert(res.error);
      }
      setActionInProgress(false);
    }
  }, [pipelineFromServer?.value?.id, userJWT]);

  if (
    !userFromServer ||
    !pipelineFromServer ||
    !pipelineInfoFromServer ||
    !pipelineInfo ||
    actionInProgress
  ) {
    return (
      <>
        <Header includeLinkToDashboard />
        <PageContent>Loading...</PageContent>
      </>
    );
  }

  if (!userJWT) {
    console.log("not logged in - redirecting to the homepage");
    window.location.href = "/";
  }

  const hasEdits =
    stringifyAndFormat(pipelineFromServer.value ?? {}) !== textareaValue;
  const ownedBySomeoneElse =
    pipelineFromServer.value?.ownerUserId !== userFromServer?.value?.id;

  return (
    <>
      <Header
        includeLinkToDashboard
        user={userFromServer}
        stytchClient={stytchClient}
      />
      {ownedBySomeoneElse && (
        <WarningSection>
          <b>WARNING!</b> You are not the owner of this pipeline, but you can
          see it because you're an <b>admin</b>. Be <b>Careful</b>!
        </WarningSection>
      )}

      <PageContent>
        <TwoColumns>
          <div>
            <h2>Edit Pipeline</h2>
            {pipelineFromServer.value && (
              <>
                <p>
                  <textarea
                    cols={50}
                    rows={30}
                    value={textareaValue}
                    onChange={(e): void => setTextareaValue(e.target.value)}
                  />
                </p>
                <p>
                  {hasEdits && (
                    <button
                      disabled={actionInProgress || ownedBySomeoneElse}
                      onClick={onSaveClick}
                    >
                      {actionInProgress ? "Saving..." : "Save changes"}
                    </button>
                  )}
                  {!hasEdits && <button disabled>All changes saved ✅</button>}
                  <button disabled={ownedBySomeoneElse} onClick={onDeleteClick}>
                    Delete pipeline
                  </button>
                </p>
              </>
            )}
          </div>
          <div style={{ flexGrow: 1 }}>
            <h2>Pipeline Info</h2>
            <h3>Status</h3>
            {pipelineIcon(pipelineInfo.latestRun)}{" "}
            {pipelineStatus(pipelineInfo.latestRun)}
            {pipelineInfo && pipelineFromServer.value && (
              <>
                {pipelineInfo.feeds && (
                  <>
                    <h3>Feeds</h3>
                    <ol>
                      {pipelineInfo.feeds?.map((feed) => (
                        <li key={feed.url}>
                          <b>{feed.name}</b> - <a href={feed.url}>{feed.url}</a>{" "}
                        </li>
                      ))}
                    </ol>
                  </>
                )}
                {pipelineInfo.latestRun && (
                  <LatestRunSection latestRun={pipelineInfo.latestRun} />
                )}
                {pipelineInfo.latestAtoms && (
                  <LatestAtomsSection latestAtoms={pipelineInfo.latestAtoms} />
                )}
              </>
            )}
          </div>
        </TwoColumns>
      </PageContent>
    </>
  );
}

const WarningSection = styled.div`
  padding: 16px;
  background-color: rgba(238, 255, 0, 0.1);
`;

const TwoColumns = styled.div`
  display: flex;
  justify-content: stretch;
  align-items: stretch;
  flex-direction: row;
  gap: 32px;

  ol {
    // to override 'GlobalStyle'
    max-width: unset !important;
  }
`;
