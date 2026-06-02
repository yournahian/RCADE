'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { ReactNode } from 'react';
import { baseSepolia } from 'viem/chains';

export default function PrivyProviderWrapper({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    console.error('Missing NEXT_PUBLIC_PRIVY_APP_ID environment variable.');
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email', 'wallet', 'google', 'apple'],
        appearance: {
          theme: 'dark',
          accentColor: '#00f0ff', // Cyberpunk neon cyan
          logo: 'https://auth.privy.io/logos/privy-logo-dark.png', // We can replace with custom logo
        },
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
