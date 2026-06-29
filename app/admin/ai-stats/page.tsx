
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function calcSummary(logs: any[]) {
  if (!logs?.length) return null;
  const KRW = 1380;
  const totalCost = logs.reduce((s, l) => s + (l.estimated_cost || 0), 0);
  const totalTokens = logs.reduce((s, l) => s + (l.input_tokens || 0) + (l.output_tokens || 0), 0);
  const cacheHits = logs.filter(l => l.cache_hit).length;
  const voiceCalls = logs.filter(l => l.voice_input).length;
  const byFeature: Record<string, { cost: number; calls: number }> = {};
  logs.forEach(l => {
    if (!byFeature[l.feature]) byFeature[l.feature] = { cost: 0, calls: 0 };
    byFeature[l.feature].cost += l.estimated_cost || 0;
    byFeature[l.feature].calls += 1;
  });
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const daysPassed = kstNow.getDate();
  const daysInMonth = new Date(kstNow.getFullYear(), kstNow.getMonth() + 1, 0).getDate();
  const estimatedMonthlyCost = daysPassed > 0 ? (totalCost / daysPassed) * daysInMonth : 0;
  return {
    totalCost: Math.round(totalCost * 1000000) / 1000000,
    totalTokens, totalCalls: logs.length,
    cacheHitRate: Math.round(cacheHits / logs.length * 100),
    voiceRate: Math.round(voiceCalls / logs.length * 100),
    byFeature,
    estimatedMonthlyCost: Math.round(estimatedMonthlyCost * 1000000) / 1000000,
    KRW,
  };
}

const ADMIN_EMAIL = "hellopazab@gmail.com";

