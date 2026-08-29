import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, XCircle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
  onRemove?: () => void;
  compact?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ComponentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ComponentErrorBoundary] Caught UI component error:", error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.compact) {
        return (
          <div className="flex items-center justify-between gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-xs text-destructive">
            <div className="flex items-center gap-1.5 truncate">
              <AlertTriangle className="size-4 shrink-0" />
              <span className="truncate">
                {this.props.fallbackTitle || "Component failed to load"}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={this.resetError}
                className="p-1 hover:bg-destructive/20 rounded-md transition-colors"
                title="Retry loading component"
              >
                <RefreshCw className="size-3.5" />
              </button>
              {this.props.onRemove && (
                <button
                  type="button"
                  onClick={this.props.onRemove}
                  className="p-1 hover:bg-destructive/20 rounded-md transition-colors"
                  title="Remove component"
                >
                  <XCircle className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center p-6 text-center neo rounded-2xl border border-destructive/20 bg-card/60 gap-3 min-h-[160px]">
          <div className="size-10 rounded-full neo-inset grid place-items-center text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h4 className="font-semibold text-sm">
              {this.props.fallbackTitle || "Visual Component Error"}
            </h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {this.state.error?.message || "An unexpected error occurred in this visual element."}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={this.resetError}
              className="neo-btn px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-primary"
            >
              <RefreshCw className="size-3.5" /> Retry visual
            </button>
            {this.props.onRemove && (
              <button
                type="button"
                onClick={this.props.onRemove}
                className="neo-btn px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
