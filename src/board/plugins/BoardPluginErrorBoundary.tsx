import { Component, type ReactNode } from 'react';

interface BoardPluginErrorBoundaryProps {
  pluginId: string;
  children: ReactNode;
  fallback?: ReactNode;
}

interface BoardPluginErrorBoundaryState {
  failed: boolean;
}

export class BoardPluginErrorBoundary extends Component<
  BoardPluginErrorBoundaryProps,
  BoardPluginErrorBoundaryState
> {
  state: BoardPluginErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): BoardPluginErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error(`[board-plugin:${this.props.pluginId}] render failed`, error);
  }

  override render() {
    if (this.state.failed) {
      return this.props.fallback ?? (
        <div role="alert" className="border border-dashed border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-500">
          Plugin unavailable
        </div>
      );
    }
    return this.props.children;
  }
}
