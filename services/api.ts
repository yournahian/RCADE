export class ApiService {
    static async fetchWithAuth(url: string, options: RequestInit = {}, getAccessToken: () => Promise<string | null>) {
        const token = await getAccessToken();
        
        const headers = new Headers(options.headers || {});
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }
        
        return fetch(url, { ...options, headers });
    }
}
