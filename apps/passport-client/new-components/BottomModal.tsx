import { ReactNode } from "react";
import styled from "styled-components";
import { useDispatch } from "../src/appHooks";

const BottomModalOverlay = styled.div<{ $fullScreen?: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  overflow-x: hidden;
  overflow-y: hidden;
  backdrop-filter: blur(4px);
  z-index: 9999;
  padding: 12px;
  display: flex;
  align-items: end;
`;

const BottomModalContainer = styled.div`
  padding: 24px 24px 20px 24px;
  gap: 20px;
  border-radius: 40px;
  background: #ffffff;
  bottom: 12px;
  color: black;
  flex: 1;
  box-shadow: 0px 4px 6px -1px #0000001a;
`;

export type BottomModalProps = {
  isOpen: boolean;
  children: ReactNode;
};

export const BottomModal = ({
  isOpen,
  children
}: BottomModalProps): JSX.Element | null => {
  const dispatch = useDispatch();
  if (!isOpen) {
    return null;
  }
  return (
    <BottomModalOverlay
      onClick={() => {
        dispatch({
          type: "set-bottom-modal",
          modal: { modalType: "none" }
        });
      }}
    >
      <BottomModalContainer
        onClick={(e) => {
          // Consider use clickOutside hook instead of that
          e.stopPropagation();
        }}
      >
        {children}
      </BottomModalContainer>
    </BottomModalOverlay>
  );
};
