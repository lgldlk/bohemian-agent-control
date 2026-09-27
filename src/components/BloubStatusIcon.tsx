import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DotRender } from '@/bot/decor';
import { BotEngine, type BotFrame } from '@/bot/engine';
import { DEMI_VIEWBOX, RAYON } from '@/bot/repere';
import { mixHex, SHAPE_BY_ID } from '@/bot/skins';
import { motionHold, pickStatusMotion, type StatusMotion } from '@/bot/statusMotion';
import type { StateId } from '@/bot/states';
import type { BoardAgentStatus } from '@/lib/boardStatus';
import { isBoardAgentStatus } from '@/lib/boardStatus';

export type AgentVisualStatus = BoardAgentStatus;

export interface BloubStatusIconProps {
  status: string;
  size?: number;
  /** 卡片底色，眼睛镂空后要露出这个颜色 */
  paper?: string;
  className?: string;
}

interface StatusSkin {
  ink: string;
  label: string;
}

const CLOUD = SHAPE_BY_ID.get('nuage')?.radii ?? null;

const PIXEL = 4;

const STATUS_SKIN: Record<AgentVisualStatus, StatusSkin> = {
  working: { ink: '#fafafa', label: '处理中' },
  starting: { ink: '#e4e4e7', label: '启动中' },
  blocked: { ink: '#fbbf24', label: '待确认' },
  idle: { ink: '#a1a1aa', label: '空闲' },
  running: { ink: '#d4d4d8', label: '运行中' },
  pending: { ink: '#d4d4d8', label: '等待中' },
  completed: { ink: '#737373', label: '已完成' },
  deleted: { ink: '#52525b', label: '已删除' },
  error: { ink: '#fafafa', label: '出错' },
  unknown: { ink: '#52525b', label: '未知' },
};

const STATUS_ALIAS: Record<string, AgentVisualStatus> = {
  paused: 'idle',
  stopped: 'completed',
};

export function resolveVisualStatus(status: string): AgentVisualStatus {
  if (isBoardAgentStatus(status)) return status;
  return STATUS_ALIAS[status] ?? 'unknown';
}

/**
 * 画板用的 bloub 状态头像。
 * 身体默认用 bloub 的「nuage」云朵形，再按 agent 状态切动画。
 */
export default function BloubStatusIcon({
  status,
  size = 88,
  paper = '#131318',
  className = '',
}: BloubStatusIconProps) {
  const visual = resolveVisualStatus(status);
  const skin = STATUS_SKIN[visual];
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const maskId = `bloub-mask-${reactId}`;
  const engineRef = useRef<BotEngine | null>(null);
  const clockRef = useRef(0);
  const startedAtRef = useRef(0);
  const holdRef = useRef(2.4);
  const visualRef = useRef(visual);
  const motionRef = useRef<StatusMotion>(pickStatusMotion(visual));
  const desiredRef = useRef<StateId>(motionRef.current.state);
  const [frame, setFrame] = useState<BotFrame | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  visualRef.current = visual;

  useEffect(() => {
    const next = pickStatusMotion(visual);
    motionRef.current = next;
    desiredRef.current = next.state;
    holdRef.current = motionHold(next);
    const engine = engineRef.current ?? new BotEngine(RAYON, next.state, CLOUD, next.expression);
    if (!engineRef.current) {
      engineRef.current = engine;
    } else {
      engine.setShape(CLOUD, clockRef.current);
      engine.setExpression(next.expression, clockRef.current);
      engine.setState(next.state, clockRef.current);
    }
    startedAtRef.current = clockRef.current;
  }, [visual]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    }, { rootMargin: '120px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    let last = 0;

    const tick = (ms: number) => {
      const engine = engineRef.current;
      if (!engine) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0;
      last = ms;
      clockRef.current += dt;

      if (clockRef.current - startedAtRef.current >= holdRef.current) {
        const next = pickStatusMotion(visualRef.current, motionRef.current);
        motionRef.current = next;
        desiredRef.current = next.state;
        holdRef.current = motionHold(next);
        engine.setExpression(next.expression, clockRef.current);
        engine.setState(next.state, clockRef.current);
        startedAtRef.current = clockRef.current;
      }

      setFrame(engine.sample(clockRef.current));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  const viewBox = useMemo(
    () => `${-DEMI_VIEWBOX} ${-DEMI_VIEWBOX} ${DEMI_VIEWBOX * 2} ${DEMI_VIEWBOX * 2}`,
    [],
  );
  const srcSize = Math.max(16, Math.round(size / PIXEL));
  const scale = size / srcSize;

  return (
    <div
      ref={containerRef}
      className={`bloub-status-icon is-pixel ${className}`}
      title={skin.label}
      aria-label={skin.label}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'block',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {frame ? (
        <BloubSvg
          frame={frame}
          ink={skin.ink}
          paper={paper}
          size={srcSize}
          scale={scale}
          viewBox={viewBox}
          maskId={maskId}
        />
      ) : (
        <svg width={srcSize} height={srcSize} viewBox={viewBox} aria-hidden />
      )}
    </div>
  );
}

function BloubSvg({
  frame,
  ink,
  paper,
  size,
  scale,
  viewBox,
  maskId,
}: {
  frame: BotFrame;
  ink: string;
  paper: string;
  size: number;
  scale: number;
  viewBox: string;
  maskId: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      role="img"
      className="bloub-status-icon__svg"
      style={{
        display: 'block',
        transform: `scale(${scale})`,
        transformOrigin: '0 0',
        imageRendering: 'pixelated',
        shapeRendering: 'crispEdges',
      }}
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={-DEMI_VIEWBOX}
          y={-DEMI_VIEWBOX}
          width={DEMI_VIEWBOX * 2}
          height={DEMI_VIEWBOX * 2}
        >
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path
              key={i}
              d={eye.d}
              transform={eye.matrix}
              opacity={eye.alpha}
              fill="#000"
            />
          ))}
          {frame.notch ? (
            <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />
          ) : null}
        </mask>
      </defs>

      <g fill="none" stroke={ink} strokeLinecap="square">
        {frame.arcs.map((arc) => (
          <path
            key={`b${arc.id}`}
            d={arc.back}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>

      {frame.dotsBehind ? <Dots dots={frame.dots} ink={ink} paper={paper} /> : null}

      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect
            x={-DEMI_VIEWBOX}
            y={-DEMI_VIEWBOX}
            width={DEMI_VIEWBOX * 2}
            height={DEMI_VIEWBOX * 2}
            fill={ink}
          />
        </g>
      </g>

      {!frame.dotsBehind ? <Dots dots={frame.dots} ink={ink} paper={paper} /> : null}

      {frame.notif ? (
        <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={ink} />
      ) : null}

      <g fill="none" stroke={ink} strokeLinecap="square">
        {frame.arcs.map((arc) => (
          <path
            key={`f${arc.id}`}
            d={arc.front}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>
    </svg>
  );
}

function Dots({
  dots,
  ink,
  paper,
}: {
  dots: DotRender[];
  ink: string;
  paper: string;
}) {
  return (
    <g>
      {dots.map((dot, i) => {
        const fill =
          dot.color ?? (dot.depth === undefined ? ink : mixHex(paper, ink, dot.depth));
        if (dot.d) {
          return (
            <path
              key={i}
              d={dot.d}
              fill={fill}
              opacity={dot.opacity}
              transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})`}
            />
          );
        }
        return (
          <circle
            key={i}
            cx={dot.x}
            cy={dot.y}
            r={dot.r}
            fill={fill}
            opacity={dot.opacity}
          />
        );
      })}
    </g>
  );
}
