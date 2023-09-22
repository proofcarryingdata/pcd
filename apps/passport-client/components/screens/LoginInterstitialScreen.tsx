import { Spacer } from "@pcd/passport-ui";
import { useEffect, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { appConfig } from "../../src/appConfig";
import { useLoadedIssuedPCDs } from "../../src/appHooks";
import {
  clearAllPendingRequests,
  getPendingAddRequest,
  getPendingAddSubscriptionPageRequest,
  getPendingGetWithoutProvingRequest,
  getPendingHaloRequest,
  getPendingProofRequest,
  getPendingViewSubscriptionsPageRequest
} from "../../src/sessionStorage";
import { useSyncE2EEStorage } from "../../src/useSyncE2EEStorage";
import { BackgroundGlow, CenterColumn } from "../core";
import { RippleLoader } from "../core/RippleLoader";
import { AppContainer } from "../shared/AppContainer";

export function LoginInterstitialScreen() {
  useSyncE2EEStorage();
  const navigate = useNavigate();

  const loadedIssuedPCDs = useLoadedIssuedPCDs();

  useEffect(() => {
    if (loadedIssuedPCDs || appConfig.isZuzalu) {
      if (getPendingProofRequest() != null) {
        console.log("Redirecting to prove screen");
        const encReq = encodeURIComponent(getPendingProofRequest());
        clearAllPendingRequests();
        navigate("/prove?request=" + encReq, { replace: true });
      } else if (getPendingAddRequest() != null) {
        console.log("Redirecting to add screen");
        const encReq = encodeURIComponent(getPendingAddRequest());
        clearAllPendingRequests();
        navigate("/add?request=" + encReq, { replace: true });
      } else if (getPendingHaloRequest() != null) {
        console.log("Redirecting to halo screen");
        clearAllPendingRequests();
        navigate(`/halo${getPendingHaloRequest()}`, { replace: true });
      } else if (getPendingGetWithoutProvingRequest() != null) {
        console.log("Redirecting to get without proving screen");
        const encReq = encodeURIComponent(getPendingGetWithoutProvingRequest());
        clearAllPendingRequests();
        navigate(`/get-without-proving?request=${encReq}`, { replace: true });
      } else if (getPendingViewSubscriptionsPageRequest() != null) {
        console.log("Redirecting to view subscription screen");
        clearAllPendingRequests();
        navigate(`/subscriptions`, { replace: true });
      } else if (getPendingAddSubscriptionPageRequest() != null) {
        console.log("Redirecting to add subscription screen");
        const encReq = encodeURIComponent(
          JSON.parse(getPendingAddSubscriptionPageRequest())
        );
        clearAllPendingRequests();
        navigate(`/add-subscription?url=${encReq}`, { replace: true });
      } else {
        window.location.hash = "#/";
      }
    }
  }, [loadedIssuedPCDs, navigate]);

  // scroll to top when we navigate to this page
  useLayoutEffect(() => {
    document.body.scrollTop = document.documentElement.scrollTop = 0;
  }, []);

  return (
    <>
      <AppContainer bg="primary">
        <BackgroundGlow
          y={224}
          from="var(--bg-lite-primary)"
          to="var(--bg-dark-primary)"
        >
          <Spacer h={64} />
          <CenterColumn w={280}>
            <RippleLoader />
          </CenterColumn>
        </BackgroundGlow>
      </AppContainer>
    </>
  );
}
