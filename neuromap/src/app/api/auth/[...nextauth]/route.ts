import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";

// Create a new PrismaClient instance
const prisma = new PrismaClient();

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      },
      issuer: 'https://accounts.google.com'
    }),
  ],
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log("SignIn callback started", { user, account, profile });
      try {
        if (account?.provider === "google") {
          console.log("Google provider detected");
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email! },
            include: { accounts: true },
          });
          console.log("Existing user query result", existingUser);

          if (existingUser) {
            // User exists, update or create the Google account
            const linkedAccount = existingUser.accounts.find(
              (acc) => acc.provider === "google"
            );

            if (linkedAccount) {
              // Update the existing Google account with new tokens
              await prisma.account.update({
                where: { id: linkedAccount.id },
                data: {
                  access_token: account.access_token,
                  expires_at: account.expires_at,
                  refresh_token: account.refresh_token,
                  id_token: account.id_token,
                  session_state: account.session_state,
                },
              });
            } else {
              // If no linked Google account, create a new one
              await prisma.account.create({
                data: {
                  userId: existingUser.id,
                  type: account.type,
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                  refresh_token: account.refresh_token,
                  access_token: account.access_token,
                  expires_at: account.expires_at,
                  token_type: account.token_type,
                  scope: account.scope,
                  id_token: account.id_token,
                  session_state: account.session_state,
                },
              });
            }
          } else {
            // If the user doesn't exist, create a new user with the Google account
            await prisma.user.create({
              data: {
                name: user.name,
                email: user.email!,
                accounts: {
                  create: {
                    type: account.type,
                    provider: account.provider,
                    providerAccountId: account.providerAccountId,
                    refresh_token: account.refresh_token,
                    access_token: account.access_token,
                    expires_at: account.expires_at,
                    token_type: account.token_type,
                    scope: account.scope,
                    id_token: account.id_token,
                    session_state: account.session_state,
                  },
                },
              },
            });
          }
          console.log("SignIn callback completed successfully");
          return true; // Allow sign in for both existing and new users
        }
        console.log("Non-Google provider detected, sign-in denied");
        return false; // Deny sign in for non-Google providers
      } catch (error) {
        console.error("Error in signIn callback:", error);
        return false;
      }
    },
    // Add session callback
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
