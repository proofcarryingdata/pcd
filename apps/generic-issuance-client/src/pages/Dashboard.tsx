import {
  PipelineDefinition,
  requestGenericIssuanceGetAllUserPipelines,
  requestGenericIssuanceUpsertPipeline
} from "@pcd/passport-interface";
import { useStytch, useStytchUser } from "@stytch/react";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ZUPASS_SERVER_URL } from "../constants";

const SAMPLE_CREATE_PIPELINE_TEXT = JSON.stringify(
  {
    type: "Lemonade",
    editorUserIds: [],
    options: {
      lemonadeApiKey: "your-lemonade-api-key",
      events: []
    }
  },
  null,
  2
);

export default function Dashboard(): ReactNode {
  const stytchClient = useStytch();
  const { user } = useStytchUser();
  const [isLoggingOut, setLoggingOut] = useState(false);
  // TODO: After MVP, replace with RTK hooks or a more robust state management.
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [isCreatingPipeline, setCreatingPipeline] = useState(false);
  const [newPipelineRaw, setNewPipelineRaw] = useState(
    SAMPLE_CREATE_PIPELINE_TEXT
  );
  const [error, setError] = useState("");

  const fetchAllPipelines = useCallback(async () => {
    const res =
      await requestGenericIssuanceGetAllUserPipelines(ZUPASS_SERVER_URL);
    if (res.success) {
      setPipelines(res.value);
    } else {
      // TODO: Better errors
      alert(`An error occurred while fetching user pipelines: ${res.error}`);
    }
  }, []);

  useEffect(() => {
    fetchAllPipelines();
  }, [fetchAllPipelines]);

  const createPipeline = async (): Promise<void> => {
    if (!newPipelineRaw) return;
    const res = await requestGenericIssuanceUpsertPipeline(
      ZUPASS_SERVER_URL,
      JSON.parse(newPipelineRaw)
    );
    await fetchAllPipelines();
    if (res.success) {
      setCreatingPipeline(false);
    } else {
      // TODO: Better errors
      alert(`An error occurred while creating pipeline: ${res.error}`);
    }
  };

  if (!user) {
    window.location.href = "/";
  }

  if (error) {
    return <div>An error occured. {JSON.stringify(error)}</div>;
  }

  if (isLoggingOut) {
    return <div>Logging out...</div>;
  }

  return (
    <div>
      <p>
        Congrats - you are now logged in as <b>{user.emails?.[0]?.email}.</b>
      </p>
      <button
        onClick={async (): Promise<void> => {
          if (confirm("Are you sure you want to log out?")) {
            setLoggingOut(true);
            try {
              await stytchClient.session.revoke();
            } catch (e) {
              setError(e);
              setLoggingOut(false);
            }
          }
        }}
      >
        Log out
      </button>

      <h2>My Pipelines</h2>
      {!pipelines.length && <p>No pipelines right now - go create some!</p>}
      {!!pipelines.length && (
        <ol>
          {pipelines.map((p) => (
            <Link to={`/pipelines/${p.id}`}>
              <li key={p.id}>
                id: {p.id}, type: {p.type}
              </li>
            </Link>
          ))}
        </ol>
      )}
      <p>
        <button onClick={(): void => setCreatingPipeline((curr) => !curr)}>
          {isCreatingPipeline ? "Minimize 🔼" : "Create new pipeline 🔽"}
        </button>
        {isCreatingPipeline && (
          <div>
            <textarea
              rows={10}
              cols={50}
              value={newPipelineRaw}
              onChange={(e): void => setNewPipelineRaw(e.target.value)}
            />
            <div>
              <button onClick={createPipeline}>Create new pipeline</button>
            </div>
          </div>
        )}
      </p>
    </div>
  );
}
