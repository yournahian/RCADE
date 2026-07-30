export class ApiService {
    static async fetchWithAuth(url: string, options: RequestInit = {}, getAccessToken: () => Promise<string | null>) {
        try {
            const tokenPromise = getAccessToken().catch(() => null);
            const timeoutPromise = new Promise<string | null>(res => setTimeout(() => res(null), 3000));
            const token = await Promise.race([tokenPromise, timeoutPromise]);
            
            const headers = new Headers(options.headers || {});
            if (token) {
                headers.set('Authorization', `Bearer ${token}`);
            }
            
            return await fetch(url, { ...options, headers });
        } catch (err: any) {
            console.warn(`[ApiService] Request to ${url} failed:`, err.message || err);
            return new Response(JSON.stringify({ error: err.message || 'Network request failed' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
}
