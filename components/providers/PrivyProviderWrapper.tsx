'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { ReactNode } from 'react';
import { baseSepolia } from 'viem/chains';

export default function PrivyProviderWrapper({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (typeof window !== 'undefined') {
    // Catch transient Privy session network timeouts silently
    window.addEventListener('unhandledrejection', (event) => {
      const msg = String(event.reason?.message || event.reason || '');
      if (msg.includes('auth.privy.io') || msg.includes('TimeoutError')) {
        event.preventDefault();
      }
    });
  }

  if (!appId) {
    console.error('Missing NEXT_PUBLIC_PRIVY_APP_ID environment variable.');
    return <>{children}</>;
  }

  const customBaseSepolia = {
    ...baseSepolia,
    rpcUrls: {
      ...baseSepolia.rpcUrls,
      default: {
        http: [process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org']
      }
    }
  };

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email', 'wallet', 'google', 'apple'],
        appearance: {
          theme: 'dark',
          accentColor: '#00f0ff', // Cyberpunk neon cyan
          logo: 'https://auth.privy.io/logos/privy-logo-dark.png',
        },
        defaultChain: customBaseSepolia,
        supportedChains: [customBaseSepolia],
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
