// Type-only fixture. Compiled by `tsconfig.fixture.json` (`pnpm test:types`) to
// prove the shipped `jsx.d.ts` resolves through the "@caperjs/solid/jsx" export
// and types the intrinsic elements. Never built, never imported at runtime.

export const tree = (
  <container x={10} alpha={0.5}>
    <flexContainer gap={4} flexDirection="column">
      <text text="100 HP" anchor={0.5} />
    </flexContainer>
    <sprite asset="logo" scale={{ x: 2, y: 2 }} />
    <graphics draw={(g: any) => g.rect(0, 0, 10, 10)} />
  </container>
);
