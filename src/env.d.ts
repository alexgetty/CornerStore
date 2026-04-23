/// <reference types="astro/client" />

// Ambient module declaration for .astro components.
// The Astro compiler handles these natively, but plain `tsc --noEmit`
// needs an explicit shape for imports like `import Foo from './Foo.astro'`.
declare module '*.astro' {
  const Component: (_props: Record<string, unknown>) => unknown;
  export default Component;
}
