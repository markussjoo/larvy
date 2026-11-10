import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lärvy – läraradministration',
  description: 'Planering, resultat och rapporter per elev'
};

export default function Layout({children}:{children:React.ReactNode}){
  return (
    <html lang="sv" data-theme="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("larvy-theme")||"dark";document.documentElement.setAttribute("data-theme",t);}catch(e){}`
          }}
        />
        <link rel="stylesheet" href="/theme.css"/>
      </head>
      <body>{children}</body>
    </html>
  );
}
