import { EmailPCDTypeName } from "@pcd/email-pcd";
import { deserializeStorage } from "@pcd/passport-interface";
import { Spacer, styled } from "@pcd/passport-ui";
import { PCDCollection } from "@pcd/pcd-collection";
import { PCD } from "@pcd/pcd-types";
import { SemaphoreGroupPCDTypeName } from "@pcd/semaphore-group-pcd";
import { SemaphoreIdentityPCDTypeName } from "@pcd/semaphore-identity-pcd";
import { useCallback, useEffect, useState } from "react";
import { useFilePicker } from "use-file-picker";
import { useDispatch, usePCDCollection } from "../../src/appHooks";
import { getPackages } from "../../src/pcdPackages";
import { AppState } from "../../src/state";
import { useSelector } from "../../src/subscribe";
import { Button, H2 } from "../core";
import { MaybeModal } from "../modals/Modal";
import { AppContainer } from "../shared/AppContainer";
import { ScreenNavigation } from "../shared/ScreenNavigation";

export function useImportScreenData() {
  return useSelector<AppState["importScreen"]>((s) => s.importScreen, []);
}

const NoFolderSymbol = Symbol("None");

// There are four main UI states that can occur after a user selects a file
// to import.
type ImportState =
  // Initial state
  | { state: "initial" }
  // The selected file is valid, and the user can decide whether to import it.
  | {
      state: "valid-file-selected";
      // The collection parsed from the selected file
      collection: PCDCollection;
      // The PCD IDs referring to PCDs which are valid to import
      mergeablePcdIds: Set<PCD["id"]>;
      // The folders the user has selected in the UI
      selectedFolders: Set<string | symbol>;
      // The PCD IDs that are valid and within the selected folders
      selectedPcdIds: Set<PCD["id"]>;
      // The count of valid PCDs in each importable folder
      folderCounts: Record<string | symbol, number>;
    }
  // The import has been carried out, and `added` is the number of PCDs
  // imported.
  | { state: "import-complete" }
  // The selected file is not valid.
  | { state: "invalid-file" };

