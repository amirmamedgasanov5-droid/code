import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter/wght.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/amiri/arabic-400.css';
import '@fontsource/amiri/arabic-700.css';
import '@fontsource/amiri-quran/arabic-400.css';
import './globals.css';

const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const title = 'Хидая — тафсир, хадисы, дуа и напоминания для сестёр';
const description =
  'Хидая (هداية) — Telegram-канал для сестёр: аяты и тафсир ас-Саади, хадисы, дуа и ежедневные напоминания на русском языке — спокойно и с источниками.';

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: title, template: '%s · Хидая' },
  description,
  applicationName: 'Хидая',
  keywords: ['Хидая', 'hidaya', 'ислам', 'Коран', 'тафсир', 'хадис', 'дуа', 'напоминания', 'Telegram', 'для сестёр'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Хидая',
    title,
    description,
    url: '/',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Хидая — هداية' }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/og.png'] },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f2ee' },
    { media: '(prefers-color-scheme: dark)', color: '#090c0b' },
  ],
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Хидая',
  alternateName: ['Hidaya', 'هداية'],
  inLanguage: 'ru',
  description,
  sameAs: ['https://t.me/hidaya_islam1'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(sessionStorage.getItem('hidaya-seen'))document.documentElement.setAttribute('data-seen','')}catch(e){}`,
          }}
        />
        <noscript>
          <style>{`.splash{display:none!important}`}</style>
        </noscript>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
