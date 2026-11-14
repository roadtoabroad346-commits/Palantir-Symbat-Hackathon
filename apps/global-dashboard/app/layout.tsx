import "./globals.css";
export const metadata = {
  title: "Global Impact · AI Startify",
  description:
    "An offline demo observatory of ideas, schools and global growth.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
