/**
 * JSX types for `@caperjs/solid`. Add "@caperjs/solid/jsx" to the "types" array
 * of your tsconfig, alongside `"jsx": "preserve"` and
 * `"jsxFactory": "CaperJSX.h"`.
 *
 * The namespace hangs off `CaperJSX` rather than the global `JSX` namespace
 * because `@types/react` is routinely in an app's program (pulled in
 * transitively) and its `declare global { namespace JSX }` shadows any global
 * one we add. `jsxFactory` names the type-lookup root instead; under
 * `jsx: "preserve"` it is *only* a type lookup — vite-plugin-solid still does
 * the real compilation, so nothing named `CaperJSX.h` is ever called.
 * (`jsxImportSource` would be the modern answer, but it only applies in
 * `react-jsx` mode.)
 *
 * Element props are deliberately loose for v1; a later release types each
 * intrinsic against its Pixi class.
 */

declare namespace CaperJSX {
  function h(type: any, props?: any, ...children: any[]): any;

  /** The v1 prop bag for every intrinsic element: anything the class accepts. */
  type ElementProps = Record<string, any> & { children?: any };

  namespace JSX {
    interface IntrinsicElements {
      container: ElementProps;
      sprite: ElementProps;
      text: ElementProps;
      graphics: ElementProps;
      flexContainer: ElementProps;
    }
    type Element = any;
    type ElementType = any;
    interface ElementChildrenAttribute {
      children: {};
    }
  }
}
