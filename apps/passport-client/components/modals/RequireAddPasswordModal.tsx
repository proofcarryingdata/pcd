import { useCallback, useState } from "react";
import styled from "styled-components";
import { useDispatch, useSelf } from "../../src/appHooks";
import { setPassword } from "../../src/password";
import { BigInput, H2, Spacer } from "../core";
import { NewPasswordForm } from "../shared/NewPasswordForm";

/**
 * This uncloseable modal is shown to users of Zupass who have a sync key,
 * and have never created a password. It asks them to create a password.
 */
export function RequireAddPasswordModal() {
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const self = useSelf();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revealPassword, setRevealPassword] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // copied from `ChangePasswordScreen`.
  // @todo - factor this out. I don't forsee us needing to do this anytime soon.
  // @alternatively, delete this screen after Devconnect.
  const onChangePassword = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      await setPassword(self.email, newPassword, dispatch);

      dispatch({
        type: "set-modal",
        modal: { modalType: "none" }
      });
    } catch (e) {
      setError("Couldn't set a password - try again later");
    } finally {
      setLoading(false);
    }
  }, [loading, self.email, newPassword, dispatch]);

  return (
    <Container>
      <H2>Reinforce Your Account</H2>
      <Spacer h={24} />
      Before adding this PCD, you will need to upgrade to an
      end-to-end-encrypted Zupass. To upgrade, please choose a password. Make
      sure to remember it, otherwise you will lose access to all your PCDs.
      <Spacer h={24} />
      <BigInput value={self.email} disabled={true} />
      <Spacer h={8} />
      <NewPasswordForm
        error={error}
        setError={setError}
        passwordInputPlaceholder="New password"
        email={self.email}
        revealPassword={revealPassword}
        setRevealPassword={setRevealPassword}
        submitButtonText="Confirm"
        password={newPassword}
        confirmPassword={confirmPassword}
        setPassword={setNewPassword}
        setConfirmPassword={setConfirmPassword}
        onSuccess={onChangePassword}
      />
    </Container>
  );
}

const Container = styled.div`
  padding: 32px;
`;
