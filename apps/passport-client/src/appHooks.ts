import { wrap, Wrapper } from "@pcd/emitter";
import {
  CredentialCache,
  CredentialManager,
  FeedSubscriptionManager,
  LATEST_PRIVACY_NOTICE,
  User
} from "@pcd/passport-interface";
import { PCDCollection } from "@pcd/pcd-collection";
import { PCD } from "@pcd/pcd-types";
import { Identity } from "@semaphore-protocol/identity";
import { useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Dispatcher,
  StateContext,
  StateContextValue,
  ZuUpdate
} from "./dispatch";
import { AppError, AppState } from "./state";
import { useSelector } from "./subscribe";
import { hasSetupPassword } from "./user";
import { getLastValidVerifyUrl, maybeRedirect } from "./util";

export function usePCDCollection(): PCDCollection {
  const pcds = useSelector<PCDCollection>((s) => s.pcds, []);

  // Set to a new unique object each time PCDCollection changes, so that React
  // sees a piece of state change and knows to re-render.  This may re-render
  // unnecessarily if PCDCollection's change is a nop, but is much cheaper
  // than analyzing and hashing the full PCDCollection contents.
  const [_, setUnique] = useState<object>({});

  useEffect(() => {
    return pcds.changeEmitter.listen(() => {
      setUnique({});
    });
  }, [pcds]);

  return pcds;
}

export function usePCDs(): PCD[] {
  const pcds = usePCDCollection();
  return [...pcds.getAll()];
}

export function usePCDsInFolder(folder: string): PCD[] {
  const pcds = usePCDCollection();
  return [...pcds.getAllPCDsInFolder(folder)];
}

export function useFolders(path: string) {
  const pcds = usePCDCollection();
  return pcds.getFoldersInFolder(path);
}

export function useSelf(): User | undefined {
  return useSelector<User | undefined>((s) => s.self, []);
}

export function useIdentity(): Identity {
  return useSelector<Identity>((s) => s.identity, []);
}

export function useDispatch(): Dispatcher {
  const { dispatch } = useContext(StateContext);
  return dispatch;
}

export function useUpdate(): ZuUpdate {
  const { update } = useContext(StateContext);
  return update;
}

export function useIsOffline(): boolean {
  return useSelector<boolean>((s) => !!s.offline, []);
}

export function useStateContext(): StateContextValue {
  return useContext(StateContext);
}

export function useModal(): AppState["modal"] {
  return useSelector<AppState["modal"]>((s) => s.modal, []);
}

export function useEncryptionKey(): string | undefined {
  return useSelector<string | undefined>((s) => s.encryptionKey, []);
}

export function useUsingLaserScanner(): boolean {
  return useSelector<boolean>((s) => s.usingLaserScanner, []);
}

export function useSalt(): string | undefined {
  return useSelector<string | undefined>((s) => s.self?.salt, []);
}

export function useAppError(): AppError | undefined {
  return useSelector<AppError | undefined>((s) => s.error, []);
}

export function useLoadedIssuedPCDs(): boolean | undefined {
  return useSelector<boolean | undefined>((s) => s.loadedIssuedPCDs, []);
}

export function useIsDownloaded(): boolean | undefined {
  return useSelector<boolean | undefined>((s) => s.downloadedPCDs, []);
}

export function useServerStorageRevision(): string | undefined {
  return useSelector<string | undefined>((s) => s.serverStorageRevision, []);
}

export function useUserForcedToLogout(): boolean {
  const userForcedToLogout = useSelector<boolean>(
    (s) => !!s.userInvalid || !!s.anotherDeviceChangedPassword,
    []
  );

  return userForcedToLogout;
}

export function useUserShouldAgreeNewPrivacyNotice(): void {
  const self = useSelf();
  const dispatch = useDispatch();
  const invalidUser = useUserForcedToLogout();

  if (!invalidUser && self && self.terms_agreed < LATEST_PRIVACY_NOTICE) {
    dispatch({
      type: "prompt-to-agree-privacy-notice"
    });
  }
}

export function useIsSyncSettled(): boolean {
  const isDownloaded = useIsDownloaded();
  const loadedIssued = useLoadedIssuedPCDs();

  return isDownloaded && loadedIssued;
}

export function useIsLoggedIn(): boolean {
  return useSelector<boolean | undefined>((s) => s.self !== undefined, []);
}

export function useResolvingSubscriptionId(): string | undefined {
  return useSelector<string | undefined>((s) => s.resolvingSubscriptionId);
}

export function useCredentialCache(): CredentialCache {
  return useSelector<CredentialCache>((s) => s.credentialCache);
}

export function useCredentialManager(): CredentialManager {
  const identity = useIdentity();
  const pcds = usePCDCollection();
  const credentialCache = useCredentialCache();
  return useMemo(
    () => new CredentialManager(identity, pcds, credentialCache),
    [credentialCache, identity, pcds]
  );
}

export function useQuery(): URLSearchParams | undefined {
  const location = useLocation();
  try {
    const params = new URLSearchParams(location.search);
    return params;
  } catch (e) {
    console.log("failed to parse query string params", e);
    return undefined;
  }
}

export function useSubscriptions(): Wrapper<FeedSubscriptionManager> {
  const subs = useSelector<FeedSubscriptionManager>((s) => s.subscriptions, []);
  const [wrappedSubs, setWrappedSubs] = useState<
    Wrapper<FeedSubscriptionManager>
  >(() => wrap(subs));

  useEffect(() => {
    return subs.updatedEmitter.listen(() => {
      setWrappedSubs(wrap(subs));
    });
  }, [subs]);

  return wrappedSubs;
}

// Hook that checks whether the user has set a password for their account
export function useHasSetupPassword() {
  const self = useSelf();
  return hasSetupPassword(self);
}

// Hook that when invoked, requires the user to set a password if they haven't already
export function useRequirePassword() {
  const self = useSelf();
  const hasSetupPassword = useHasSetupPassword();
  const dispatch = useDispatch();
  if (self && !hasSetupPassword) {
    dispatch({
      type: "set-modal",
      modal: {
        modalType: "require-add-password"
      }
    });
  }
}

// Hook that enables keystrokes to properly listen to laser scanning inputs from supported devices
export function useLaserScannerKeystrokeInput() {
  const [typedText, setTypedText] = useState("");
  const nav = useNavigate();
  const usingLaserScanner = useUsingLaserScanner();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!usingLaserScanner) return;
      if (event.key === "Enter") {
        // Get the verify URL from the keystroke input and navigate to the last match, if it exists
        const url = getLastValidVerifyUrl(typedText);
        if (url) {
          const newLoc = maybeRedirect(url);
          if (newLoc) {
            nav(newLoc);
          }
        }
      }
      // Ignore characters that could not be in a valid URL
      if (/^[a-zA-Z0-9\-._~!$&'()*+,;=:@%#?/]$/.test(event.key)) {
        setTypedText((prevText) => prevText + event.key);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [typedText, nav, usingLaserScanner]);

  return typedText;
}
