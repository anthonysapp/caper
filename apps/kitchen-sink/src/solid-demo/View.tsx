import { CaperColors } from '@/theme';
import { FONT_BODY, FONT_DISPLAY } from '@/utils/Constants';
import { Application } from '@caperjs/core';
import { animated, AnimatedShow, asComponent, type ComposableScene, useTick } from '@caperjs/solid';
import type { Graphics } from 'pixi.js';
import { createMemo, createSignal, For } from 'solid-js';
import { HealthBar } from './HealthBar';
import { Orbiter } from './Orbiter';

const body = (size: number, fill: number = CaperColors.text) => ({
  fontFamily: FONT_BODY,
  fontSize: size,
  fill,
});

const display = (size: number, fill: number = CaperColors.olive) => ({
  fontFamily: FONT_DISPLAY,
  fontSize: size,
  fill,
});

const roundedRect = (w: number, h: number, fill: number, stroke: number) => (g: Graphics) =>
  g.roundRect(0, 0, w, h, 8).fill({ color: fill }).stroke({ color: stroke, width: 2 });

const dot = (radius: number, fill: number) => (g: Graphics) => g.circle(0, 0, radius).fill({ color: fill });

/**
 * Hoisted so the reference is stable. Inline `draw={dot(3, …)}` would allocate a
 * new function on every re-run of the element's effect, and the stress section
 * re-runs 2000 of those every frame.
 */
const STRESS_DOT = dot(2.5, CaperColors.olive);

/** Existing display classes, lifted into JSX with no wrapper component of their own. */
const Orbiter$ = asComponent(Orbiter);
const HealthBar$ = asComponent(HealthBar);

/** A clickable pill. `x` / `y` are optional so it can also be a flex child. */
function Button(props: { x?: number; y?: number; label: string; width?: number; onTap: () => void }) {
  const [hot, setHot] = createSignal(false);
  const width = () => props.width ?? 180;

  return (
    <container x={props.x ?? 0} y={props.y ?? 0} cursor="pointer">
      <graphics
        draw={roundedRect(width(), 44, hot() ? CaperColors.panel2 : CaperColors.panel, CaperColors.olive)}
        onPointerTap={() => props.onTap()}
        onPointerOver={() => setHot(true)}
        onPointerOut={() => setHot(false)}
      />
      {/* `eventMode="none"` matters: a hit-testable but non-interactive child sits
          on top of the graphics and would otherwise swallow the tap. Same gotcha
          as hand-written Pixi — JSX doesn't change it. */}
      <text
        text={props.label}
        style={body(16)}
        anchor={{ x: 0.5, y: 0.5 }}
        x={width() / 2}
        y={22}
        eventMode="none"
      />
    </container>
  );
}

