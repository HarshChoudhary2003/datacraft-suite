import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/cookies")({
  head: () => ({ meta: [{ title: "Cookie Policy — Datacraft Suite" }] }),
  component: CookiesPage,
});

function CookiesPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Cookie Policy</h1>
        <p className="text-sm text-muted-foreground mt-1">Last Updated: [Date]</p>
      </div>
      <div className="neo p-6 space-y-4 text-sm leading-relaxed">
        <p>
          This Cookie Policy explains how Datacraft Suite uses cookies and similar technologies to
          recognize you when you visit our website and use our application ("Service").
        </p>

        <h2 className="font-bold text-lg mt-6">1. What are cookies?</h2>
        <p>
          Cookies are small data files that are placed on your computer or mobile device when you
          visit a website. Cookies are widely used by website owners in order to make their websites
          work, or to work more efficiently.
        </p>

        <h2 className="font-bold text-lg mt-6">2. Types of cookies we use</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Essential cookies:</strong> Strictly necessary to provide you with services
            available through our Service and to use some of its features.
          </li>
          <li>
            <strong>Performance and functionality cookies:</strong> Used to enhance the performance
            and functionality of our Service but are non-essential to their use.
          </li>
          <li>
            <strong>Analytics and customization cookies:</strong> Collect information that is used
            either in aggregate form to help us understand how our Service is being used or to help
            us customize our Service for you.
          </li>
        </ul>

        <h2 className="font-bold text-lg mt-6">3. How can I control cookies?</h2>
        <p>
          You have the right to decide whether to accept or reject cookies. You can also set or
          amend your web browser controls to accept or refuse cookies.
        </p>

        <h2 className="font-bold text-lg mt-6">4. Contact Us</h2>
        <p>
          If you have any questions about our use of cookies or other technologies, please contact
          us at [Support Email].
        </p>
      </div>
    </div>
  );
}
