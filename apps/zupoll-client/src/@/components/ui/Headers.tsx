import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import styled from "styled-components";
import logo from "../../../../public/zupoll-logo.png";
import { DEFAULT_CONTENT_WIDTH } from "./Elements";
import { Button } from "./button";

export function AppHeader() {
  return (
    <HeaderContainer>
      <div className="flex flex-row gap-4 items-center justify-center">
        <Image src={logo} alt="" height={50} />
      </div>
    </HeaderContainer>
  );
}

export function LogoutButton({ logout }: { logout: () => void }) {
  const confirmLogout = useCallback(() => {
    if (window.confirm("Are you sure you want to log out?")) {
      logout();
    }
  }, [logout]);

  return (
    <Button variant="outline" onClick={confirmLogout}>
      Log Out
    </Button>
  );
}

export function SubpageActions() {
  const router = useRouter();
  return (
    <Button onClick={() => router.push("/")} variant="outline">
      Home
    </Button>
  );
}

const HeaderContainer = styled.div`
  width: 100%;
  margin-bottom: 1em;
  display: flex;
  justify-content: center;
  align-items: center;
  width: ${DEFAULT_CONTENT_WIDTH};
  max-width: 100%;
  display: flex;
  font-weight: bold;

  /**
   * mobile styling
   */
  @media screen and (max-width: 640px) {
    padding-top: 8px;
  }
`;
