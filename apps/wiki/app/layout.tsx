import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = {
  title: "Relink Archive — Granblue Fantasy: Relink 위키",
  description: "검수된 Granblue Fantasy: Relink 데이터를 탐색하는 공개 위키",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
