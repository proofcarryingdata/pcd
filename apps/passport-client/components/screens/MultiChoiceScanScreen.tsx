import { useCallback, useState } from "react";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { SingleValue } from "react-select";
import styled from "styled-components";
import { useLaserScannerKeystrokeInput } from "../../src/appHooks";
import { loadUsingLaserScanner } from "../../src/localstorage";
import { maybeRedirect } from "../../src/util";
import { H5, Spacer, TextCenter } from "../core";
import { ReactQrReaderScanner } from "../core/scanners/ReactQRReaderScanner";
import { ScanditScanner } from "../core/scanners/ScanditScanner";
import { StrichScanner } from "../core/scanners/StrichScanner";
import { AppContainer } from "../shared/AppContainer";
import { IndicateIfOffline } from "../shared/IndicateIfOffline";
import Select from "../shared/Select";
import {
  Back,
  Home
} from "./ScannedTicketScreens/PodboxScannedTicketScreen/PodboxScannedTicketScreen";

// Scan a PCD QR code, then go to /verify to verify and display the proof.
export function MultiChoiceScanScreen(): JSX.Element {
  const usingLaserScanner = loadUsingLaserScanner();
  useLaserScannerKeystrokeInput();
  const nav = useNavigate();

  const [scanner, setScanner] = useState<
    "strich" | "react-qr-reader" | "scandit"
    // @ts-expect-error this is temporary code so doesn't need to type-check
  >(localStorage.getItem("preferred-scanner") ?? "scandit");

  type Option = {
    id: "strich" | "react-qr-reader" | "scandit";
    label: string;
  };

  const onChange = useCallback(
    (option: SingleValue<Option>) => {
      if (option) {
        setScanner(option.id);
        localStorage.setItem("preferred-scanner", option.id);
      }
    },
    [setScanner]
  );

  const options: Option[] = [
    { id: "scandit", label: "Scandit" },
    { id: "strich", label: "Strich" },
    { id: "react-qr-reader", label: "React-QR-Reader" }
  ];

  const onResult = useCallback(
    (result: string): void => {
      console.log(`Got result, considering redirect`, result);
      const newLoc = maybeRedirect(result);
      if (newLoc) {
        // Instantly remove any error toasts
        toast.remove();
        nav(newLoc);
      } else {
        toast.error(
          "The QR code you scanned is not a Zupass QR code. Make sure the QR code you're scanning comes from the Zupass app.",
          { id: "scan-error", duration: 10000, position: "bottom-center" }
        );
      }
    },
    [nav]
  );

  return (
    <AppContainer bg="gray">
      {!usingLaserScanner && (
        <QRContainer>
          <Spacer h={8} />
          <ButtonsContainer>
            <Back />
            <Home />
          </ButtonsContainer>
          <Select
            value={options.find((option) => option.id === scanner)}
            onChange={onChange}
            options={options}
          ></Select>
          <Spacer h={16} />
          {scanner === "react-qr-reader" && (
            <ReactQrReaderScanner onResult={onResult} />
          )}
          {scanner === "scandit" && <ScanditScanner onScan={onResult} />}
          {scanner === "strich" && <StrichScanner onResult={onResult} />}
          <Spacer h={16} />
          <TextCenter>Scan a ticket</TextCenter>
        </QRContainer>
      )}
      {usingLaserScanner && (
        <>
          <FullWidthRow>
            <Spacer h={32} />
            <TextCenter>
              Press and hold down the <Orange>orange</Orange> scan button and
              position the attendee's QR code in front of the laser light. If
              you're having trouble, ask the participant to increase the
              brightness on their screen.
            </TextCenter>
            <Spacer h={16} />
            <TextCenter>
              Please reach out to the Zupass Help Desk for any further scanning
              issues.
            </TextCenter>
            {/* TODO: Add an image if we have a good one */}
          </FullWidthRow>
        </>
      )}
      <Spacer h={32} />
      <IndicateIfOffline>
        <H5 style={{ color: "var(--danger)" }}>Offline Mode</H5>
        <Spacer h={8} />
        You're offline. Zupass is using a backed up copy of event tickets.
        Check-ins will be synced the next time you start the app with a working
        network connection.
      </IndicateIfOffline>
    </AppContainer>
  );
}

const Orange = styled.span`
  font-weight: bold;
  color: orange;
`;

const FullWidthRow = styled.div`
  width: 100%;
`;

const QRContainer = styled.div`
  width: 100%;
`;

const ButtonsContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: row;
  gap: 8px;
  margin-bottom: 16px;

  button {
    flex-grow: 1;
  }
`;
