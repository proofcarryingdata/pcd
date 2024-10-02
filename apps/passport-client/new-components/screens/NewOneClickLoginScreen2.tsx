import React, { ReactNode, useCallback, useEffect, useState } from "react";
import { useDispatch, useSelf } from "../../src/appHooks";
import { useParams } from "react-router-dom";
import { IPODTicketData } from "@pcd/pod-ticket-pcd";
import { requestGenericIssuanceTicketPreviews } from "@pcd/passport-interface";
import { appConfig } from "../../src/appConfig";
import { AppContainer } from "../../components/shared/AppContainer";
import { Typography } from "../shared/Typography";
import { Button2 } from "../shared/Button";
import styled from "styled-components";
import { TicketQR } from "@pcd/pod-ticket-pcd-ui";
import { NewLoader } from "../shared/NewLoader";

const TicketContainer = styled.div`
  border-radius: 16px;
  background: var(--white);
  padding: 16px;
  /* shadow-sm */
  box-shadow: 0px 1px 2px 0px rgba(0, 0, 0, 0.05);
`;

const QRContainer = styled.div`
  max-width: 321px;
  max-height: 321px;
  height: 100%;
  width: 100%;
  margin: 0 auto;
`;

const Container = styled.div`
  padding: 20px;
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 12px;
`;

const LoadingScreenContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin: auto 0;
`;

const TextContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const OneClickTicket = ({ data }: { data: IPODTicketData }): JSX.Element => {
  return (
    <TicketContainer>
      <QRContainer>
        <TicketQR ticketData={data} idBasedVerifyURL="" />
      </QRContainer>
      <TextContainer>
        <Typography color="#9A4AC9" fontWeight={800} fontSize={20}>
          {/* TODO: add ticket type to pod ticket data (speaker, event orginizer, etc)*/}
          {data.attendeeEmail.toUpperCase()} {/* &middot; {data.ticketType} */}
        </Typography>
        <Typography>{data.attendeeName}</Typography>
        <Typography color="var(--text-tertiary)">{data.eventName}</Typography>
      </TextContainer>
    </TicketContainer>
  );
};

const redirectToTargetFolder = (): void => {
  window.location.hash = `#/new`;
};

export const NewOneClickLoginScreen2 = (): JSX.Element | null => {
  const self = useSelf();
  const dispatch = useDispatch();
  const { email, code, targetFolder, pipelineId, serverUrl } = useParams();
  const [ticketPreviews, setTicketPreviews] = useState<IPODTicketData[]>([]);
  const [loading, setLoading] = useState(true);

  const handleLoadTicketPreviews = useCallback(async () => {
    if (!email || !code) {
      return;
    }
    try {
      const previewRes = await requestGenericIssuanceTicketPreviews(
        serverUrl ?? appConfig.zupassServer,
        email,
        code,
        pipelineId
      );

      setLoading(false);
      if (previewRes.success) {
        setTicketPreviews(previewRes.value.tickets);
      }
    } catch (err) {
      await dispatch({
        type: "error",
        error: {
          title: "An error occured",
          message: (err as Error).message || "An error occured"
        }
      });
    }
  }, [email, code, serverUrl, pipelineId, dispatch]);

  const handleOneClickLogin = useCallback(async () => {
    if (!email || !code) {
      return;
    }

    try {
      setLoading(true);
      await dispatch({
        type: "one-click-login",
        email,
        code,
        targetFolder,
        newUI: true
      });

      dispatch({
        type: "set-bottom-modal",
        modal: {
          modalType: "pods-collection",
          activePodId: ticketPreviews[0].ticketId,
          idType: "ticketId"
        }
      });
    } catch (err) {
      setLoading(false);
      await dispatch({
        type: "error",
        error: {
          title: "An error occured",
          message: (err as Error).message || "An error occured"
        }
      });
    }
  }, [email, code, dispatch, targetFolder, ticketPreviews]);

  useEffect(() => {
    if (process.env.ONE_CLICK_LOGIN_ENABLED !== "true") {
      window.location.hash = "#/";
      return;
    }

    if (self) {
      if (!self.emails?.includes(email as string)) {
        alert(
          `You are already logged in as ${
            self.emails.length === 1
              ? self.emails?.[0]
              : "an account that owns the following email addresses: " +
                self.emails.join(", ")
          }. Please log out and try navigating to the link again.`
        );
        window.location.hash = "#/new";
      } else {
        redirectToTargetFolder();
      }
    } else if (!email || !code) {
      window.location.hash = "#/new";
    } else {
      handleLoadTicketPreviews();
    }
  }, [
    self,
    targetFolder,
    handleLoadTicketPreviews,
    redirectToTargetFolder,
    email,
    code
  ]);

  const textOrLoader = (text: string): ReactNode => {
    if (loading) return <NewLoader columns={3} rows={2} color="white" />;
    return (
      <Typography color="inherit" fontSize={18} fontWeight={500} family="Rubik">
        {text}
      </Typography>
    );
  };
  if (loading) {
    return (
      <AppContainer fullscreen={true} bg="gray">
        <LoadingScreenContainer>
          <NewLoader columns={5} rows={5} />
          <Typography
            fontSize={18}
            fontWeight={800}
            color="var(--text-tertiary)"
          >
            LOADING TICKET INFO
          </Typography>
        </LoadingScreenContainer>
      </AppContainer>
    );
  }
  return (
    <AppContainer noPadding bg="gray">
      <Container>
        <OneClickTicket data={ticketPreviews[0]} />
        <Button2 onClick={handleOneClickLogin}>
          <Typography color="var(--text-white)" fontSize={18} fontWeight={500}>
            {textOrLoader("Continue to Zupass")}
          </Typography>
        </Button2>
      </Container>
    </AppContainer>
  );
};