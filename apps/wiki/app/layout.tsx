import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = {
  title: "Relink Wiki",
  description: "Granblue Fantasy: Relink 데이터 위키",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
