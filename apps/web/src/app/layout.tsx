import './globals.css';

const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('realtor-theme');if(t!=='day'&&t!=='night'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'day':'night';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='night';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
