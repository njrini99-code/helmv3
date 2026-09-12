const params = new URLSearchParams(location.search);
const router = { push: () => {}, replace: () => {}, back: () => {}, refresh: () => {}, prefetch: () => {} };
export const useRouter = () => router;
export const useSearchParams = () => params;
export const usePathname = () => location.pathname;
export const useParams = () => ({ id: 'local-fixture' });
export const redirect = () => {};
export const notFound = () => {};