export default function AiStatsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [monthStr, setMonthStr] = useState(
    new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
  );

  useEffect(() => { loadStats(); }, [monthStr]);

  async function loadStats() {
    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      if (user.email !== ADMIN_EMAIL) { router.push("/"); return; }

      const { data, error: dbError } = await supabase
        .from("ai_usage_logs")
        .select("id, feature, model, input_tokens, output_tokens, estimated_cost, cache_hit, voice_input, created_at")
        .gte("created_at", `${monthStr}-01`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (dbError) { setError(dbError.message); return; }
      const allLogs = data || [];
      setLogs(allLogs);
      setSummary(calcSummary(allLogs));
    } catch (e: any) {
      setError(e.message || "오류 발생");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", maxWidth:480, margin:"0 auto", padding:"20px 16px 40px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
        <button onClick={() => router.back()}
          style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:20, cursor:"pointer" }}>←</button>
        <div>
          <p style={{ fontSize:16, fontWeight:700, color:"var(--text)", margin:0 }}>🤖 AI 비용 현황</p>
          <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>PAZ AiGate 모니터링</p>
        </div>
      </div>

      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {Array.from({ length:3 }, (_, i) => {
          const d = new Date(new Date().getTime() + 9*60*60*1000);
          d.setMonth(d.getMonth() - i);
          const m = d.toISOString().slice(0, 7);
          return (
            <button key={m} onClick={() => setMonthStr(m)}
              style={{ padding:"6px 14px", borderRadius:20, fontSize:12, cursor:"pointer", border:"none",
                fontWeight: monthStr===m ? 700 : 400,
                background: monthStr===m ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                color: monthStr===m ? "#fff" : "var(--text-muted)" }}>
              {m}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign:"center" as const, padding:"40px 0", color:"var(--text-muted)" }}>
          <p>로딩 중...</p>
        </div>
      ) : error ? (
        <div style={{ textAlign:"center" as const, padding:"40px 0" }}>
          <p style={{ color:"#ef4444" }}>오류: {error}</p>
          <button onClick={loadStats} style={{ marginTop:12, padding:"8px 16px", borderRadius:10, background:"var(--surface2)", border:"none", color:"var(--text)", cursor:"pointer" }}>다시 시도</button>
        </div>
      ) : !summary ? (
        <div style={{ textAlign:"center" as const, padding:"40px 0" }}>
          <p style={{ color:"var(--text-muted)", fontSize:14 }}>아직 AI 사용 기록이 없어요</p>
          <p style={{ color:"var(--text-muted)", fontSize:12, marginTop:8 }}>PAZ에서 대화하면 기록이 쌓여요</p>
        </div>
      ) : (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
            {[
              { label:"이번달 비용", value:`$${summary.totalCost.toFixed(4)}`, sub:`≈ ${Math.round(summary.totalCost*summary.KRW).toLocaleString()}원`, color:"#ef4444" },
              { label:"월간 예상", value:`$${summary.estimatedMonthlyCost.toFixed(4)}`, sub:`≈ ${Math.round(summary.estimatedMonthlyCost*summary.KRW).toLocaleString()}원`, color:"#f59e0b" },
              { label:"총 API 호출", value:`${summary.totalCalls.toLocaleString()}회`, sub:`${summary.totalTokens.toLocaleString()} 토큰`, color:"#7c3aed" },
              { label:"음성 호출", value:`${summary.voiceRate}%`, sub:`${Math.round(summary.totalCalls*summary.voiceRate/100)}회`, color:"#10b981" },
            ].map(s => (
              <div key={s.label} style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)" }}>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 4px" }}>{s.label}</p>
                <p style={{ fontSize:18, fontWeight:800, color:s.color, margin:"0 0 2px" }}>{s.value}</p>
                <p style={{ fontSize:10, color:"var(--text-muted)", margin:0 }}>{s.sub}</p>
              </div>
            ))}
          </div>

          <div style={{ background:"var(--surface)", borderRadius:16, padding:16, marginBottom:12, border:"1px solid var(--border)" }}>
            <p style={{ fontSize:13, fontWeight:700, color:"var(--text)", margin:"0 0 12px" }}>📊 기능별 비용</p>
            {Object.entries(summary.byFeature)
              .sort(([,a]:any,[,b]:any) => b.cost - a.cost)
              .map(([feature, data]:any) => (
                <div key={feature} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
                  <div>
                    <p style={{ fontSize:11, color:"var(--text)", margin:0, fontFamily:"monospace" }}>{feature}</p>
                    <p style={{ fontSize:10, color:"var(--text-muted)", margin:0 }}>{data.calls}회</p>
                  </div>
                  <div style={{ textAlign:"right" as const }}>
                    <p style={{ fontSize:12, fontWeight:700, color:data.cost>0.001?"#ef4444":"#10b981", margin:0 }}>${data.cost.toFixed(6)}</p>
                    <p style={{ fontSize:10, color:"var(--text-muted)", margin:0 }}>≈{Math.round(data.cost*summary.KRW)}원</p>
                  </div>
                </div>
              ))}
          </div>

          <div style={{ background:"var(--surface)", borderRadius:16, padding:16, border:"1px solid var(--border)" }}>
            <p style={{ fontSize:13, fontWeight:700, color:"var(--text)", margin:"0 0 12px" }}>📋 최근 로그</p>
            {logs.slice(0,20).map((log,i) => (
              <div key={log.id} style={{ padding:"8px 0", borderBottom:i<19?"1px solid var(--border)":"none" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" as const, marginBottom:2 }}>
                      <span style={{ fontSize:10, fontFamily:"monospace", color:"#c4b5fd", background:"#7c3aed15", padding:"1px 6px", borderRadius:4 }}>{log.feature}</span>
                      {log.cache_hit && <span style={{ fontSize:10, background:"#3b82f615", color:"#3b82f6", padding:"1px 6px", borderRadius:4 }}>⚡캐시</span>}
                    </div>
                    <p style={{ fontSize:10, color:"var(--text-muted)", margin:0 }}>{log.model} · {((log.input_tokens||0)+(log.output_tokens||0)).toLocaleString()}토큰</p>
                  </div>
                  <div style={{ textAlign:"right" as const }}>
                    <p style={{ fontSize:11, fontWeight:600, color:(log.estimated_cost||0)>0.001?"#ef4444":"#6b7280", margin:"0 0 2px" }}>${(log.estimated_cost||0).toFixed(6)}</p>
                    <p style={{ fontSize:9, color:"var(--text-muted)", margin:0 }}>
                      {new Date(log.created_at).toLocaleString("ko-KR",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
