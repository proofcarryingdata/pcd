import { ReactNode, useCallback } from "react";
import { Toaster } from "react-hot-toast";
import styled from "styled-components";
import { ErrorBottomModal } from "../../new-components/shared/Modals/ErrorBottomModal";
import {
  useAppError,
  useDispatch,
  useIOSOrientationFix,
  useUserShouldAgreeNewPrivacyNotice
} from "../../src/appHooks";
import { BANNER_HEIGHT, MAX_WIDTH_SCREEN } from "../../src/sharedConstants";
import { ScreenLoader } from "./ScreenLoader";

// Wrapper for all screens.
export function AppContainer({
  children,
  bg,
  fullscreen,
  noPadding
}: {
  bg: "primary" | "gray" | "white";
  children?: ReactNode;
  fullscreen?: boolean;
  noPadding?: boolean;
}): JSX.Element {
  const dispatch = useDispatch();
  const error = useAppError();
  useUserShouldAgreeNewPrivacyNotice();
  useIOSOrientationFix();

  const onClose = useCallback(
    () => dispatch({ type: "clear-error" }),
    [dispatch]
  );
  const getBackground = (): string => {
    switch (bg) {
      case "primary":
        return "var(--bg-dark-primary)";
      case "gray":
        return "var(--dot-pattern-bg)";
      case "white":
        return "#fff";
    }
  };
  const col = getBackground();
  return (
    <Container $fullscreen={!!fullscreen}>
      <Background color={col}>
        <CenterColumn defaultPadding={!noPadding} $fullscreen={!!fullscreen}>
          {children && (
            <Toaster
              toastOptions={{
                success: {
                  duration: 5000
                },
                error: {
                  duration: 8000
                }
              }}
            />
          )}
          {children ?? <ScreenLoader text="Zupass" />}
          {error && <ErrorBottomModal error={error} onClose={onClose} />}
        </CenterColumn>
      </Background>
    </Container>
  );
}
export const Background = styled.div<{ color: string }>`
  width: 100%;
  min-height: 100%;
  background: ${(p): string => p.color};
`;

export const CenterColumn = styled.div<{
  defaultPadding: boolean;
  $fullscreen?: boolean;
}>`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  flex-direction: column;
  min-height: 100%;
  margin: 0 auto;
  position: relative;
  ${({ $fullscreen }): string =>
    !$fullscreen ? `max-width: ${MAX_WIDTH_SCREEN}px` : ""};
  ${({ defaultPadding }): string => (defaultPadding ? "padding: 16px;" : "")}
  padding-top: ${BANNER_HEIGHT}px;
`;

const Container = styled.div<{ $fullscreen: boolean }>`
  ${({ $fullscreen }): string =>
    $fullscreen
      ? `
          display: flex;
          height: 100vh;

          @supports (height: 100dvh) {
            height: 100dvh;
          }
        `
      : ""}
`;
