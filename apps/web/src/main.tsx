import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { OrganizationProvider } from "./organizations";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root não encontrado");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OrganizationProvider>
          <App />
        </OrganizationProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
