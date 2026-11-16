import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/superdev/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeTarget(): string {
  const raw = new URLSearchParams(window.location.search).get("from_url") || "/business-crm";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/business-crm";
}

type Mode = "login" | "forgot" | "reset";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    // Arriving from a password-reset or invite email: let the user choose a password.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || window.location.hash.includes("type=invite")) setMode("reset");
    });
    if (window.location.hash.includes("type=recovery") || window.location.hash.includes("type=invite")) setMode("reset");
    return () => data.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error("האימייל או הסיסמה שגויים.");
        window.location.href = safeTarget();
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/login` });
        if (error) throw error;
        setMessage({ tone: "ok", text: "אם הכתובת רשומה במערכת, נשלח אליה קישור לבחירת סיסמה." });
      } else {
        if (password.length < 8) throw new Error("הסיסמה צריכה להכיל לפחות 8 תווים.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        window.location.href = "/business-crm";
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "משהו השתבש. נסו שוב." });
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "login" ? "כניסה למסך הניהול" : mode === "forgot" ? "שכחתי סיסמה" : "בחירת סיסמה";

  return (
    <main dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border p-7 space-y-5">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-bold">ד"ר סיון שני – מרפאה וטרינרית</h1>
          <p className="text-slate-600">{title}</p>
        </div>
        {mode !== "reset" && (
          <div className="space-y-2">
            <Label htmlFor="email">אימייל</Label>
            <Input id="email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        )}
        {mode !== "forgot" && (
          <div className="space-y-2">
            <Label htmlFor="password">{mode === "reset" ? "סיסמה חדשה" : "סיסמה"}</Label>
            <Input id="password" type="password" dir="ltr" autoComplete={mode === "reset" ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        {message && <p role="status" className={message.tone === "error" ? "text-red-600 text-sm" : "text-green-700 text-sm"}>{message.text}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "רגע..." : mode === "login" ? "כניסה" : mode === "forgot" ? "שליחת קישור" : "שמירת סיסמה"}
        </Button>
        {mode === "login" && (
          <button type="button" className="block w-full text-sm text-slate-600 underline" onClick={() => { setMode("forgot"); setMessage(null); }}>שכחתי סיסמה</button>
        )}
        {mode === "forgot" && (
          <button type="button" className="block w-full text-sm text-slate-600 underline" onClick={() => { setMode("login"); setMessage(null); }}>חזרה לכניסה</button>
        )}
      </form>
    </main>
  );
}
