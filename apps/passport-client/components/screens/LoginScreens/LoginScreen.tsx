import {
  requestDownloadAndDecryptStorage,
  requestLogToServer
} from "@pcd/passport-interface";
import { validateEmail } from "@pcd/util";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useState
} from "react";
import { UAParser } from "ua-parser-js";
import { appConfig } from "../../../src/appConfig";
import {
  useDispatch,
  useQuery,
  useSelf,
  useStateContext
} from "../../../src/appHooks";
import {
  pendingRequestKeys,
  setPendingAddRequest,
  setPendingAddSubscriptionRequest,
  setPendingGenericIssuanceCheckinRequest,
  setPendingGetWithoutProvingRequest,
  setPendingProofRequest,
  setPendingViewFrogCryptoRequest,
  setPendingViewSubscriptionsRequest
} from "../../../src/sessionStorage";
import {
  BigInput,
  Button,
  CenterColumn,
  H1,
  H2,
  Spacer,
  TextCenter
} from "../../core";
import { RippleLoader } from "../../core/RippleLoader";
import { AppContainer } from "../../shared/AppContainer";
import { InlineError } from "../../shared/InlineError";

export function LoginScreen(): JSX.Element {
  const dispatch = useDispatch();
  const state = useStateContext().getState();
  const [error, setError] = useState<string | undefined>();
  const query = useQuery();
  const redirectedFromAction = query?.get("redirectedFromAction") === "true";

  const pendingGetWithoutProvingRequest = query?.get(
    pendingRequestKeys.getWithoutProving
  );
  const pendingAddRequest = query?.get(pendingRequestKeys.add);
  const pendingProveRequest = query?.get(pendingRequestKeys.proof);
  const pendingViewSubscriptionsRequest = query?.get(
    pendingRequestKeys.viewSubscriptions
  );
  const pendingAddSubscriptionRequest = query?.get(
    pendingRequestKeys.addSubscription
  );
  const pendingViewFrogCryptoRequest = query?.get(
    pendingRequestKeys.viewFrogCrypto
  );
  const pendingGenericIssuanceCheckinRequest = query?.get(
    pendingRequestKeys.genericIssuanceCheckin
  );
  useEffect(() => {
    let pendingRequestForLogging: string | undefined = undefined;

    if (pendingGetWithoutProvingRequest) {
      setPendingGetWithoutProvingRequest(pendingGetWithoutProvingRequest);
      pendingRequestForLogging = pendingRequestKeys.getWithoutProving;
    } else if (pendingAddRequest) {
      setPendingAddRequest(pendingAddRequest);
      pendingRequestForLogging = pendingRequestKeys.add;
    } else if (pendingProveRequest) {
      setPendingProofRequest(pendingProveRequest);
      pendingRequestForLogging = pendingRequestKeys.proof;
    } else if (pendingViewSubscriptionsRequest) {
      setPendingViewSubscriptionsRequest(pendingViewSubscriptionsRequest);
      pendingRequestForLogging = pendingRequestKeys.viewSubscriptions;
    } else if (pendingAddSubscriptionRequest) {
      setPendingAddSubscriptionRequest(pendingAddSubscriptionRequest);
      pendingRequestForLogging = pendingRequestKeys.addSubscription;
    } else if (pendingViewFrogCryptoRequest) {
      setPendingViewFrogCryptoRequest(pendingViewFrogCryptoRequest);
      pendingRequestForLogging = pendingRequestKeys.viewFrogCrypto;
    } else if (pendingGenericIssuanceCheckinRequest) {
      setPendingGenericIssuanceCheckinRequest(
        pendingGenericIssuanceCheckinRequest
      );
      pendingRequestForLogging = pendingRequestKeys.genericIssuanceCheckin;
    }

    if (pendingRequestForLogging) {
      requestLogToServer(appConfig.zupassServer, "login-with-pending", {
        pending: pendingRequestForLogging
      });
    }
  }, [
    pendingGetWithoutProvingRequest,
    pendingAddRequest,
    pendingProveRequest,
    pendingViewSubscriptionsRequest,
    pendingAddSubscriptionRequest,
    pendingViewFrogCryptoRequest,
    pendingGenericIssuanceCheckinRequest
  ]);

  const suggestedEmail = query?.get("email");

  const self = useSelf();
  const [email, setEmail] = useState(suggestedEmail ?? "");

  const onGenPass = useCallback(
    function (e: FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const trimmedEmail = email.trim();

      if (trimmedEmail === "" || validateEmail(trimmedEmail) === false) {
        setError("Enter a valid email address");
      } else {
        dispatch({
          type: "new-passport",
          email: trimmedEmail.toLocaleLowerCase("en-US")
        });
      }
    },
    [dispatch, email]
  );

  const [tryStorageAccess, setTryStorageAccess] = useState(false);
  const [tryStorageLogin, setTryStorageLogin] = useState(false);

  /**
   * Assuming we're in Chrome and an iframe, and we've successfully loaded an
   * encryption key from local storage, try to use it to log in.
   */
  const tryToLogin = useCallback(
    async (encryptionKey: string) => {
      // Try to download and decrypt the storage
      const storageRequest = await requestDownloadAndDecryptStorage(
        appConfig.zupassServer,
        encryptionKey
      );
      if (storageRequest.success) {
        // Success, log in
        dispatch({
          type: "load-after-login",
          storage: storageRequest.value,
          encryptionKey
        });
      }
    },
    [dispatch]
  );

  /**
   * This will only be called if we're in an iframe and Chrome.
   */
  const requestStorageAndLogIn = useCallback(async () => {
    try {
      // @ts-expect-error Chrome-only API
      const handle: { localStorage: Storage } =
        // @ts-expect-error Chrome-only API
        await document.requestStorageAccess({ localStorage: true });

      // Access granted, try reading the local storage
      const encryptionKey = handle.localStorage.getItem("encryption_key");
      if (encryptionKey) {
        await tryToLogin(encryptionKey);
      }
    } catch (_e) {
      // If the user rejected the storage access request, catch the exception
      // but otherwise do nothing. The finally block will return the user to
      // the regular login flow.
    } finally {
      setTryStorageAccess(false);
      setTryStorageLogin(false);
    }
  }, [tryToLogin]);

  useEffect(() => {
    (async (): Promise<void> => {
      // Are we in an iframe? If so, we might be able to skip requesting the
      // user's email and password by retrieving their encryption key from the
      // first-party local storage. Currently this only works on Chrome 125+.
      const parser = new UAParser();
      const browserName = parser.getBrowser().name;
      const browserVersion = parser.getBrowser().version;
      const isChrome125OrAbove =
        browserName === "Chrome" &&
        browserVersion &&
        parseInt(browserVersion) >= 125;

      if (window.parent !== window && isChrome125OrAbove) {
        // Do we already have access?
        const hasAccess = await document.hasStorageAccess();
        if (!hasAccess) {
          // No access, try requesting it interactively
          // Setting this state will trigger the UI to show the "Connect to
          // Zupass" button. To request storage access, the user must click
          // the button and approve the dialog.
          // Storage access requests must occur in response to a user action,
          // so we can't request it automatically here and must wait for the
          // user to click the button.
          setTryStorageAccess(true);
        } else {
          // We have access, try logging in
          // Show a spinner:
          setTryStorageLogin(true);
          // Try to read from storage and log in
          requestStorageAndLogIn();
        }
      }
    })();
  }, [dispatch, requestStorageAndLogIn, tryToLogin]);

  useEffect(() => {
    // Redirect to home if already logged in
    if (self) {
      window.location.hash = "#/";
    }
  }, [self]);

  return (
    <AppContainer bg="primary">
      <Spacer h={64} />
      {state.loggingOut ? (
        <>
          <TextCenter>
            <H1>ZUPASS</H1>
            <Spacer h={24} />
            Logging you Out
            <Spacer h={8} />
            <RippleLoader />
          </TextCenter>
        </>
      ) : redirectedFromAction ? (
        <>
          <TextCenter>
            <H2>ZUPASS</H2>
            <Spacer h={24} />
            To complete this request, please login or register with your email
            below.
          </TextCenter>
        </>
      ) : (
        <>
          <TextCenter>
            <H1>ZUPASS</H1>
            <Spacer h={24} />
            This is an experimental personal cryptography manager, powered by
            Zero-Knowledge.
          </TextCenter>
        </>
      )}

      {tryStorageAccess && (
        <TextCenter>
          <Spacer h={24} />
          Do you want to connect to Zupass?
          <Spacer h={24} />
          <Button onClick={requestStorageAndLogIn}>Connect to Zupass</Button>
        </TextCenter>
      )}

      {tryStorageLogin && (
        <TextCenter>
          <Spacer h={24} />
          <RippleLoader />
        </TextCenter>
      )}

      {!tryStorageAccess && !tryStorageLogin && !state.loggingOut && (
        <>
          <Spacer h={24} />
          <CenterColumn>
            <form onSubmit={onGenPass}>
              <BigInput
                autoCapitalize="off"
                autoCorrect="off"
                type="text"
                autoFocus
                placeholder="email address"
                value={email}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
              />
              <InlineError error={error} />
              <Spacer h={8} />
              <Button style="primary" type="submit">
                Continue
              </Button>
            </form>
          </CenterColumn>
          <Spacer h={64} />
        </>
      )}
    </AppContainer>
  );
}