function SectionLabel(props: { x?: number; y?: number; text: string }) {
  return <text text={props.text} style={display(14, CaperColors.textDim)} x={props.x ?? 0} y={props.y ?? 0} />;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

const STRESS_COLS = 100;
const STRESS_STEP_X = 6;
const STRESS_STEP_Y = 13;

/**
 * The scene's whole display tree. Called from `SolidJsxScene.compose()` — an
 * ordinary function call, which is why the JSX-free scene file can reach it.
 */
export function SceneView(scene: ComposableScene) {
  const app = Application.getInstance();
  const [time, setTime] = createSignal(0);

  // One signal write per frame feeds every per-frame binding below.
  useTick((ticker) => setTime((t) => t + ticker.deltaTime / 60));

  return (
    <container x={-app.size.width * 0.5 + 40} y={-app.size.height * 0.5 + 150}>
      <FlexSection />
      <SignalsSection />
      <ListSection x={430} />
      <GameObjectSection x={740} />
      <StressSection y={430} time={time} app={app} />
      <text
        text={`composed by ${scene.constructor.name}.compose()`}
        style={body(12, CaperColors.textDim)}
        x={740}
        y={-24}
      />
    </container>
  );
}

/** (a) Caper UI primitive laying out JSX children. */
function FlexSection() {
  return (
    <container>
      <SectionLabel text="<flexContainer> — laid out by yoga" />
      <container y={24}>
        <flexContainer gap={10} flexDirection="column" alignItems="flex-start">
          <text text="a caper UI primitive" style={body(15)} />
          <text text="children are JSX" style={body(15)} />
          <text text="positions come from layout" style={body(15, CaperColors.oliveHi)} />
          <Button label="a flex child" width={160} onTap={() => console.log('[solid-demo] flex child tapped')} />
        </flexContainer>
      </container>
    </container>
  );
}

/** (b) The original signal demo: a counter and a marker derived from it. */
function SignalsSection() {
  const [count, setCount] = createSignal(0);
  // The marker slides to each new stop instead of teleporting.
  const markerX = animated(() => 200 + count() * 22);

  return (
    <container y={230}>
      <SectionLabel text="signals — no diffing, no re-render" />
      <Button y={24} label="Tap to count" onTap={() => setCount(count() + 1)} />
      <text text={`count: ${count()}`} style={body(16, CaperColors.olive)} x={200} y={36} />
      <graphics draw={dot(8, CaperColors.coral)} x={markerX()} y={90} />
    </container>
  );
}

/** (b) The original insert/remove and mount/unmount demos. */
function ListSection(props: { x: number }) {
  const [items, setItems] = createSignal(['ruby', 'pearl', 'jade']);
  const [showSecret, setShowSecret] = createSignal(true);

  return (
    <container x={props.x}>
      <SectionLabel text="<For> — insert / remove" />
      <container y={24}>
        <For each={items()}>
          {(item, i) => (
            <container y={i() * 26}>
              <graphics draw={dot(5, CaperColors.olive)} x={7} y={8} />
              <text text={item} style={body(15)} x={22} />
            </container>
          )}
        </For>
        <Button
          y={items().length * 26 + 8}
          width={140}
          label="add item"
          onTap={() => setItems([...items(), `gem ${items().length + 1}`])}
        />
      </container>

      <container y={260}>
        <SectionLabel text="AnimatedShow — enter/exit" />
        <Button y={24} width={140} label="toggle" onTap={() => setShowSecret(!showSecret())} />
        {/* The wrapper is positioned here rather than inside, so the popup scales
            about its own top-left instead of the section's. */}
        <container y={80}>
          <AnimatedShow when={showSecret}>
            <container>
              <graphics draw={roundedRect(200, 72, CaperColors.panel, CaperColors.coral)} />
              <text text="popped!" style={body(16, CaperColors.coralHi)} x={16} y={14} />
              <text text="stays until the exit ends" style={body(12, CaperColors.textDim)} x={16} y={42} />
            </container>
          </AnimatedShow>
        </container>
      </container>
    </container>
  );
}

/** (c) + (d) An imperative game object and a nested `compose()` widget. */
function GameObjectSection(props: { x: number }) {
  let bar: HealthBar | undefined;

  return (
    <container x={props.x}>
      <SectionLabel text="an existing display class" />
      <text text="imperative update(), mounted by JSX" style={body(13, CaperColors.textDim)} y={20} />
      <Orbiter$ x={60} y={110} />
      <graphics draw={dot(2, CaperColors.line)} x={60} y={110} />

      <container y={200}>
        <SectionLabel text="nested compose()" />
        <HealthBar$ ref={(el: HealthBar) => (bar = el)} y={26} />
        <Button y={62} width={140} label="damage 15" onTap={() => bar?.damage(15)} />
        <Button x={150} y={62} width={110} label="heal" onTap={() => bar?.heal(25)} />
      </container>
    </container>
  );
}

/** (e) `count()` per-frame bindings, and the FPS they cost. */
function StressSection(props: { y: number; time: () => number; app: ReturnType<typeof Application.getInstance> }) {
  const [count, setCount] = createSignal(100);
  const [fps, setFps] = createSignal(0);
  const dots = createMemo(() => range(count()));

  let sinceSample = 0;
  useTick((ticker) => {
    sinceSample += ticker.deltaMS;
    if (sinceSample < 500) return;
    sinceSample = 0;
    setFps(Math.round(props.app.ticker.FPS));
  });

  return (
    <container y={props.y}>
      <SectionLabel text="stress — one binding per dot, per frame" />
      <For each={[100, 500, 2000]}>
        {(n, i) => <Button x={i() * 110} y={22} width={100} label={String(n)} onTap={() => setCount(n)} />}
      </For>
      <text text={`${count()} dots · ${fps()} fps`} style={body(16, CaperColors.oliveHi)} x={350} y={34} />

      <container y={90}>
        <For each={dots()}>
          {(i) => (
            <graphics
              draw={STRESS_DOT}
              x={(i % STRESS_COLS) * STRESS_STEP_X}
              y={Math.floor(i / STRESS_COLS) * STRESS_STEP_Y + Math.sin(props.time() * 2 + i * 0.7) * 10}
            />
          )}
        </For>
      </container>
    </container>
  );
}
