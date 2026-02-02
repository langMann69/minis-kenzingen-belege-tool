import type { Metadata } from "next";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Belege Tool",
  description: "Minis Kenzingen – Belege & Auslagen",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body style={{ margin: 0 }}>
        <NavBar />
        <div style={{ maxWidth: 980, margin: "0 auto" }}>{children}</div>
      </body>
    </html>
  );
}
