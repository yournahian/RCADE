import { PrivyClient } from '@privy-io/server-auth';

if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET) {
    console.warn("Privy App ID or Secret is missing in environment variables.");
}

export const privy = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'dummy_id',
  process.env.PRIVY_APP_SECRET || 'dummy_secret'
);
