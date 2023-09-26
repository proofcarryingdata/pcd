import { getHash, passportEncrypt } from "@pcd/passport-crypto";
import {
  isSyncedEncryptedStorageV2,
  requestDownloadAndDecryptStorage,
  requestUploadEncryptedStorage,
  SyncedEncryptedStorageV2
} from "@pcd/passport-interface";
import { PCDCollection } from "@pcd/pcd-collection";
import { useContext, useEffect, useState } from "react";
import { appConfig } from "./appConfig";
import { usePCDCollectionWithHash, useUploadedId } from "./appHooks";
import { StateContext } from "./dispatch";
import {
  loadEncryptionKey,
  loadPCDs,
  loadSelf,
  savePCDs
} from "./localstorage";
import { getPackages } from "./pcdPackages";
import { useOnStateChange } from "./subscribe";

/**
 * Uploads the state of this passport which is contained in localstorage
 * to the server, end to end encrypted.
 */
export async function uploadStorage(): Promise<void> {
  const user = loadSelf();
  const pcds = await loadPCDs();

  if (pcds.size() === 0) {
    console.error("[SYNC] skipping upload, no pcds in localStorage");
    return;
  }

  const encryptionKey = await loadEncryptionKey();
  const blobKey = await getHash(encryptionKey);

  const encryptedStorage = await passportEncrypt(
    JSON.stringify({
      pcds: await pcds.serializeCollection(),
      self: user,
      _storage_version: "v2"
    } satisfies SyncedEncryptedStorageV2),
    encryptionKey
  );

  const uploadResult = await requestUploadEncryptedStorage(
    appConfig.passportServer,
    blobKey,
    encryptedStorage
  );

  if (uploadResult.success) {
    console.log("[SYNC] uploaded e2ee storage");
  } else {
    console.error("[SYNC] failed to upload e2ee storage", uploadResult.error);
  }
}

/**
 * Given the encryption key in local storage, downloads the e2ee
 * encrypted storage from the server.
 */
export async function downloadStorage(): Promise<PCDCollection | null> {
  console.log("[SYNC] downloading e2ee storage");

  const encryptionKey = await loadEncryptionKey();
  const storageResult = await requestDownloadAndDecryptStorage(
    appConfig.passportServer,
    encryptionKey
  );

  if (!storageResult.success) {
    console.error("[SYNC] error downloading e2ee storage", storageResult.error);
    return null;
  }

  try {
    let pcds: PCDCollection;

    if (isSyncedEncryptedStorageV2(storageResult.value)) {
      pcds = await PCDCollection.deserialize(
        await getPackages(),
        storageResult.value.pcds
      );
    } else {
      pcds = new PCDCollection(await getPackages());
      await pcds.deserializeAllAndAdd(storageResult.value.pcds);
    }

    await savePCDs(pcds);
    return pcds;
  } catch (e) {
    console.error("[SYNC] uploaded storage is corrupted - ignoring it", e);
    return null;
  }
}

export function useSyncE2EEStorage() {
  const { dispatch } = useContext(StateContext);

  useOnStateChange(() => {
    dispatch({ type: "sync" });
  }, [dispatch]);
}

export function useHasUploaded() {
  const [hasUploaded, setHasUploaded] = useState<boolean | undefined>();
  const { hash } = usePCDCollectionWithHash();
  const uploadedId = useUploadedId();

  useEffect(() => {
    setHasUploaded(hash === uploadedId);
  }, [hash, uploadedId]);

  return hasUploaded;
}
