import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// 匯入剛才拆分出的頁面
import HomePage from "./HomePage";
import ReportPage from "./ReportPage";
import ProcessManagePage from "./ProcessManagePage";

// =============================
//  1. 初始化 Supabase (維持原樣)
// =============================
const supabaseUrl = "你的 Supabase URL";
const supabaseKey = "你的 Supabase Anon Key";
const supabase = createClient(supabaseUrl, supabaseKey);

export const NA_SENTINEL = "__NA__";

// =============================
//  2. 基礎 UI 元件 (匯出給子頁面使用)
// =============================
export const Button: React.FC<any> = ({ variant = "default", size = "default", className = "", ...props }) => {
  const base = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50";
  const variants: any = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };
  const sizes: any = { default: "h-10 px-4 py-2", sm: "h-8 px-3 text-xs" };
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
};

export const Input: React.FC<any> = ({ className = "", ...props }) => (
  <input className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 ${className}`} {...props} />
);

export const Card: React.FC<any> = ({ className = "", ...props }) => (
  <div className={`rounded-xl border border-gray-200 bg-white shadow-sm ${className}`} {...props} />
);

// =============================
//  3. 主程式邏輯
// =============================
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<"inspect" | "report" | "manage">("inspect");
  const [processes, setProcesses] = useState<any[]>([]);
  const [selectedProcObj, setSelectedProcObj] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState("一般機種");

  // 取得製程清單
  const fetchProcesses = useCallback(async () => {
    const { data } = await supabase.from("processes").select("*").order("code");
    if (data) setProcesses(data);
  }, []);

  // 單一登入鎖邏輯 (維持原邏輯)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        const token = Math.random().toString(36).substring(2);
        localStorage.setItem("login_token", token);
        await supabase.from("profiles").upsert({ id: session.user.id, last_login_token: token });
        setUser(session.user);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) fetchProcesses();
  }, [user, fetchProcesses]);

  // 登入介面 (維持原樣)
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md p-6 space-y-4">
          <h1 className="text-2xl font-bold text-center">檢驗系統登入</h1>
          <Input placeholder="Email" value={email} onChange={(e: any) => setEmail(e.target.value)} />
          <Input type="password" placeholder="Password" value={password} onChange={(e: any) => setPassword(e.target.value)} />
          <Button className="w-full" onClick={async () => {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) alert(error.message);
          }}>登入</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 導覽列 */}
      <nav className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-blue-600">檢驗 App</span>
          <div className="flex gap-2">
            <Button variant={tab === "inspect" ? "default" : "secondary"} size="sm" onClick={() => setTab("inspect")}>新增</Button>
            <Button variant={tab === "report" ? "default" : "secondary"} size="sm" onClick={() => setTab("report")}>查詢</Button>
            <Button variant={tab === "manage" ? "default" : "secondary"} size="sm" onClick={() => setTab("manage")}>管理</Button>
            <Button variant="destructive" size="sm" onClick={() => supabase.auth.signOut()}>登出</Button>
          </div>
        </div>
      </nav>

      {/* 內容區：根據 Tab 切換顯示對應的 Page 元件 */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4">
        {tab === "inspect" && (
          <HomePage 
            supabase={supabase} 
            user={user} 
            selectedModel={selectedModel}
            selectedProcObj={selectedProcObj}
            NA_SENTINEL={NA_SENTINEL}
            Button={Button} Input={Input} Card={Card}
            // 讓 HomePage 能更新 App 的製程選單
            processes={processes}
            setSelectedProcObj={setSelectedProcObj}
          />
        )}
        
        {tab === "report" && (
          <ReportPage 
            supabase={supabase} 
            user={user} 
            processes={processes}
            NA_SENTINEL={NA_SENTINEL}
            Button={Button} Input={Input} Card={Card}
          />
        )}

        {tab === "manage" && (
          <ProcessManagePage 
            supabase={supabase} 
            processes={processes}
            fetchProcesses={fetchProcesses}
            Button={Button} Input={Input} Card={Card}
          />
        )}
      </main>
    </div>
  );
}
