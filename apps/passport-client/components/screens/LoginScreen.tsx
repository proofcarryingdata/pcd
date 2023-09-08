import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useState
} from "react";
import styled from "styled-components";
import { logToServer } from "../../src/api/logApi";
import { appConfig } from "../../src/appConfig";
import { useDispatch, useQuery, useSelf } from "../../src/appHooks";
import {
  pendingAddRequestKey,
  pendingGetWithoutProvingRequestKey,
  pendingProofRequestKey,
  setPendingAddRequest,
  setPendingGetWithoutProvingRequest,
  setPendingProofRequest
} from "../../src/sessionStorage";
import { validateEmail } from "../../src/util";
import {
  BackgroundGlow,
  BigInput,
  Button,
  CenterColumn,
  H1,
  H2,
  HR,
  Spacer,
  TextCenter,
  ZuLogo
} from "../core";
import { LinkButton } from "../core/Button";
import { AppContainer } from "../shared/AppContainer";

export function LoginScreen() {
  const dispatch = useDispatch();
  const query = useQuery();
  const redirectedFromAction = query?.get("redirectedFromAction") === "true";

  const pendingGetWithoutProvingRequest = query?.get(
    pendingGetWithoutProvingRequestKey
  );
  const pendingAddRequest = query?.get(pendingAddRequestKey);
  const pendingProveRequest = query?.get(pendingProofRequestKey);

  useEffect(() => {
    let pendingRequestForLogging: string | undefined = undefined;

    if (pendingGetWithoutProvingRequest != null) {
      setPendingGetWithoutProvingRequest(pendingGetWithoutProvingRequest);
      pendingRequestForLogging = pendingGetWithoutProvingRequestKey;
    } else if (pendingAddRequest != null) {
      setPendingAddRequest(pendingAddRequest);
      pendingRequestForLogging = pendingAddRequestKey;
    } else if (pendingProveRequest != null) {
      setPendingProofRequest(pendingProveRequest);
      pendingRequestForLogging = pendingProofRequestKey;
    }

    if (pendingRequestForLogging != null) {
      logToServer("login-with-pending", { pending: pendingRequestForLogging });
    }
  }, [pendingGetWithoutProvingRequest, pendingAddRequest, pendingProveRequest]);

  const self = useSelf();
  const [email, setEmail] = useState("");

  const onGenPass = useCallback(
    function (e: FormEvent<HTMLFormElement>) {
      e.preventDefault();

      if (email === "") {
        dispatch({
          type: "error",
          error: {
            title: "Enter an Email",
            message: "You must enter an email address to register.",
            dismissToCurrentPage: true
          }
        });
      } else if (validateEmail(email) === false) {
        dispatch({
          type: "error",
          error: {
            title: "Invalid Email",
            message: `'${email}' is not a valid email.`,
            dismissToCurrentPage: true
          }
        });
      } else {
        dispatch({
          type: "new-passport",
          email: email.toLocaleLowerCase("en-US")
        });
      }
    },
    [dispatch, email]
  );

  useEffect(() => {
    // Redirect to home if already logged in
    if (self != null) {
      window.location.hash = "#/";
    }
  }, [self]);

  return (
    <AppContainer bg="primary">
      <BackgroundGlow
        y={224}
        from="var(--bg-lite-primary)"
        to="var(--bg-dark-primary)"
      >
        <Spacer h={64} />
        {redirectedFromAction ? (
          <>
            <TextCenter>
              <H2>LOGIN</H2>
            </TextCenter>
            <Spacer h={32} />
            <TextCenter>
              To complete this request, you need to either log into your
              existing PCDpass account, or create a new one.
            </TextCenter>
          </>
        ) : (
          <>
            <LoginHeader />
          </>
        )}

        <Spacer h={24} />

        <CenterColumn w={280}>
          <form onSubmit={onGenPass}>
            <BigInput
              type="text"
              autoFocus
              placeholder="your email address"
              value={email}
              onChange={useCallback(
                (e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value),
                [setEmail]
              )}
            />
            <Spacer h={8} />
            <Button style="primary" type="submit">
              Continue
            </Button>
          </form>
        </CenterColumn>
        <CenterColumn w={280}>
          {appConfig.isZuzalu && (
            <>
              <Spacer h={24} />
              <HR />
              <Spacer h={24} />
              <Spacer h={8} />
              <LinkButton to={"/scan"}>Verify a Passport</LinkButton>
            </>
          )}
        </CenterColumn>
      </BackgroundGlow>
      <Spacer h={64} />
    </AppContainer>
  );
}

function LoginHeader() {
  if (appConfig.isZuzalu) {
    return (
      <TextCenter>
        <H1>PASSPORT</H1>
        <Spacer h={24} />
        <ZuLogo />
        <Spacer h={24} />
        <H2>ZUZALU</H2>
        <Spacer h={24} />
        <Description>
          This experimental passport uses zero-knowledge proofs to prove Zuzalu
          citizenship without revealing who you are.
        </Description>
      </TextCenter>
    );
  }

  return (
    <TextCenter>
      <H1>PCDPASS</H1>
      <Spacer h={24} />
      <Description>
        This experimental passport uses zero-knowledge proofs to prove aspects
        of your identity to other websites.
      </Description>
    </TextCenter>
  );
}

const Description = styled.p`
  font-weight: 300;
  width: 220px;
  margin: 0 auto;
`;
