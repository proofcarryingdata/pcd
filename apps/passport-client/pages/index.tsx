import { Identity } from "@semaphore-protocol/identity";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import { HomeScreen } from "../components/screens/HomeScreen";
import { LoginScreen } from "../components/screens/LoginScreen";
import { MissingScreen } from "../components/screens/MissingScreen";
import { NewPassportScreen } from "../components/screens/NewPassportScreen";
import { ProveScreen } from "../components/screens/ProveScreen/ProveScreen";
import { SaveSelfScreen } from "../components/screens/SaveSelfScreen";
import { SettingsScreen } from "../components/screens/SettingsScreen";
import { AppContainer } from "../components/shared/AppContainer";
import { Action, dispatch, DispatchContext } from "../src/dispatch";
import { loadSelf } from "../src/participant";
import { loadPCDs, ZuState } from "../src/state";

class App extends React.Component<{}, ZuState | undefined> {
  state = undefined;
  update = (diff: Pick<ZuState, keyof ZuState>) => this.setState(diff);
  dispatch = (action: Action) => dispatch(action, this.state, this.update);

  componentDidMount() {
    loadInitialState().then(this.setState.bind(this));
  }

  render() {
    const { state, dispatch: disp } = this;

    if (!state) {
      return null;
    }

    const hasStack = state.error?.stack != null;
    return (
      <DispatchContext.Provider value={[state, disp]}>
        {!hasStack && <Router />}
        {hasStack && <AppContainer />}
      </DispatchContext.Provider>
    );
  }

  // Create a React error boundary
  static getDerivedStateFromError(error: Error) {
    console.log("App caught error", error);
    const { message, stack } = error;
    let shortStack = stack.substring(0, 280);
    if (shortStack.length < stack.length) shortStack += "...";
    return {
      error: { title: "Error", message, stack: shortStack },
    } as Partial<ZuState>;
  }
}

function Router() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppContainer />}>
          <Route index element={<HomeScreen />} />
          <Route path="login" element={<LoginScreen />} />
          <Route path="new-passport" element={<NewPassportScreen />} />
          <Route path="save-self" element={<SaveSelfScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="prove" element={<ProveScreen />} />
          <Route path="*" element={<MissingScreen />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

async function loadInitialState(): Promise<ZuState> {
  const self = loadSelf();
  const pcds = await loadPCDs();
  const identityStr = window.localStorage["identity"];
  const identity = identityStr ? new Identity(identityStr) : undefined;
  return { self, pcds, identity };
}

const root = createRoot(document.querySelector("#root"));
root.render(<App />);
