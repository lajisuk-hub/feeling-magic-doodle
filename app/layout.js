import "./globals.css";

export const metadata = {
  title: "마음 매직 스케치북",
  description: "하고 싶은 대로 끼적이면 ✨매직이 멋진 그림과 음악으로 바꿔 줘요.",
};

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#9b5de5" };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