export function ImportBackupScreen() {
  const [importState, setImportState] = useState<ImportState>({
    state: "initial"
  });

  // Global application state, used to report the success or failure of the
  // import.
  const importScreenState = useImportScreenData();

  const { openFilePicker, filesContent } = useFilePicker({
    accept: ".json",
    multiple: false,
    onFilesSelected: () => {
      setImportState({ state: "initial" });
    }
  });

  const existingPcdCollection = usePCDCollection();
  const dispatch = useDispatch();

  // Called when a valid file has been selected, and the user chooses to import
  // PCDs from it.
  const importPCDs = useCallback(() => {
    // Should never happen, but makes TypeScript happy that we checked for it
    if (importState.state !== "valid-file-selected") return;

    dispatch({
      type: "merge-import",
      collection: importState.collection,
      pcdsToMergeIds: importState.selectedPcdIds
    });

    setImportState({ state: "import-complete" });
  }, [dispatch, importState]);

  // Responds to the user having selected a file to import, or to changes in
  // the user's current PCD collection.
  useEffect(() => {
    (async () => {
      // If a file has been selected, and isn't invalid or already imported
      if (
        filesContent.length > 0 &&
        importState.state !== "import-complete" &&
        importState.state !== "invalid-file"
      ) {
        let parsedCollection: PCDCollection;

        // If the file hasn't been processed yet, process it
        if (importState.state === "initial") {
          try {
            // Parse the file content as JSON
            const storageExport = JSON.parse(filesContent[0].content);
            // Deserialize the storage - throws an error if the content is not
            // recognized
            parsedCollection = (
              await deserializeStorage(storageExport, await getPackages())
            ).pcds;
          } catch (e) {
            // The file is not valid, so bail out
            setImportState({ state: "invalid-file" });
            return;
          }
        } else {
          parsedCollection = importState.collection;
        }

        // Because this hook can be called multiple times, we should only
        // update the state if something has really changed
        if (
          // If the previous state was "initial", there's definitely a change
          importState.state === "initial" ||
          // If we have a new imported collection object, that's a change
          importState.collection !== parsedCollection ||
          // If the set of PCDs to merge is different, that's a change
          (await importState.collection.getHash()) !==
            (await parsedCollection.getHash())
        ) {
          const userHasSemaphoreIdentity =
            existingPcdCollection.getPCDsByType(SemaphoreGroupPCDTypeName)
              .length > 0;

          const userHasEmailPCD =
            existingPcdCollection.getPCDsByType(EmailPCDTypeName).length > 0;

          // Before importing, we want to filter the PCDs down to those which
          // are valid to import, so we can tell the user how many new PCDs to
          // expect
          const preImportFilter = (pcd: PCD) => {
            // If the user has a semaphore identity PCD, don't import another
            if (
              userHasSemaphoreIdentity &&
              pcd.type === SemaphoreIdentityPCDTypeName
            ) {
              return false;
            }

            // If the user has an email PCD, don't import another
            if (userHasEmailPCD && pcd.type === EmailPCDTypeName) {
              return false;
            }

            // If a PCD with this ID exists already, don't import it
            if (existingPcdCollection.hasPCDWithId(pcd.id)) {
              return false;
            }

            // Otherwise, do import it
            return true;
          };

          // These are the PCDs that could be merged, e.g. not duplicates of
          // existing PCDs, or secondary semaphore identities or emails.
          const mergeablePcds: PCD[] = parsedCollection
            .getAll()
            .filter(preImportFilter);

          // Create a map of the folders these PCDs belong to, to a count of
          // the number of PCDs in each folder, with `NoFolderSymbol` used for
          // PCDs belonging to no folder.
          const pcdFolders: Record<string | symbol, number> =
            mergeablePcds.reduce((folders, pcd) => {
              const folder =
                parsedCollection.getFolderOfPCD(pcd.id) ?? NoFolderSymbol;
              if (folder in folders) {
                folders[folder]++;
              } else {
                folders[folder] = 1;
              }
              return folders;
            }, {});

          // The set of folders that the user has chosen to import.
          let selectedFolders: Set<string | symbol>;

          if (importState.state === "initial") {
            // By default all folders are selected.
            selectedFolders = new Set([
              NoFolderSymbol,
              ...Object.keys(pcdFolders)
            ]);
          } else {
            // Otherwise, make sure previously selected folders are still
            // valid given current parsed file contents.
            selectedFolders = importState.selectedFolders;
            for (const folder of selectedFolders) {
              // Do we have a selected folder that doesn't exist any more
              // for some reason?
              if (!(folder in pcdFolders)) {
                selectedFolders.delete(folder);
              }
            }
          }

          setImportState({
            state: "valid-file-selected",
            collection: parsedCollection,
            mergeablePcdIds: new Set(mergeablePcds.map((pcd) => pcd.id)),
            selectedFolders,
            // Check which of the mergeable PCDs are in selected folders, and
            // create a set of their IDs
            selectedPcdIds: new Set(
              mergeablePcds
                .filter((pcd) => {
                  const folder =
                    parsedCollection.getFolderOfPCD(pcd.id) ?? NoFolderSymbol;
                  return selectedFolders.has(folder);
                })
                .map((pcd) => pcd.id)
            ),
            folderCounts: pcdFolders
          });
        }
      }
    })();
  }, [filesContent, importState, existingPcdCollection]);

  // When the user selects or de-selects a folder for inclusion in the merge
  const toggleFolder = useCallback(
    (folder: string | symbol) => {
      if (importState.state === "valid-file-selected") {
        const { selectedFolders } = importState;
        if (selectedFolders.has(folder) && selectedFolders.size > 1) {
          selectedFolders.delete(folder);
        } else {
          selectedFolders.add(folder);
        }
        setImportState({ ...importState, selectedFolders });
      }
    },
    [importState]
  );

  return (
    <>
      <MaybeModal />
      <AppContainer bg="gray">
        <ScreenNavigation label={"Home"} to="/"></ScreenNavigation>
        <Container>
          <Spacer h={8} />
          <H2>Import Backup Data</H2>
          <Spacer h={24} />
          {importState.state === "initial" && (
            <>
              <p>
                If you have previously exported a backup of your account, you
                can restore any lost PCDs by importing the backup data.
              </p>
              <p>
                Importing data will not overwrite any of your existing PCDs.
              </p>
              <p>
                To begin, select a backup file by clicking the button below.
              </p>
              <Spacer h={8} />
              <Button onClick={() => openFilePicker()}>Select file</Button>
              <Spacer h={8} />
            </>
          )}
          {importState.state === "valid-file-selected" && (
            <>
              {importState.mergeablePcdIds.size == 0 && (
                <>
                  <p>
                    The selected file does not contain any new PCDs. You may try
                    to restore from another backup.
                  </p>
                  <Spacer h={8} />
                  <Button onClick={() => openFilePicker()}>Select file</Button>
                  <Spacer h={8} />
                </>
              )}
              {importState.mergeablePcdIds.size > 0 && (
                <>
                  <p>
                    The selected file contains{" "}
                    <strong>{importState.mergeablePcdIds.size}</strong> new
                    PCDs.
                  </p>
                  <div>
                    Import PCDs from the following backed-up folders:
                    <Folders>
                      {[
                        [NoFolderSymbol, 1] as [symbol, number],
                        ...Object.entries(importState.folderCounts)
                      ].map(([folder, count]) => {
                        return (
                          <Folder key={folder.toString()}>
                            <input
                              type="checkbox"
                              checked={importState.selectedFolders.has(folder)}
                              onChange={() => toggleFolder(folder)}
                            ></input>
                            <span>
                              {folder === NoFolderSymbol
                                ? "None"
                                : (folder as string)}{" "}
                              ({count})
                            </span>
                          </Folder>
                        );
                      })}
                    </Folders>
                  </div>

                  <Spacer h={8} />
                  <Button onClick={importPCDs}>
                    Import{" "}
                    {[
                      [NoFolderSymbol, 1] as [symbol, number],
                      ...Object.entries(importState.folderCounts)
                    ].reduce(
                      (total, [folder, count]) =>
                        total +
                        (importState.selectedFolders.has(folder) ? count : 0),
                      0
                    )}{" "}
                    PCDs
                  </Button>
                  <Spacer h={8} />
                </>
              )}
            </>
          )}
          {importState.state === "import-complete" &&
            importScreenState &&
            !importScreenState.error && (
              <>
                <p>
                  Successfully imported{" "}
                  <strong>{importScreenState.imported}</strong> PCDs from the
                  selected file.
                </p>
                <Spacer h={8} />
              </>
            )}
          {importState.state === "import-complete" &&
            importScreenState &&
            importScreenState.error && (
              <>
                <p>{importScreenState.error}</p>
                <Spacer h={8} />
              </>
            )}
          {importState.state === "invalid-file" && (
            <>
              <p>
                The selected file is not a valid Zupass account backup. Please
                select a valid Zupass backup to import your data from.
              </p>
              <Spacer h={8} />
              <Button onClick={() => openFilePicker()}>Select file</Button>
              <Spacer h={8} />
            </>
          )}
        </Container>
      </AppContainer>
    </>
  );
}

const Container = styled.div`
  padding: 24px;

  p {
    margin-bottom: 1rem;
  }
`;

const Folder = styled.label`
  display: flex;
  column-gap: 0.5rem;
`;

const Folders = styled.div`
  margin-top: 0.5rem;
  margin-bottom: 1rem;
`;
