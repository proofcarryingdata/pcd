import { useCallback, useEffect, useState } from "react";
import { logToServer } from "../../src/api/logApi";
import { requestLoginCode } from "../../src/api/user";
import { useDispatch, useQuery, useSelf } from "../../src/appHooks";
import { err } from "../../src/util";
import {
  BackgroundGlow,
  BigInput,
  Button,
  CenterColumn,
  H2,
  HR,
  Spacer,
  TextCenter
} from "../core";
import { RippleLoader } from "../core/RippleLoader";
import { MaybeModal } from "../modals/Modal";
import { AppContainer } from "../shared/AppContainer";

export function AlreadyRegisteredScreen() {
  const dispatch = useDispatch();
  const self = useSelf();
  const [sendingEmail, setSendingEmail] = useState(false);
  const query = useQuery();
  const email = query?.get("email");
  const identityCommitment = query?.get("identityCommitment");
  const [password, setPassword] = useState("");

  const onEmailSuccess = useCallback(
    (devToken: string | undefined) => {
      if (devToken === undefined) {
        window.location.href = `#/enter-confirmation-code?email=${encodeURIComponent(
          email
        )}&identityCommitment=${encodeURIComponent(identityCommitment)}`;
      } else {
        dispatch({ type: "verify-token", email, token: devToken });
      }
    },
    [dispatch, email, identityCommitment]
  );

  const onOverwriteClick = useCallback(() => {
    setSendingEmail(true);
    logToServer("overwrite-account-click", { email, identityCommitment });
    requestLoginCode(email, identityCommitment, true)
      .then(onEmailSuccess)
      .catch((e) => {
        err(dispatch, "Email failed", e.message);
        setSendingEmail(false);
      });
  }, [dispatch, email, identityCommitment, onEmailSuccess]);

  const onLoginWithMasterPasswordClick = useCallback(() => {
    // TODO: FIX LOGIN, NEEDS SALT
    logToServer("login-with-master-password-click", {
      email,
      identityCommitment
    });
    window.location.href = "#/sync-existing";
  }, [email, identityCommitment]);

  const onCancelClick = useCallback(() => {
    window.location.href = "#/";
  }, []);

  useEffect(() => {
    if (self) {
      window.location.href = "#/";
    }
  }, [self]);

  if (self) {
    return null;
  }

  return (
    <>
      <MaybeModal />
      <AppContainer bg="primary">
        <BackgroundGlow
          y={224}
          from="var(--bg-lite-primary)"
          to="var(--bg-dark-primary)"
        >
          <Spacer h={64} />
          <TextCenter>
            <H2>LOGIN</H2>
          </TextCenter>
          <Spacer h={32} />
          <TextCenter>
            Welcome back! Enter your password below to continue. Resetting your
            account will let you access your tickets, but you'll lose all
            non-ticket PCDs.
          </TextCenter>
          <Spacer h={32} />
          {sendingEmail ? (
            <RippleLoader />
          ) : (
            <>
              <CenterColumn w={280}>
                {/* For password manager autofill */}
                <input hidden type="text" value={email} />
                <BigInput
                  type="password"
                  value={password}
                  placeholder="Enter your password..."
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Spacer h={8} />
                <Button onClick={onLoginWithMasterPasswordClick}>Next</Button>
                <Spacer h={8} />
                <Button onClick={onCancelClick}>Back</Button>
              </CenterColumn>
              <Spacer h={24} />
              <HR />
              <Spacer h={24} />
              <CenterColumn w={280}>
                <Button onClick={onOverwriteClick} style="danger">
                  Reset Account
                </Button>
              </CenterColumn>
            </>
          )}
        </BackgroundGlow>
        <Spacer h={64} />
      </AppContainer>
    </>
  );
}
