import { useEffect } from "react";
import { initScrollFx } from "./lib/scrollFx";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Faq } from "./sections/Faq";
import { Features } from "./sections/Features";
import { FinalCta } from "./sections/FinalCta";
import { ProductDemo } from "./product-demo/ProductDemo";
import { Hero } from "./sections/Hero";
import { HowItWorks } from "./sections/HowItWorks";
import { Investment } from "./sections/Investment";
import { Measure } from "./sections/Measure";
import { Problem } from "./sections/Problem";
import { Savings } from "./sections/Savings";
import { Security } from "./sections/Security";
import { Solution } from "./sections/Solution";
import { Traceability } from "./sections/Traceability";

export function App() {
  useEffect(() => initScrollFx(), []);
  return (
    <>
      <div className="read-progress" aria-hidden="true" />
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <Header />
      <main id="conteudo">
        <Hero />
        <Problem />
        <Solution />
        <HowItWorks />
        <Features />
        <Traceability />
        <Savings />
        <ProductDemo />
        <Measure />
        <Security />
        <Investment />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
