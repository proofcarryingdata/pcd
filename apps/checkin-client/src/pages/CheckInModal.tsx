import {
  Button,
  ButtonGroup,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay
} from "@chakra-ui/react";
import {
  PipelineCheckinSummary,
  requestGenericIssuanceSetManualCheckInState
} from "@pcd/passport-interface";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ReactNode, useCallback } from "react";

export function CheckInModal({
  checkingIn,
  setCheckingIn,
  data
}: {
  checkingIn: string | undefined;
  setCheckingIn: (ticketId: string | undefined) => void;
  data: PipelineCheckinSummary[];
}): ReactNode {
  const onClose = useCallback(() => setCheckingIn(undefined), [setCheckingIn]);
  const ticket = data.find((checkIn) => checkIn.ticketId === checkingIn);

  const client = useQueryClient();

  const mutation = useMutation({
    mutationKey: [checkingIn],
    mutationFn: async ({ ticketId }: { ticketId: string }) => {
      const result = await requestGenericIssuanceSetManualCheckInState(
        process.env.PASSPORT_SERVER_URL as string,
        process.env.MANUAL_CHECKIN_PIPELINE_ID as string,
        process.env.MANUAL_CHECKIN_API_KEY as string,
        ticketId,
        true
      );

      if (!result.success) {
        throw new Error("Could not check in ticket");
      }
    },
    onSuccess: () => {
      console.log("invalidating");
      client.invalidateQueries({ queryKey: ["checkIns"] });
    }
  });

  return (
    <Modal
      onClose={onClose}
      isOpen={!!checkingIn && !!ticket}
      isCentered
      motionPreset="slideInBottom"
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Check In</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <div>
            <strong>Email:</strong> {ticket?.email}
          </div>
          <div>
            <strong>Ticket:</strong> {ticket?.ticketName}
          </div>
          {mutation.isSuccess && (
            <div>
              <strong>Checked in!</strong>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <ButtonGroup>
            {checkingIn && !mutation.isSuccess && (
              <Button
                isLoading={mutation.isPending}
                loadingText="Checking in..."
                colorScheme="green"
                onClick={() => mutation.mutate({ ticketId: checkingIn })}
              >
                Check In
              </Button>
            )}
            <Button onClick={onClose}>
              {mutation.isSuccess ? "Close" : "Cancel"}
            </Button>
          </ButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
