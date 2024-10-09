import { Cog6ToothIcon, Square3Stack3DIcon } from "@heroicons/react/24/solid";
import styled from "styled-components";
import { useDispatch } from "../../src/appHooks";
import { Typography } from "./Typography";

const FloatingMenuContainer = styled.div`
  position: fixed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  bottom: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  z-index: 2;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 24px;
  border-radius: 200px;
`;

const FloatingMenuItem = styled.div`
  width: 56px;
  height: 40px;
  justify-content: center;
  align-items: center;
  display: flex;
  cursor: pointer;
`;

const IconContainer = styled.div`
  display: flex;
  flex-direction: column;
  color: #fff;
  opacity: 0.8;
`;

export const FloatingMenu = (): JSX.Element => {
  const dispatch = useDispatch();
  return (
    <FloatingMenuContainer>
      <FloatingMenuItem
        onClick={() => {
          dispatch({
            type: "set-bottom-modal",
            modal: { modalType: "pods-collection" }
          });
        }}
      >
        <IconContainer>
          <Square3Stack3DIcon color="inherit" height={24} />
          <Typography
            fontSize={10}
            fontWeight={500}
            family="Rubik"
            color="inherit"
          >
            PODS
          </Typography>
        </IconContainer>
      </FloatingMenuItem>
      <FloatingMenuItem
        onClick={() =>
          dispatch({
            type: "set-bottom-modal",
            modal: { modalType: "settings" }
          })
        }
      >
        <IconContainer>
          <Cog6ToothIcon color="inherit" height={24} />
          <Typography
            fontSize={10}
            fontWeight={500}
            family="Rubik"
            color="inherit"
          >
            SETTINGS
          </Typography>
        </IconContainer>
      </FloatingMenuItem>
    </FloatingMenuContainer>
  );
};
