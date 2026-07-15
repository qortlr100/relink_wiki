import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = {
  title: "Relink 검수 현황 — 로컬 관리",
  description: "로컬 SQLite의 정규화, 검수, publication 현황을 읽기 전용으로 확인합니다.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
