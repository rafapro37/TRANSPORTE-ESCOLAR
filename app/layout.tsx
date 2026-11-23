import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'ELEFANTE ROSA – 3 CARROS ESCOLARES',
  description:
    'Sistema completo de gestão de transporte escolar com três instalações independentes (Carro 01, Carro 02 e Carro 03), controle financeiro, documentos privados e backup.',
  openGraph: {
    title: 'ELEFANTE ROSA – 3 CARROS ESCOLARES',
    description:
      'Gestão profissional de transporte escolar com bases isoladas por veículo, controle de mensalidades, documentos e backup completo.',
    type: 'website',
    locale: 'pt_BR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ELEFANTE ROSA – 3 CARROS ESCOLARES',
    description:
      'Gestão profissional de transporte escolar com bases isoladas por veículo.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${plusJakarta.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased selection:bg-rose-100 selection:text-rose-900" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
