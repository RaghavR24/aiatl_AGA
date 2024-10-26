import { SessionProvider } from "next-auth/react"
import { AppProps } from "next/app"
import { Session } from "next-auth"

function MyApp({
  Component,
  pageProps: { session, ...pageProps }
}: AppProps<{ session: Session | null }>) {
  return (
    <SessionProvider session={session}>
      <Component {...pageProps} />
    </SessionProvider>
  )
}

export default MyApp
