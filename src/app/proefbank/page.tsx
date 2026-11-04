import { notFound } from "next/navigation";
import { ToastProvider } from "@/components/ui/Toast";
import { Proefbank } from "./Proefbank";

/**
 * Enkel tijdens het ontwikkelen: het tekenvlak zonder aanmelden, met bewaren
 * in het geheugen. Bestaat niet op de gepubliceerde site.
 */
export default function Page() {
  if (process.env.NODE_ENV === "production" && process.env.PROEFBANK !== "1") notFound();
  return (
    <ToastProvider>
      <Proefbank />
    </ToastProvider>
  );
}
