import {
  EdDSATicketPCD,
  EdDSATicketPCDPackage,
  EdDSATicketPCDTypeName
} from "@pcd/eddsa-ticket-pcd";
import {
  ISSUANCE_STRING,
  PendingPCD,
  ProveOptions,
  requestProveOnServer
} from "@pcd/passport-interface";
import {
  ArgsOf,
  PCDOf,
  PCDPackage,
  SerializedPCD,
  isPCDArgument
} from "@pcd/pcd-types";
import {
  SemaphoreSignaturePCDPackage,
  SemaphoreSignaturePCDTypeName
} from "@pcd/semaphore-signature-pcd";
import { getErrorMessage } from "@pcd/util";
import {
  ZKEdDSAEventTicketPCD,
  ZKEdDSAEventTicketPCDPackage,
  isZKEdDSAEventTicketPCDPackage
} from "@pcd/zk-eddsa-event-ticket-pcd";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { appConfig } from "../../../src/appConfig";
import {
  usePCDCollection,
  useProveState,
  useProveStateCount
} from "../../../src/appHooks";
import {
  getOOMErrorMessage,
  getOutdatedBrowserErrorMessage
} from "../../../src/devconnectUtils";
import {
  OOM_ERROR_MESSAGE,
  OUTDATED_BROWSER_ERROR_MESSAGE
} from "../../../src/sharedConstants";
import { nextFrame } from "../../../src/util";
import { PCDArgs } from "../../shared/PCDArgs";
import { Button2 } from "../../../new-components/shared/Button";
import { NewLoader } from "../../../new-components/shared/NewLoader";
import { Typography } from "../../../new-components/shared/Typography";

/**
 * A reuseable form which can be used to generate a new instance of a PCD
 * given the type, arguments, and proving options.
 */
