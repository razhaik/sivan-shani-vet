import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { viewKey: string; children: ReactNode; }
interface State { hasError: boolean; }

class ContentBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State { return { hasError: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CRM content failed to render:", error, info);
  }

  componentDidUpdate(previousProps: Props) {
    if (previousProps.viewKey !== this.props.viewKey && this.state.hasError) this.setState({ hasError: false });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <div dir="rtl" className="flex min-h-[300px] items-center justify-center rounded-2xl border border-red-100 bg-white px-5 py-12 text-center"><div className="max-w-md"><AlertTriangle className="mx-auto h-9 w-9 text-red-500" /><h1 className="mt-4 text-lg font-extrabold text-[#1A1A3E]">המסך הזה לא נטען</h1><p className="mt-2 text-sm font-medium leading-6 text-slate-500">המסגרת והניווט נשארו זמינים. אפשר לנסות שוב או לעבור למסך אחר.</p><button type="button" onClick={() => this.setState({ hasError: false })} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-5 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><RefreshCw className="h-4 w-4" />נסי שוב</button></div></div>;
  }
}

export function CrmContentBoundary({ viewKey, children }: Props) {
  return <ContentBoundary viewKey={viewKey}>{children}</ContentBoundary>;
}
