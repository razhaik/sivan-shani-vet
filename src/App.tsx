import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import BusinessCrmLayout from "./components/business-crm/BusinessCrmLayout";
import AppointmentBooking from "./pages/AppointmentBooking";
import AppointmentManagement from "./pages/AppointmentManagement";
import AccessibilityStatement from "./pages/AccessibilityStatement";
import NotFound from "./pages/NotFound";
import { BrandingBadge } from "./components/BrandingBadge";
import ErrorBoundary from "./components/ErrorBoundary";
import { shouldRedirectToCrm } from "@/lib/crmHomeScreen";
import "@/components/business-crm/bento-theme.css";

// Keep fetched data fresh for a few minutes so returning to a tab shows it
// instantly instead of reloading it; explicit refreshes still refetch.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: true,
    },
  },
});

const App = () => {
  if (typeof window !== "undefined" && shouldRedirectToCrm(window.location.pathname)) {
    window.location.replace("/business-crm");
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dashboard" element={<Navigate to="/business-crm" replace />} />
            <Route path="/business-crm/*" element={<ErrorBoundary><BusinessCrmLayout /></ErrorBoundary>} />
            <Route path="/appointments" element={<AppointmentBooking />} />
            <Route path="/manage-appointment" element={<AppointmentManagement />} />
            <Route path="/accessibility" element={<AccessibilityStatement />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <BrandingBadge />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
