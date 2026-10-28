import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ensureSeeded, requestPersistence } from "./db";
import { installUpdateRecovery } from "./lib/appUpdate";
import { startSync } from "./lib/sync";
import "./styles.css";

installUpdateRecovery();

ensureSeeded().then(() => {
  requestPersistence();
  startSync();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
