
import * as React from 'react';
import { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      let errorMessage = "Gözlənilməz bir xəta baş verdi.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error) {
          errorMessage = `Ошибка Firestore: ${parsed.error} (${parsed.operationType} @ ${parsed.path})`;
        }
      } catch (e) {
        // Not a JSON error
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 bg-surface rounded-2xl border border-dashed border-border text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 border border-red-100">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-text tracking-tight">Xəta Baş Verdi</h2>
            <p className="text-muted text-[11px] font-semibold max-w-md mx-auto leading-relaxed">
              {errorMessage}
            </p>
          </div>
          <button 
            onClick={this.handleReset}
            className="flex items-center gap-2 bg-brand text-white px-8 py-4 rounded-xl font-semibold text-[11px] hover:opacity-90 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Yenidən Yüklə
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
