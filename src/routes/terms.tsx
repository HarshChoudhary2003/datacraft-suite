import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service — Datacraft Suite" }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mt-1">Last Updated: [Date]</p>
      </div>
      <div className="neo p-6 space-y-4 text-sm leading-relaxed">
        <p>
          Please read these Terms of Service ("Terms", "Terms of Service") carefully before using
          the Datacraft Suite application (the "Service") operated by [Company Name] ("us", "we",
          "our").
        </p>

        <h2 className="font-bold text-lg mt-6">1. Acceptance of Terms</h2>
        <p>
          By accessing or using the Service, you agree to be bound by these Terms. If you disagree
          with any part of the terms, then you may not access the Service.
        </p>

        <h2 className="font-bold text-lg mt-6">2. User Accounts</h2>
        <p>
          When you create an account with us, you must provide us with information that is accurate,
          complete, and current at all times. Failure to do so constitutes a breach of the Terms.
        </p>

        <h2 className="font-bold text-lg mt-6">3. Acceptable Use</h2>
        <p>
          You agree not to use the Service in any way that violates any applicable national or
          international law or regulation, or to upload any data that you do not have the legal
          right to use.
        </p>

        <h2 className="font-bold text-lg mt-6">4. Intellectual Property</h2>
        <p>
          The Service and its original content, features, and functionality are and will remain the
          exclusive property of [Company Name] and its licensors.
        </p>

        <h2 className="font-bold text-lg mt-6">5. Limitation of Liability</h2>
        <p>
          In no event shall [Company Name], nor its directors, employees, partners, agents,
          suppliers, or affiliates, be liable for any indirect, incidental, special, consequential
          or punitive damages.
        </p>

        <h2 className="font-bold text-lg mt-6">6. Contact Us</h2>
        <p>If you have any questions about these Terms, please contact us at [Support Email].</p>
      </div>
    </div>
  );
}
