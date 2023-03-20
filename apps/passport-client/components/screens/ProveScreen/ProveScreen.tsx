import { PCDGetRequest, PCDRequestType } from "@pcd/passport-interface";
import { SemaphoreGroupPCDPackage } from "@pcd/semaphore-group-pcd";
import { SemaphoreSignaturePCDPackage } from "@pcd/semaphore-signature-pcd";
import * as React from "react";
import { useContext } from "react";
import { useLocation } from "react-router-dom";
import { DispatchContext } from "../../../src/dispatch";
import { err } from "../../../src/util";
import { H1, Spacer } from "../../core";
import { AppHeader } from "../../shared/AppHeader";
import { ParameterizedProveScreen } from "./ParameterizedProveScreen";
import { SemaphoreGroupProveScreen } from "./SemaphoreGroupProveScreen";
import { SemaphoreSignatureProveScreen } from "./SemaphoreSignatureProveScreen";

export function ProveScreen() {
  const location = useLocation();
  const [_, dispatch] = useContext(DispatchContext);
  const params = new URLSearchParams(location.search);
  const request = JSON.parse(params.get("request")) as PCDGetRequest;

  if (request.type !== PCDRequestType.Get) {
    err(dispatch, "Unsupported request", `Expected a PCD GET request`);
    return null;
  }

  let title: string;
  let body: JSX.Element;
  if (request.pcdType === SemaphoreGroupPCDPackage.name) {
    title = "Prove membership";
    body = <SemaphoreGroupProveScreen req={request} />;
  } else if (request.pcdType === SemaphoreSignaturePCDPackage.name) {
    title = "Sign a message";
    body = <SemaphoreSignatureProveScreen req={request} />;
  } else {
    return <ParameterizedProveScreen />;
  }

  return (
    <div>
      <Spacer h={24} />
      <AppHeader />
      <Spacer h={24} />
      <H1>🔑 &nbsp; {title}</H1>
      <Spacer h={24} />
      {body}
    </div>
  );
}
