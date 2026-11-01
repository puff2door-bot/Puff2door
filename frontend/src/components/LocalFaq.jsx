import React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";

// Simple FAQ list. Pair it with faqJsonLd(faqs) in the page's <Seo jsonLd> so Google sees the same questions.
const LocalFaq = ({ faqs, heading = "Frequently Asked Questions", testId = "local-faq" }) => (
  <section data-testid={testId} aria-labelledby={`${testId}-heading`}>
    <h2 id={`${testId}-heading`} className="font-heading text-2xl uppercase tracking-wide text-neutral-900 mb-4">{heading}</h2>
    <Accordion type="single" collapsible className="rounded-xl border border-neutral-200 bg-white px-5">
      {faqs.map((f, i) => (
        <AccordionItem key={f.q} value={`faq-${i}`}>
          <AccordionTrigger className="text-left font-semibold">{f.q}</AccordionTrigger>
          <AccordionContent className="text-neutral-600 leading-relaxed">{f.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  </section>
);

export default LocalFaq;
