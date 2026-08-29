import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

export function Markdown({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  const lines = text.split("\n");

  let inList = false;
  let inCode = false;
  let buffer: React.ReactNode[] = [];
  let codeBuffer: string[] = [];
  let codeLanguage = "";

  const flushList = () => {
    if (inList) {
      out.push(
        <ul key={`ul-${out.length}`} className="list-disc pl-6 my-2 space-y-1">
          {buffer}
        </ul>,
      );
      buffer = [];
      inList = false;
    }
  };

  lines.forEach((ln, i) => {
    // Code Blocks
    if (ln.startsWith("```")) {
      flushList();
      if (inCode) {
        // End of code block
        inCode = false;
        out.push(
          <CodeBlock key={`code-${i}`} code={codeBuffer.join("\n")} language={codeLanguage} />,
        );
        codeBuffer = [];
      } else {
        // Start of code block
        inCode = true;
        codeLanguage = ln.replace("```", "").trim();
      }
      return;
    }

    if (inCode) {
      codeBuffer.push(ln);
      return;
    }

    // Headings
    if (/^###\s/.test(ln)) {
      flushList();
      out.push(
        <h4 key={i} className="font-bold text-md mt-4 mb-2 text-primary">
          {ln.replace(/^###\s/, "")}
        </h4>,
      );
      return;
    }
    if (/^##\s/.test(ln)) {
      flushList();
      out.push(
        <h3 key={i} className="font-bold text-lg mt-5 mb-2 text-primary">
          {ln.replace(/^##\s/, "")}
        </h3>,
      );
      return;
    }
    if (/^#\s/.test(ln)) {
      flushList();
      out.push(
        <h2 key={i} className="font-bold text-xl mt-6 mb-2 gradient-text">
          {ln.replace(/^#\s/, "")}
        </h2>,
      );
      return;
    }

    // Lists
    if (/^[-*]\s/.test(ln)) {
      inList = true;
      buffer.push(<li key={i}>{inline(ln.replace(/^[-*]\s/, ""))}</li>);
      return;
    }
    if (/^\d+\.\s/.test(ln)) {
      inList = true;
      buffer.push(<li key={i}>{inline(ln.replace(/^\d+\.\s/, ""))}</li>);
      return;
    }

    flushList();
    if (ln.trim() === "") return;
    out.push(
      <p key={i} className="my-2 leading-relaxed">
        {inline(ln)}
      </p>,
    );
  });

  flushList();
  if (inCode) {
    // Unclosed code block
    out.push(<CodeBlock key={`code-end`} code={codeBuffer.join("\n")} language={codeLanguage} />);
  }

  return <>{out}</>;
}

function inline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (/^\*\*.+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^`.+`$/.test(p))
      return (
        <code
          key={i}
          className="font-mono text-xs px-1.5 py-0.5 rounded bg-background/50 border border-border/50"
        >
          {p.slice(1, -1)}
        </code>
      );
    return <span key={i}>{p}</span>;
  });
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-border/50 bg-[#1e1e24] shadow-sm group font-sans">
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-border/20">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 mr-2">
            <div className="size-2.5 rounded-full bg-[#ff5f56]" />
            <div className="size-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="size-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-muted-foreground">
            {language || "text"}
          </span>
        </div>
        <button
          onClick={copy}
          className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-muted-foreground hover:text-white"
        >
          {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <div className="text-xs font-mono leading-relaxed bg-[#1e1e24] max-w-full overflow-x-auto">
        <SyntaxHighlighter
          language={language || "text"}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: "1rem",
            background: "transparent",
            fontSize: "0.8rem",
            lineHeight: "1.5",
          }}
          wrapLines={true}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
