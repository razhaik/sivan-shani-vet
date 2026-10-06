import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900">אופס, משהו השתבש</h1>
              <p className="text-slate-600">אירעה שגיאה בטעינת הדשבורד. זה קורה לפעמים בגלל עומס או בעיית חיבור.</p>
            </div>

            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                רענן את הדף
              </Button>
              
              <Button 
                variant="outline"
                asChild
                className="w-full border-slate-200 text-slate-600 font-bold py-6 rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
              >
                <a href="/">
                  <Home className="w-5 h-5" />
                  חזרה לדף הבית
                </a>
              </Button>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="mt-8 text-left p-4 bg-slate-900 rounded-lg overflow-auto max-h-48">
                <pre className="text-xs text-red-400 font-mono">
                  {this.state.error.toString()}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
