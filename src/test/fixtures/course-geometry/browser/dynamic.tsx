import { lazy, Suspense, type ComponentType } from 'react';
export default function dynamic<P extends object>(loader: () => Promise<ComponentType<P> | { default: ComponentType<P> }>, options?: { loading?: ComponentType }) {
  const Component = lazy(async () => { const m = await loader(); return { default: 'default' in m ? m.default : m }; });
  return function FixtureDynamic(props: P) { const Loading = options?.loading; return <Suspense fallback={Loading ? <Loading /> : null}><Component {...props} /></Suspense>; };
}
