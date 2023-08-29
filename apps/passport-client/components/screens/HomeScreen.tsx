import {
  getNameFromPath,
  getParentFolder,
  isRootFolder
} from "@pcd/pcd-collection";
import { PCD } from "@pcd/pcd-types";
import { SemaphoreIdentityPCDTypeName } from "@pcd/semaphore-identity-pcd";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { useFolders, usePCDsInFolder, useSelf } from "../../src/appHooks";
import { useSyncE2EEStorage } from "../../src/useSyncE2EEStorage";
import { Placeholder, Spacer } from "../core";
import { icons } from "../icons";
import { MaybeModal } from "../modals/Modal";
import { AppContainer } from "../shared/AppContainer";
import { AppHeader } from "../shared/AppHeader";
import { LoadingIssuedPCDs } from "../shared/LoadingIssuedPCDs";
import { PCDCard } from "../shared/PCDCard";

export const HomeScreen = React.memo(HomeScreenImpl);

/**
 * Show the user their passport, an overview of cards / PCDs.
 */
export function HomeScreenImpl() {
  useSyncE2EEStorage();

  const [browsingPath, setBrowsingPath] = useState("/");

  const pcds = usePCDsInFolder(browsingPath);
  const folders = useFolders(browsingPath);

  const self = useSelf();
  const navigate = useNavigate();

  useEffect(() => {
    if (self == null) {
      console.log("Redirecting to login screen");
      navigate("/login");
    } else if (sessionStorage.pendingProofRequest != null) {
      console.log("Redirecting to prove screen");
      const encReq = encodeURIComponent(sessionStorage.pendingProofRequest);
      navigate("/prove?request=" + encReq);
      delete sessionStorage.pendingProofRequest;
    } else if (sessionStorage.pendingAddRequest != null) {
      console.log("Redirecting to add screen");
      const encReq = encodeURIComponent(sessionStorage.pendingAddRequest);
      navigate("/add?request=" + encReq);
      delete sessionStorage.pendingAddRequest;
    } else if (sessionStorage.pendingHaloRequest != null) {
      console.log("Redirecting to halo screen");
      navigate(`/halo${sessionStorage.pendingHaloRequest}`);
      delete sessionStorage.pendingHaloRequest;
    }
  });

  useEffect(() => {
    if (sessionStorage.newAddedPCDID != null) {
      // scroll to element with id of newAddedPCDID
      const el = document.getElementById(sessionStorage.newAddedPCDID);
      if (el) {
        el.scrollIntoView();
      }
      delete sessionStorage.newAddedPCDID;
    }
  });

  const mainPCDId = useMemo(() => {
    if (pcds[0]?.type === SemaphoreIdentityPCDTypeName) {
      return pcds[0]?.id;
    }
  }, [pcds]);
  const [selectedPCDID, setSelectedPCDID] = useState("");
  const selectedPCD = useMemo(() => {
    let selected;

    // if user just added a PCD, highlight that one
    if (sessionStorage.newAddedPCDID != null) {
      selected = pcds.find((pcd) => pcd.id === sessionStorage.newAddedPCDID);
    } else {
      selected = pcds.find((pcd) => pcd.id === selectedPCDID);
    }

    // default to first PCD if no selected PCD found
    if (selected === undefined) {
      selected = pcds[0];
    }

    return selected;
  }, [pcds, selectedPCDID]);

  const onPcdClick = useCallback((id: string) => {
    setSelectedPCDID(id);
  }, []);

  const onFolderClick = useCallback((folder: string) => {
    setBrowsingPath(folder);
  }, []);

  const isRoot = isRootFolder(browsingPath);

  if (self == null) return null;

  return (
    <>
      <MaybeModal />
      <AppContainer bg="gray">
        <Spacer h={24} />
        <AppHeader />
        <Spacer h={24} />
        <Placeholder minH={540}>
          {!isRoot && (
            <FolderDetails
              folder={browsingPath}
              onFolderClick={onFolderClick}
            />
          )}
          {folders.map((folder) => {
            return (
              <FolderCard
                key={folder}
                onFolderClick={onFolderClick}
                folder={folder}
              />
            );
          })}
          {pcds.length > 0 && folders.length > 0 && <Separator />}
          {pcds.map((pcd) => (
            <WrappedPCDCard
              key={pcd.id}
              pcd={pcd}
              mainIdPCD={mainPCDId}
              onPcdClick={onPcdClick}
              expanded={pcd.id === selectedPCD?.id}
            />
          ))}
          <LoadingIssuedPCDs />
        </Placeholder>
        <Spacer h={24} />
      </AppContainer>
    </>
  );
}

function FolderDetails({
  folder,
  onFolderClick
}: {
  folder: string;
  onFolderClick: (folder: string) => void;
}) {
  const onUpOneClick = useCallback(() => {
    onFolderClick(getParentFolder(folder));
  }, [folder, onFolderClick]);

  return (
    <DirectoryTopRow>
      <span className="btn" onClick={onUpOneClick}>
        <img src={icons.upArrow} width={18} height={18} />
      </span>
      <span className="name">{folder}</span>
    </DirectoryTopRow>
  );
}

function FolderCard({
  folder,
  onFolderClick
}: {
  folder: string;
  onFolderClick: (folder: string) => void;
}) {
  const onClick = useCallback(() => {
    onFolderClick(folder);
  }, [folder, onFolderClick]);

  return (
    <FolderCardContainer onClick={onClick}>
      <img src={icons.folder} width={20} height={20} />
      {getNameFromPath(folder)}
    </FolderCardContainer>
  );
}

const Separator = styled.div`
  width: 100%;
  height: 1px;
  margin-top: 32px;
  margin-bottom: 32px;
  background-color: grey;
`;

const DirectoryTopRow = styled.div`
  margin: 12px 8px;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: stretch;
  flex-direction: row;

  .name {
    flex-grow: 1;
    background-color: black;
    padding: 12px 16px;
    border-radius: 0px 12px 12px 0px;
    border-left: none;
    background: #1d2022;
    border: 1px solid var(--accent-dark);
    box-sizing: border-box;
  }

  .btn {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 4px 20px;
    cursor: pointer;
    border-radius: 12px 0px 0px 12px;
    border: 1px solid var(--accent-dark);
    border-right: none;
    background: #1d2022;

    &:hover {
      background: var(--bg-dark-grey);
    }
  }
`;

const FolderCardContainer = styled.div`
  /* width: 100%; */
  border-radius: 12px;
  border: 1px solid var(--accent-dark);
  background: var(--primary-dark);
  overflow: hidden;
  margin: 12px 8px;
  padding: 12px 16px;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  flex-direction: row;
  gap: 12px;

  &:hover {
    background: var(--primary-lite);
  }
`;

const WrappedPCDCard = React.memo(WrappedPCDCardImpl);

function WrappedPCDCardImpl({
  pcd,
  expanded,
  mainIdPCD,
  onPcdClick
}: {
  pcd: PCD;
  expanded: boolean;
  mainIdPCD: string;
  onPcdClick?: (id: string) => void;
}) {
  return (
    <PCDContainer key={"container-" + pcd.id}>
      <PCDCard
        key={"card-" + pcd.id}
        pcd={pcd}
        expanded={expanded}
        isMainIdentity={pcd.id === mainIdPCD}
        onClick={onPcdClick}
      />
    </PCDContainer>
  );
}

const PCDContainer = styled.div`
  margin-top: 8px;
`;
