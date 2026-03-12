import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Iron Echelon — Defense Tech Intelligence",
  description:
    "Mapping the defense technology, cybersecurity, AI, and surveillance ecosystem. Track companies, investors, government contracts, and relationships.",
  keywords: [
    "defense tech",
    "cybersecurity",
    "surveillance",
    "OSINT",
    "government contracts",
    "defense industry",
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Lexend:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
