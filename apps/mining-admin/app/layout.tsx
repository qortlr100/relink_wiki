import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = {
  title: "Relink 검수 및 발행 — 로컬 관리",
  description: "로컬 SQLite의 변경을 레코드별로 검수하고 승인 및 발행합니다.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
