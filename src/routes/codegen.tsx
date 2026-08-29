import { createFileRoute } from "@tanstack/react-router";
import { CodeGenPage } from "@/components/export/codegen";

export const Route = createFileRoute("/codegen")({
  head: () => ({ meta: [{ title: "Code Gen — DataIQ Pro" }] }),
  component: CodeGenPage,
});