export function GenericProveSection<T extends PCDPackage = PCDPackage>({
  pcdType,
  initialArgs,
  options,
  onProve
}: {
  pcdType: string;
  initialArgs: ArgsOf<T>;
  options?: ProveOptions;
  onProve: (
    pcd: PCDOf<T> | undefined,
    serializedPCD: SerializedPCD<PCDOf<T>> | undefined,
    pendingPCD: PendingPCD | undefined,
    multiplePCDs?: Array<SerializedPCD<PCDOf<T>>>
  ) => void;
  folder?: string;
}): JSX.Element {
  const pcds = usePCDCollection();
  const [args, setArgs] = useState<ArgsOf<T>>(
    JSON.parse(JSON.stringify(initialArgs))
  );
  const [error, setError] = useState<string | undefined>();
  const [proving, setProving] = useState(false);
  const pcdPackage = pcds.getPackage<T>(pcdType);
  const [multiProofsCompleted, setMultiProofsCompleted] = useState(0);
  const [multiProofsQueued, setMultiProofsQueued] = useState(0);
  const proveState = useProveState();
  const proveStateCount = useProveStateCount();
  useEffect(() => {
    if (options?.multi && !isZKEdDSAEventTicketPCDPackage(pcdPackage)) {
      setError("multi-proofs are only supported for ZKEdDSAEventTicketPCD");
      return;
    }

    setError(undefined);
  }, [args, options, pcdPackage]);

  const isProveReady = useMemo(
    () =>
      !Object.entries(args).find(
        ([_, arg]) =>
          // only PCD arguments are required
          isPCDArgument(arg) && !arg.value
      ),
    [args]
  );

  const pcdsPropCount = useMemo(() => {
    let count = 0;
    for (const [_, arg] of Object.entries(args)) {
      if (isPCDArgument(arg)) count++;
    }
    return count;
  }, [args]);

  console.log(pcdsPropCount);
  const onProveClick = useCallback(async () => {
    setProving(true);
    setError(undefined);

    // Give the UI has a chance to update to the 'loading' state before the
    // potentially blocking proving operation kicks off
    await nextFrame();

    if (pcdType === SemaphoreSignaturePCDTypeName) {
      const signatureArgs = args as ArgsOf<typeof SemaphoreSignaturePCDPackage>;
      if (signatureArgs?.signedMessage?.value === ISSUANCE_STRING) {
        setError("Can't sign this message");
        setProving(false);
        return;
      }
    }

    if (options?.proveOnServer === true) {
      const pendingPCDResult = await requestProveOnServer(
        appConfig.zupassServer,
        {
          pcdType: pcdType,
          args: args
        }
      );
      setProving(false);

      if (!pendingPCDResult.success) {
        if (pendingPCDResult.error.includes(OUTDATED_BROWSER_ERROR_MESSAGE)) {
          setError(getOutdatedBrowserErrorMessage());
        } else {
          setError(pendingPCDResult.error);
        }
        return;
      }

      onProve(undefined, undefined, pendingPCDResult.value);
    }
    if (options?.multi) {
      try {
        if (!pcdPackage) {
          throw new Error(`PCD package not found for ${pcdType}`);
        }

        if (!isZKEdDSAEventTicketPCDPackage(pcdPackage)) {
          throw new Error("multi-proofs are only available for tickets!");
        }

        let relevantPCDs = pcds
          .getAll()
          .filter((p) => p.type === EdDSATicketPCDTypeName);

        const ticketValidation =
          pcdPackage?.getProveDisplayOptions?.()?.defaultArgs?.["ticket"];
        if (ticketValidation) {
          relevantPCDs = pcds.getAll().filter((p) => {
            const ticketArg = args["ticket"];
            return ticketValidation.validate(p, ticketArg.validatorParams);
          });
        }

        setMultiProofsQueued(relevantPCDs.length);

        const result: SerializedPCD<ZKEdDSAEventTicketPCD>[] = [];

        for (const t of relevantPCDs) {
          const argsClone = _.clone(args) as ArgsOf<
            typeof ZKEdDSAEventTicketPCDPackage
          >;
          argsClone.ticket.value = await EdDSATicketPCDPackage.serialize(
            t as EdDSATicketPCD
          );
          const pcd = await pcdPackage.prove(argsClone);
          const serializedPCD = await pcdPackage.serialize(pcd);
          setMultiProofsCompleted((c) => c + 1);
          result.push(serializedPCD);
        }

        onProve(undefined, undefined, undefined, result);
      } catch (e) {
        const errorMessage = getErrorMessage(e);
        if (errorMessage.includes(OOM_ERROR_MESSAGE)) {
          setError(getOOMErrorMessage());
        } else if (errorMessage.includes(OUTDATED_BROWSER_ERROR_MESSAGE)) {
          setError(getOutdatedBrowserErrorMessage());
        } else {
          setError(errorMessage);
        }
        // NB: Only re-enable the 'Prove' button if there was an error. If
        // the proving operation succeeded, we want to leave the button
        // disabled while onProve redirects user.
        setProving(false);
      }
    } else {
      try {
        if (!pcdPackage) {
          throw new Error(`PCD package not found for ${pcdType}`);
        }
        const pcd = await pcdPackage.prove(args);
        const serializedPCD = await pcdPackage.serialize(pcd);
        onProve(pcd as PCDOf<T>, serializedPCD, undefined);
      } catch (e) {
        const errorMessage = getErrorMessage(e);
        if (errorMessage.includes(OUTDATED_BROWSER_ERROR_MESSAGE)) {
          setError(getOutdatedBrowserErrorMessage());
        } else {
          setError(errorMessage);
        }
        // NB: Only re-enable the 'Prove' button if there was an error. If
        // the proving operation succeeded, we want to leave the button
        // disabled while onProve redirects user.
        setProving(false);
      }
    }
  }, [
    pcdType,
    options?.proveOnServer,
    options?.multi,
    args,
    onProve,
    pcdPackage,
    pcds
  ]);

  return (
    <Container>
      {proveState !== undefined && !proveState && (
        <AbsoluteContainer>
          <Typography color="var(--new-danger)">No tickets found</Typography>
          <Typography color="var(--new-danger)">
            Please ensure you have connected the right email address.
          </Typography>
          <Button2
            style={{ marginTop: "auto" }}
            onClick={() => {
              window.history.back();
            }}
            variant="secondary"
          >
            Back
          </Button2>
        </AbsoluteContainer>
      )}
      {proveStateCount < pcdsPropCount && (
        <AbsoluteContainer>
          <NewLoader columns={5} rows={5} />
          <Typography>Loading the proof</Typography>
        </AbsoluteContainer>
      )}

      <PCDArgs
        args={args}
        setArgs={setArgs}
        options={pcdPackage?.getProveDisplayOptions?.()?.defaultArgs}
        proveOptions={options}
      />
      {proving && options?.multi && (
        <Typography style={{ textAlign: "center" }}>
          Proving {multiProofsCompleted} out of {multiProofsQueued}
        </Typography>
      )}
      {error && (
        <Typography
          fontSize={16}
          color="var(--new-danger)"
          style={{ textAlign: "center" }}
        >
          {error}
        </Typography>
      )}
      <ButtonsContainer>
        <Button2 disabled={!isProveReady || proving} onClick={onProveClick}>
          {proving ? <NewLoader rows={2} columns={3} color="white" /> : "Prove"}
        </Button2>

        <Button2
          onClick={() => {
            window.history.back();
          }}
          variant="secondary"
        >
          Back
        </Button2>
      </ButtonsContainer>
    </Container>
  );
}

const Container = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
`;
const ButtonsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const AbsoluteContainer = styled.div`
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  z-index: 100;
  background: white;
`;
