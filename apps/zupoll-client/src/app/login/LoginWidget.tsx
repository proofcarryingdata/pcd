import { LoginCategory, LoginConfig } from "@pcd/zupoll-shared";
import { useMemo, useState } from "react";
import { LOGIN_GROUPS } from "../../api/loginGroups";
import { LoginState, ZupollError } from "../../types";
import { LoginActionsForLoginGroup } from "./LoginActionsForLoginGroup";
import { SelectLoginGroup } from "./SelectLoginGroup";

/**
 * Lets user select event and then log in as one of the groups in
 * that event.
 */
export function LoginWidget(props: LoginWidgetProps) {
  const [selectedGroupId, setCurGroupCategory] = useState<
    LoginCategory | undefined
  >();
  const selectedGroup = useMemo(() => {
    return LOGIN_GROUPS.find((g) => g.category === selectedGroupId);
  }, [selectedGroupId]);

  return (
    <>
      {!!selectedGroup && (
        <LoginActionsForLoginGroup
          {...props}
          group={selectedGroup}
          key={selectedGroup.category}
        />
      )}

      <SelectLoginGroup
        selectedGroup={selectedGroupId}
        setSelectedGroup={setCurGroupCategory}
        groups={LOGIN_GROUPS}
      />
    </>
  );
}

/**
 * Props for {@link LoginWidget}.
 */
export interface LoginWidgetProps {
  configs: LoginConfig[];
  onLogin: (loginState: LoginState) => void;
  setError: (error?: ZupollError) => void;
  setServerLoading: (loading: boolean) => void;
  serverLoading: boolean;
}