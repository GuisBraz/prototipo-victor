import "@fontsource-variable/archivo/wdth.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/hero.css";
import "./styles/demo.css";
import "./styles/sections.css";
import "./styles/product-demo.css";
import "./styles/motion.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
