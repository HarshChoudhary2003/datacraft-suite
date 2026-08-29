import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — Datacraft Suite" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mt-1">Last Updated: [Date]</p>
      </div>
      <div className="neo p-6 space-y-4 text-sm leading-relaxed">
        <p>
          Welcome to Datacraft Suite ("Company", "we", "our", "us"). We respect your privacy and are
          committed to protecting your personal data. This Privacy Policy explains how we collect,
          use, disclose, and safeguard your information when you visit our website and use our
          application (collectively, the "Service").
        </p>

        <h2 className="font-bold text-lg mt-6">1. Information We Collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Personal Data:</strong> While using our Service, we may ask you to provide
            certain personally identifiable information that can be used to contact or identify you.
          </li>
          <li>
            <strong>Usage Data:</strong> Information on how the Service is accessed and used.
          </li>
          <li>
            <strong>User Uploaded Data:</strong> Datasets you upload are processed locally in your
            browser and are not transmitted to or stored on our servers.
          </li>
        </ul>

        <h2 className="font-bold text-lg mt-6">2. How We Use Your Information</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>To provide and maintain our Service.</li>
          <li>To notify you about changes to our Service.</li>
          <li>To provide customer support.</li>
          <li>To detect, prevent, and address technical issues.</li>
        </ul>

        <h2 className="font-bold text-lg mt-6">3. Data Storage and Security</h2>
        <p>
          The security of your data is important to us, but remember that no method of transmission
          over the Internet, or method of electronic storage is 100% secure. While we strive to use
          commercially acceptable means to protect your Personal Data, we cannot guarantee its
          absolute security.
        </p>

        <h2 className="font-bold text-lg mt-6">4. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy, please contact us at [Support Email].
        </p>
      </div>
    </div>
  );
}
