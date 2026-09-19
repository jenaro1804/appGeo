import type { Metadata } from "next";
import { Cormorant_Garamond, Montserrat, Roboto_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

// Tipografías de la identidad GeoStats (README, «Identidad visual»). next/font
// las descarga al compilar y las sirve desde la propia app: en la
// presentación no hace falta internet.
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"] });
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"] });
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["600"],
  style: ["italic"],
});

export const metadata: Metadata = {
  title: "Riesgo vial ZMM",
  description: "Modelo jerárquico de accidentes reportados en la Zona Metropolitana de Monterrey (ATUS-INEGI, 2019-2024).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={cn(montserrat.variable, robotoMono.variable, cormorant.variable)}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
