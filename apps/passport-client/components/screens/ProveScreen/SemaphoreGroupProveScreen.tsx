import { PCDGetRequest, ProveRequest } from "@pcd/passport-interface";
import { ArgumentTypeName } from "@pcd/pcd-types";
import {
  SemaphoreGroupPCDArgs,
  SemaphoreGroupPCDPackage,
  SerializedSemaphoreGroup,
  serializeSemaphoreGroup,
} from "@pcd/semaphore-group-pcd";
import { SemaphoreIdentityPCDPackage } from "@pcd/semaphore-identity-pcd";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import * as React from "react";
import { ReactNode, useCallback, useContext, useEffect, useState } from "react";
import styled from "styled-components";
import { requestStamp } from "../../../src/api/requestStamp";
import { DispatchContext } from "../../../src/dispatch";
import { Button } from "../../core";

export function SemaphoreGroupProveScreen({
  req,
}: {
  req: PCDGetRequest<typeof SemaphoreGroupPCDPackage>;
}) {
  // Load semaphore group
  const [group, setGroup] = useState<SerializedSemaphoreGroup>(null);
  useEffect(() => {
    const fetchGroup = async () => {
      const res = await fetch(req.args.group.remoteUrl);
      const group = (await res.json()) as SerializedSemaphoreGroup;
      console.log("Got semaphore group", group);
      setGroup(group);
    };
    fetchGroup().catch(console.error);
  }, [req.args.group.remoteUrl]);

  // Once that's done & user clicks Prove, create a zero-knowledge proof
  const [state] = useContext(DispatchContext);
  const [proving, setProving] = useState(false);

  const onProve = useCallback(async () => {
    const { prove, serialize } = SemaphoreGroupPCDPackage;

    setProving(true);
    const args = await makeArgs(state.identity!, group);
    const pcd = await prove(args);
    const serializedPCD = await serialize(pcd);
    console.log("Proof complete", serializedPCD);

    // Redirect back to requester
    window.location.href = `${req.returnUrl}?proof=${JSON.stringify(
      serializedPCD
    )}`;
  }, [group, setProving, req.returnUrl, state.identity, req.args]);

  const onProveServer = useCallback(async () => {
    setProving(true);
    const serverReq: ProveRequest = {
      pcdType: SemaphoreGroupPCDPackage.name,
      args: await makeArgs(state.identity!, group),
    };
    const url = `${config.passportServer}/pcds/prove`;
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify(serverReq),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    const proofResponse = JSON.parse(await response.text());
    const serializedPCD = proofResponse.serializedPCD;
    console.log("Proof complete", serializedPCD);

    // Redirect back to requester
    window.location.href = `${req.returnUrl}?proof=${serializedPCD}`;
  }, [group, setProving, req.returnUrl, state.identity]);

  const onProveServer = useCallback(async () => {
    setProving(true);
    const serverReq: ProveRequest = {
      pcdType: SemaphoreGroupPCDPackage.name,
      args: await makeArgs(state.identity!, group),
    };
    const pendingStamp = await requestStamp(serverReq);

    console.log("Pending stamp received", pendingStamp);

    // Redirect back to requester
    window.location.href = `${req.returnUrl}?stamp=${JSON.stringify(
      pendingStamp
    )}`;
  }, [group, setProving, req.returnUrl, state.identity]);

  const lines: ReactNode[] = [];
  lines.push(<p>Loading {req.args.group.remoteUrl}</p>);
  if (group != null) {
    lines.push(<p>Loaded {group.name}</p>);
    lines.push(
      <p>You're proving that you're one of {group.members.length} members</p>
    );
    lines.push(<Button onClick={onProve}>Prove</Button>);
    lines.push(<Button onClick={onProveServer}>Prove on Server</Button>);
  }
  if (proving) {
    lines.push(<p>Proving...</p>);
  }

  return (
    <div>
      {lines.map((line, i) => (
        <LineWrap key={i}>{line}</LineWrap>
      ))}
    </div>
  );
}

async function makeArgs(
  identity: Identity,
  semaphoreGroup: SerializedSemaphoreGroup,
  reqArgs: SemaphoreGroupPCDArgs
): Promise<SemaphoreGroupPCDArgs> {
  const group = new Group(BigInt(semaphoreGroup.id), semaphoreGroup.depth);
  for (const member of semaphoreGroup.members) {
    group.addMember(BigInt(member));
  }

  let args: SemaphoreGroupPCDArgs = {
    externalNullifier: {
      argumentType: ArgumentTypeName.BigInt,
      value: 23 + "",
    },
    signal: {
      argumentType: ArgumentTypeName.BigInt,
      value: 34 + "",
    },
    group: {
      argumentType: ArgumentTypeName.Object,
      value: serializeSemaphoreGroup(group, "Zuzalu Attendees"),
    },
    identity: {
      argumentType: ArgumentTypeName.PCD,
      value: await SemaphoreIdentityPCDPackage.serialize(
        await SemaphoreIdentityPCDPackage.prove({ identity })
      ),
    },
  };

  // in the case the requesting application actually submitted some
  // nullifier, use that instead of the hard-coded one
  if (reqArgs.externalNullifier.value !== undefined) {
    args = {
      ...args,
      externalNullifier: reqArgs.externalNullifier,
    };
  }
  // same, but for signal
  if (reqArgs.signal.value !== undefined) {
    args = { ...args, signal: reqArgs.signal };
  }

  console.log("Proving semaphore membership", args);
  console.log("Group root", group.root.toString());
  console.log("Group first member", group.members[0]);
  console.log("Identity", identity.commitment.toString());

  const pcd = await prove(args);
  const serialized = await serialize(pcd);
  console.log("Proof complete", serialized);

  return serialized;
}

const LineWrap = styled.div`
  margin-bottom: 16px;
`;
