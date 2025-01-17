import { styled } from "@pcd/passport-ui";
import { PCDUI } from "@pcd/pcd-types";
import { PODEmailPCD } from "@pcd/pod-email-pcd";

export const PODEmailPCDUI: PCDUI<PODEmailPCD> = {
  renderCardBody: PODEmailCardBody
};

function PODEmailCardBody({ pcd }: { pcd: PODEmailPCD }): JSX.Element {
  const emailAddress = pcd.claim.podEntries.emailAddress.value;
  if (!emailAddress) return <></>;
  const [username, domain] = emailAddress.split("@");

  return (
    <Container>
      <EmailInfo>
        <EmailWrapper>
          <Username>{username}</Username>
          <Domain>@{domain}</Domain>
          <div style={{ clear: "both" }} />
        </EmailWrapper>
      </EmailInfo>
    </Container>
  );
}

const Container = styled.span`
  padding: 16px;
  overflow: hidden;
  width: 100%;
`;

const EmailInfo = styled.div`
  margin-top: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
`;

const EmailWrapper = styled.div`
  display: flex;
  max-width: 80%;
  overflow: hidden;
`;

const Username = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
`;

const Domain = styled.span`
  flex-shrink: 0;
  margin-left: -1px;
`;
