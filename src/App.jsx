import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

// ============================================================
// SUPABASE CONFIG
// ============================================================
const SB_URL = import.meta.env.VITE_SB_URL;
const SB_KEY = import.meta.env.VITE_SB_KEY;

const sb = async (path, options = {}) => {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SB_KEY,
      "Authorization": `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

const logAkce = async (uzivatel, akce, detail = "") => {
  try {
    await sb("log_aktivit", { method: "POST", body: JSON.stringify({ uzivatel, akce, detail }), prefer: "return=minimal" });
  } catch (e) { console.warn("Log chyba:", e); }
};
const fmt = (n) => n == null || n === "" ? "" : Number(n).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = (n) => (n == null || n === "" || Number(n) === 0) ? "" : fmt(n);

function computeRow(row) {
  const nabidka = (Number(row.ps_i)||0)+(Number(row.snk_i)||0)+(Number(row.bo_i)||0)+(Number(row.ps_ii)||0)+(Number(row.bo_ii)||0)+(Number(row.poruch)||0);
  const rozdil = (Number(row.vyfakturovano)||0) - nabidka;
  return { ...row, nabidka, rozdil };
}

const COLUMNS = [
  { key: "id", label: "#", width: 40 },
  { key: "firma", label: "Firma", width: 90 },
  { key: "cislo_stavby", label: "Č. stavby", width: 120 },
  { key: "nazev_stavby", label: "Název stavby", width: 240 },
  { key: "ps_i", label: "Plán. stavby I", width: 105, type: "number" },
  { key: "snk_i", label: "SNK I", width: 95, type: "number" },
  { key: "bo_i", label: "Běžné opravy I", width: 105, type: "number" },
  { key: "ps_ii", label: "Plán. stavby II", width: 105, type: "number" },
  { key: "bo_ii", label: "Běžné opravy II", width: 105, type: "number" },
  { key: "poruch", label: "Poruchy", width: 95, type: "number" },
  { key: "nabidka", label: "Nabídka", width: 105, type: "number", computed: true },
  { key: "rozdil", label: "Rozdíl", width: 105, type: "number", computed: true },
  { key: "vyfakturovano", label: "Vyfakturováno", width: 105, type: "number" },
  { key: "ukonceni", label: "Ukončení", width: 88 },
  { key: "zrealizovano", label: "Zrealizováno", width: 105, type: "number" },
  { key: "sod", label: "SOD", width: 130 },
  { key: "ze_dne", label: "Ze dne", width: 88 },
  { key: "objednatel", label: "Objednatel", width: 110, truncate: true },
  { key: "stavbyvedouci", label: "Stavbyvedoucí", width: 110, truncate: true },
  { key: "nabidkova_cena", label: "Nab. cena", width: 105, type: "number" },
  { key: "cislo_faktury", label: "Č. faktury", width: 105 },
  { key: "castka_bez_dph", label: "Č. bez DPH", width: 105, type: "number" },
  { key: "splatna", label: "Splatná", width: 88 },
  { key: "cislo_faktury_2", label: "Č. faktury 2", width: 105, hidden: true },
  { key: "bez_dph_2", label: "Č. bez DPH 2", width: 105, type: "number", hidden: true },
  { key: "splatna_2", label: "Splatná 2", width: 88, hidden: true },
];

const inputSx = { width: "100%", padding: "9px 11px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };

function Lbl({ children }) {
  return <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 5, textTransform: "uppercase" }}>{children}</div>;
}

function SecHead({ color, children }) {
  return <div style={{ gridColumn: "1 / -1", borderLeft: `3px solid ${color}`, paddingLeft: 10, color, fontWeight: 700, fontSize: 12, letterSpacing: 0.5, marginTop: 8, marginBottom: 2 }}>{children}</div>;
}

function NativeSelect({ value, onChange, options, style, isDark = true }) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openDropdown = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const estimatedHeight = Math.min(options.length * 38, 280);
      const goUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
      setDropUp(goUp);
      setDropPos({ top: goUp ? rect.top : rect.bottom, left: rect.left, width: rect.width });
    }
    setOpen(true);
  };

  const bg = isDark ? "#1e293b" : "#fff";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)";
  const textColor = isDark ? "#e2e8f0" : "#1e293b";
  const hoverBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const dropBg = isDark ? "#1e293b" : "#fff";
  const dropShadow = isDark ? "0 8px 24px rgba(0,0,0,0.5)" : "0 8px 24px rgba(0,0,0,0.12)";
  return (
    <div ref={ref} style={{ position: "relative", ...style }}
      onMouseEnter={openDropdown}
      onMouseLeave={() => setTimeout(() => setOpen(false), 480)}
    >
      <button style={{ width: "100%", padding: "7px 30px 7px 12px", background: bg, border: `1px solid ${border}`, borderRadius: 7, color: textColor, cursor: "pointer", fontSize: 13, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
        <span style={{ marginLeft: 8, fontSize: 10, color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", flexShrink: 0 }}>▼</span>
      </button>
      {open && (
        <div style={{ position: "fixed", top: dropUp ? "auto" : dropPos.top, bottom: dropUp ? window.innerHeight - dropPos.top : "auto", left: dropPos.left, width: dropPos.width, background: dropBg, border: `1px solid ${border}`, borderRadius: 8, zIndex: 9999, boxShadow: dropShadow, overflow: "auto", maxHeight: 280 }}>
          {options.map(o => (
            <div key={o} onClick={() => { onChange(o); setOpen(false); }}
              style={{ padding: "9px 14px", color: o === value ? (isDark ? "#60a5fa" : "#2563eb") : textColor, background: o === value ? (isDark ? "rgba(37,99,235,0.15)" : "rgba(37,99,235,0.08)") : "transparent", cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}
              onMouseEnter={e => { if (o !== value) e.currentTarget.style.background = hoverBg; }}
              onMouseLeave={e => { if (o !== value) e.currentTarget.style.background = "transparent"; }}
            >{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// LOGIN
// ============================================================
function Login({ onLogin, users, onLogAction }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = () => {
    setLoading(true);
    setTimeout(() => {
      const u = users.find(u => u.email === email && u.password === pass);
      if (u) { onLogAction(u.email, "Přihlášení", ""); onLogin(u); }
      else { setErr("Nesprávný email nebo heslo"); setLoading(false); }
    }, 600);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#0f2027 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "48px 40px", width: 380, boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ display: "block", margin: "0 auto 14px" }}>
            <defs>
              <radialGradient id="lgbg" cx="50%" cy="35%" r="70%">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#0f172a" />
              </radialGradient>
            </defs>
            <circle cx="40" cy="40" r="38" fill="url(#lgbg)" stroke="#2563eb" strokeWidth="1.5" strokeOpacity="0.5" />
            <polygon points="47,10 30,42 40,42 33,68 52,36 42,36" fill="#facc15" />
            <circle cx="18" cy="24" r="2.2" fill="#facc15" opacity="0.55" />
            <circle cx="62" cy="22" r="1.8" fill="#facc15" opacity="0.45" />
            <circle cx="65" cy="56" r="2" fill="#facc15" opacity="0.4" />
            <circle cx="15" cy="58" r="1.6" fill="#facc15" opacity="0.5" />
          </svg>
          <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 800, margin: 0 }}>Stavby Znojmo</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", margin: "6px 0 0", fontSize: 15, letterSpacing: 2, textTransform: "uppercase" }}>kategorie 1 & 2</p>
        </div>

        <div style={{ marginBottom: 14 }}><Lbl>Email</Lbl><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vas@email.cz" style={inputSx} onKeyDown={e => e.key === "Enter" && handle()} /></div>
        <div style={{ marginBottom: 22 }}><Lbl>Heslo</Lbl><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" style={inputSx} onKeyDown={e => e.key === "Enter" && handle()} /></div>

        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 14, textAlign: "center" }}>{err}</div>}

        <button onClick={handle} disabled={loading} style={{ width: "100%", padding: 14, background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Přihlašuji..." : "Přihlásit se →"}
        </button>

      </div>
    </div>
  );
}

// ============================================================
// SUMMARY CARDS
// ============================================================
const FIRMA_COLORS = ["#2563eb","#ca8a04","#16a34a","#7c3aed","#e11d48","#0891b2","#d97706","#059669","#9333ea","#dc2626"];

function SummaryCards({ data, firmy, isDark, firmaColors }) {
  const sum = (firma, fields) => data.filter(r => r.firma === firma).reduce((a, r) => { fields.forEach(f => a += Number(r[f])||0); return a; }, 0);
  const sumAll = (fields) => data.reduce((a, r) => { fields.forEach(f => a += Number(r[f])||0); return a; }, 0);
  const bg = isDark ? "#0f172a" : "#f1f5f9";
  const cardBg = isDark ? "rgba(255,255,255,0.04)" : "#ffffff";
  const textMuted = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const textMain = isDark ? "#fff" : "#1e293b";
  const groupBorder = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";

  const totalI = sumAll(["ps_i","snk_i","bo_i"]);
  const totalII = sumAll(["ps_ii","bo_ii","poruch"]);
  const totalCelkem = totalI + totalII;

  return (
    <div style={{ overflowX: "auto", background: bg, padding: "10px 18px" }}>
      <div style={{ display: "flex", gap: 6, minWidth: "max-content", alignItems: "stretch" }}>

        {/* CELKEM VŠE */}
        <div style={{ background: isDark ? "rgba(249,115,22,0.1)" : "rgba(249,115,22,0.08)", border: `1px solid rgba(249,115,22,0.4)`, borderRadius: 12, padding: "10px 16px", minWidth: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "#f97316", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>CELKEM VŠE</div>
          <div style={{ color: textMain, fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{fmt(totalCelkem)}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ background: isDark ? "rgba(249,115,22,0.15)" : "rgba(249,115,22,0.12)", borderRadius: 6, padding: "4px 10px", textAlign: "center" }}>
              <div style={{ color: "#f97316", fontSize: 9, fontWeight: 700 }}>KAT. I</div>
              <div style={{ color: textMain, fontSize: 13, fontWeight: 700 }}>{fmt(totalI)}</div>
            </div>
            <div style={{ background: isDark ? "rgba(249,115,22,0.15)" : "rgba(249,115,22,0.12)", borderRadius: 6, padding: "4px 10px", textAlign: "center" }}>
              <div style={{ color: "#f97316", fontSize: 9, fontWeight: 700 }}>KAT. II</div>
              <div style={{ color: textMain, fontSize: 13, fontWeight: 700 }}>{fmt(totalII)}</div>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div style={{ width: 2, background: groupBorder, borderRadius: 2, margin: "2px 40px" }} />

        {/* Skupiny firem */}
        {firmy.map((firma) => {
          const color = firmaColors[firma] || "#2563eb";
          const katI = sum(firma, ["ps_i","snk_i","bo_i"]);
          const katII = sum(firma, ["ps_ii","bo_ii","poruch"]);
          const celkem = katI + katII;
          return (
            <div key={firma} style={{ background: isDark ? `${color}12` : `${color}10`, border: `1px solid ${color}40`, borderRadius: 12, padding: "10px 16px", minWidth: 210, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ color, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>{firma.toUpperCase()}</div>
              <div style={{ color: textMain, fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{fmt(celkem)}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ background: isDark ? `${color}18` : `${color}12`, border: `1px solid ${color}25`, borderRadius: 6, padding: "4px 12px", textAlign: "center" }}>
                  <div style={{ color, fontSize: 9, fontWeight: 700 }}>KAT. I</div>
                  <div style={{ color: textMain, fontSize: 13, fontWeight: 700 }}>{fmt(katI)}</div>
                </div>
                <div style={{ background: isDark ? `${color}18` : `${color}12`, border: `1px solid ${color}25`, borderRadius: 6, padding: "4px 12px", textAlign: "center" }}>
                  <div style={{ color, fontSize: 9, fontWeight: 700 }}>KAT. II</div>
                  <div style={{ color: textMain, fontSize: 13, fontWeight: 700 }}>{fmt(katII)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// FORM MODAL (Add + Edit)
// ============================================================
function FormField({ label, value, onChange, full, type }) {
  const [err, setErr] = useState("");

  const handleChange = (v) => {
    if (type === "number") {
      if (v !== "" && v !== "-" && isNaN(v.replace(",", "."))) {
        setErr("Zadejte číslo");
      } else {
        setErr("");
      }
    } else if (type === "date") {
      if (v !== "" && !/^\d{0,2}\.?\d{0,2}\.?\d{0,4}$/.test(v)) {
        setErr("Formát: DD.MM.RRRR");
      } else {
        setErr("");
      }
    }
    onChange(v);
  };

  return (
    <div style={full ? { gridColumn: "1 / -1" } : {}}>
      <Lbl>{label}{type === "number" && <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, marginLeft: 4 }}>123</span>}{type === "date" && <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, marginLeft: 4 }}>DD.MM.RRRR</span>}</Lbl>
      <input
        type="text"
        value={value ?? ""}
        onChange={e => handleChange(e.target.value)}
        style={{ ...inputSx, borderColor: err ? "#f87171" : "rgba(255,255,255,0.15)" }}
      />
      {err && <div style={{ color: "#f87171", fontSize: 11, marginTop: 3 }}>{err}</div>}
    </div>
  );
}

function FormSelectField({ label, value, onChange, options, allowEmpty }) {
  return (
    <div>
      <Lbl>{label}</Lbl>
      <NativeSelect value={value ?? ""} onChange={onChange} options={allowEmpty ? ["", ...options] : options} />
    </div>
  );
}

function FormModal({ title, initial, onSave, onClose, firmy, objednatele, stavbyvedouci: svList }) {
  const [form, setForm] = useState({ ...initial });
  const [saveErr, setSaveErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const computed = computeRow(form);

  const [pos, setPos] = useState({ x: window.innerWidth - Math.min(1100, window.innerWidth * 0.97) - 10, y: 10 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onDragStart = (e) => {
    dragging.current = true;
    const rect = e.currentTarget.closest("[data-modal]").getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
  };
  const onDragMove = (e) => {
    if (!dragging.current) return;
    setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
  };
  const onDragEnd = () => {
    dragging.current = false;
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
  };

  const numFields = ["ps_i","snk_i","bo_i","ps_ii","bo_ii","poruch","vyfakturovano","zrealizovano","nabidkova_cena","castka_bez_dph","bez_dph_2"];
  const dateFields = ["ukonceni","splatna","ze_dne","splatna_2"];

  const handleSave = () => {
    for (const k of numFields) {
      const v = form[k];
      if (v !== "" && v != null && isNaN(String(v).replace(",", "."))) {
        setSaveErr(`Pole "${k}" musí být číslo!`);
        return;
      }
    }
    for (const k of dateFields) {
      const v = form[k];
      if (v && !/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(v.trim())) {
        setSaveErr(`Pole "${k}" musí být datum ve formátu DD.MM.RRRR`);
        return;
      }
    }
    if (!form.nazev_stavby?.trim()) { setSaveErr("Název stavby je povinný!"); return; }
    setSaveErr("");
    onSave(computeRow(form));
  };

  const modalStyle = { position: "fixed", left: pos.x, top: pos.y, margin: 0 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: "none", fontFamily: "'Segoe UI',sans-serif" }}>
      <div data-modal style={{ ...modalStyle, pointerEvents: "all", background: "#1e293b", borderRadius: 16, width: "min(1100px, 97vw)", maxHeight: "95vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }}>

        {/* Header – táhlo pro přesun */}
        <div onMouseDown={onDragStart} style={{ padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, cursor: "grab", userSelect: "none" }}>
          <h3 style={{ color: "#fff", margin: 0, fontSize: 16, flexShrink: 0 }}>{title} <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontWeight: 400 }}>⠿ přetáhnout</span></h3>
          <input onMouseDown={e => e.stopPropagation()} value={form["nazev_stavby"] ?? ""} onChange={e => set("nazev_stavby", e.target.value)} placeholder="Název stavby..." style={{ flex: 1, padding: "7px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#fff", fontSize: 15, fontWeight: 600, outline: "none", cursor: "text" }} />
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer", flexShrink: 0 }}>✕</button>
        </div>

        {/* Body – dva sloupce */}
        <div style={{ padding: "16px 24px", overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* LEVÝ SLOUPEC */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Základní info */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ color: "#60a5fa", fontWeight: 700, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, borderLeft: "3px solid #60a5fa", paddingLeft: 8 }}>ZÁKLADNÍ INFORMACE</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <FormField label="Číslo stavby" value={form["cislo_stavby"]} onChange={v => set("cislo_stavby", v)} />
                <FormSelectField label="Firma" value={form["firma"]} onChange={v => set("firma", v)} options={firmy} />
              </div>
            </div>

            {/* Kategorie I */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ color: "#818cf8", fontWeight: 700, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, borderLeft: "3px solid #818cf8", paddingLeft: 8 }}>KATEGORIE I</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <FormField label="Plán. stavby I" value={form["ps_i"]} onChange={v => set("ps_i", v)} type="number" />
                <FormField label="SNK I" value={form["snk_i"]} onChange={v => set("snk_i", v)} type="number" />
                <FormField label="Běžné opravy I" value={form["bo_i"]} onChange={v => set("bo_i", v)} type="number" />
              </div>
            </div>

            {/* Kategorie II */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ color: "#fb923c", fontWeight: 700, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, borderLeft: "3px solid #fb923c", paddingLeft: 8 }}>KATEGORIE II</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <FormField label="Plán. stavby II" value={form["ps_ii"]} onChange={v => set("ps_ii", v)} type="number" />
                <FormField label="Běžné opravy II" value={form["bo_ii"]} onChange={v => set("bo_ii", v)} type="number" />
                <FormField label="Poruchy" value={form["poruch"]} onChange={v => set("poruch", v)} type="number" />
              </div>
            </div>

            {/* Ostatní */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ color: "#f472b6", fontWeight: 700, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, borderLeft: "3px solid #f472b6", paddingLeft: 8 }}>OSTATNÍ</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <FormField label="SOD" value={form["sod"]} onChange={v => set("sod", v)} />
                <FormField label="Ze dne" value={form["ze_dne"]} onChange={v => set("ze_dne", v)} type="date" />
                <FormSelectField label="Objednatel" value={form["objednatel"]} onChange={v => set("objednatel", v)} options={objednatele} allowEmpty />
                <FormSelectField label="Stavbyvedoucí" value={form["stavbyvedouci"]} onChange={v => set("stavbyvedouci", v)} options={svList} allowEmpty />
              </div>
            </div>
          </div>

          {/* PRAVÝ SLOUPEC */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Realizace */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ color: "#34d399", fontWeight: 700, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, borderLeft: "3px solid #34d399", paddingLeft: 8 }}>REALIZACE</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <FormField label="Vyfakturováno" value={form["vyfakturovano"]} onChange={v => set("vyfakturovano", v)} type="number" />
                <FormField label="Ukončení" value={form["ukonceni"]} onChange={v => set("ukonceni", v)} type="date" />
                <FormField label="Zrealizováno" value={form["zrealizovano"]} onChange={v => set("zrealizovano", v)} type="number" />
              </div>
              <div style={{ marginTop: 10, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 8, padding: "8px 14px", display: "flex", gap: 24 }}>
                <div><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Nabídka: </span><span style={{ color: "#60a5fa", fontWeight: 700 }}>{fmt(computed.nabidka)}</span></div>
                <div><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Rozdíl: </span><span style={{ color: computed.rozdil >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>{fmt(computed.rozdil)}</span></div>
              </div>
            </div>

            {/* Faktura 1 */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, borderLeft: "3px solid #fbbf24", paddingLeft: 8 }}>FAKTURA 1</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <FormField label="Nabídková cena" value={form["nabidkova_cena"]} onChange={v => set("nabidkova_cena", v)} type="number" />
                <FormField label="Číslo faktury" value={form["cislo_faktury"]} onChange={v => set("cislo_faktury", v)} />
                <FormField label="Částka bez DPH" value={form["castka_bez_dph"]} onChange={v => set("castka_bez_dph", v)} type="number" />
                <div />
                <FormField label="Splatná" value={form["splatna"]} onChange={v => set("splatna", v)} type="date" />
              </div>
            </div>

            {/* Faktura 2 */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(96,165,250,0.15)" }}>
              <div style={{ color: "#93c5fd", fontWeight: 700, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, borderLeft: "3px solid #93c5fd", paddingLeft: 8 }}>FAKTURA 2 <span style={{ fontWeight: 400, opacity: 0.5 }}>(nepovinné)</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div />
                <FormField label="Číslo faktury 2" value={form["cislo_faktury_2"]} onChange={v => set("cislo_faktury_2", v)} />
                <FormField label="Částka bez DPH 2" value={form["bez_dph_2"]} onChange={v => set("bez_dph_2", v)} type="number" />
                <div />
                <FormField label="Splatná 2" value={form["splatna_2"]} onChange={v => set("splatna_2", v)} type="date" />
              </div>
            </div>

          </div>
        </div>

        {saveErr && <div style={{ padding: "8px 24px", background: "rgba(239,68,68,0.15)", borderTop: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: 13 }}>⚠️ {saveErr}</div>}

        <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13 }}>Zrušit</button>
          <button onClick={handleSave} style={{ padding: "9px 22px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Uložit</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SETTINGS MODAL
// ============================================================
function ListEditor({ label, color, list, setList, nv, setNv, isDark }) {
  const add = () => { const v = nv.trim(); if (v && !list.includes(v)) { setList([...list, v]); setNv(""); } };
  const rem = (v) => setList(list.filter(x => x !== v));
  const itemBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  const itemBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const itemText = isDark ? "#e2e8f0" : "#1e293b";
  return (
    <div style={{ flex: 1 }}>
      <div style={{ color, fontWeight: 700, fontSize: 12, letterSpacing: 0.5, marginBottom: 10, borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input value={nv} onChange={e => setNv(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Přidat..." style={{ ...inputSx, flex: 1, fontSize: 12, background: isDark ? "#0f172a" : "#f8fafc", color: itemText, border: `1px solid ${itemBorder}` }} />
        <button onClick={add} style={{ padding: "8px 12px", background: `${color}33`, border: `1px solid ${color}55`, borderRadius: 7, color, cursor: "pointer", fontWeight: 700 }}>+</button>
      </div>
      {list.map(v => (
        <div key={v} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", marginBottom: 5, background: itemBg, borderRadius: 6, border: `1px solid ${itemBorder}` }}>
          <span style={{ color: itemText, fontSize: 13 }}>{v}</span>
          <button onClick={() => rem(v)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

function FirmyEditor({ list, setList, isDark, onNvChange, stavbyData, onDeleteFirmaWithStavby }) {
  const [newNazev, setNewNazev] = useState("");
  const [newBarva, setNewBarva] = useState("#3b82f6");
  const [confirmDelete, setConfirmDelete] = useState(null); // { hodnota, count }
  const [confirmStep2, setConfirmStep2] = useState(false);
  const PRESET_COLORS = ["#3b82f6","#facc15","#a855f7","#ef4444","#0ea5e9","#f97316","#10b981","#ec4899","#f59e0b","#6366f1"];
  const itemBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  const itemBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const itemText = isDark ? "#e2e8f0" : "#1e293b";

  const setNazev = (v) => { setNewNazev(v); onNvChange?.(v); };

  const add = () => {
    const v = newNazev.trim();
    if (v && !list.find(f => f.hodnota === v)) {
      setList([...list, { hodnota: v, barva: newBarva }]);
      setNewNazev(""); onNvChange?.("");
    }
  };

  const tryRem = (hodnota) => {
    const count = (stavbyData || []).filter(s => s.firma === hodnota).length;
    if (count > 0) {
      setConfirmDelete({ hodnota, count });
    } else {
      setList(list.filter(f => f.hodnota !== hodnota));
    }
  };

  const changeBarva = (hodnota, barva) => setList(list.map(f => f.hodnota === hodnota ? { ...f, barva } : f));

  return (
    <div style={{ flex: 1 }}>
      <div style={{ color: "#60a5fa", fontWeight: 700, fontSize: 12, letterSpacing: 0.5, marginBottom: 10, borderLeft: "3px solid #60a5fa", paddingLeft: 8 }}>Firmy</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
        <input value={newNazev} onChange={e => setNazev(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Název firmy..." style={{ ...inputSx, flex: 1, fontSize: 12, background: isDark ? "#0f172a" : "#f8fafc", color: itemText, border: `1px solid ${itemBorder}` }} />
        <input type="color" value={newBarva} onChange={e => setNewBarva(e.target.value)}
          style={{ width: 36, height: 36, border: "none", borderRadius: 6, cursor: "pointer", background: "none", padding: 2 }} />
        <button onClick={add} style={{ padding: "8px 12px", background: "rgba(37,99,235,0.3)", border: "1px solid rgba(37,99,235,0.5)", borderRadius: 7, color: "#60a5fa", cursor: "pointer", fontWeight: 700 }}>+</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {PRESET_COLORS.map(c => (
          <div key={c} onClick={() => setNewBarva(c)} style={{ width: 20, height: 20, borderRadius: 4, background: c, cursor: "pointer", border: newBarva === c ? "2px solid #fff" : "2px solid transparent" }} />
        ))}
      </div>
      {list.map(f => (
        <div key={f.hodnota} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", marginBottom: 5, background: itemBg, borderRadius: 6, border: `1px solid ${itemBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: f.barva || "#3b82f6" }} />
            <span style={{ color: itemText, fontSize: 13 }}>{f.hodnota}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="color" value={f.barva || "#3b82f6"} onChange={e => changeBarva(f.hodnota, e.target.value)}
              style={{ width: 28, height: 28, border: "none", borderRadius: 4, cursor: "pointer", background: "none", padding: 1 }} />
            <button onClick={() => tryRem(f.hodnota)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
        </div>
      ))}

      {/* Dialog 1 – firma má stavby */}
      {confirmDelete && !confirmStep2 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: isDark ? "#1e293b" : "#fff", borderRadius: 14, padding: "28px 32px", width: 400, border: "1px solid rgba(239,68,68,0.3)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ color: isDark ? "#f8fafc" : "#1e293b", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Firma má přiřazené stavby</div>
            <div style={{ color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)", fontSize: 13, marginBottom: 24 }}>
              Firma <strong>{confirmDelete.hodnota}</strong> má <strong>{confirmDelete.count} {confirmDelete.count === 1 ? "stavbu" : confirmDelete.count < 5 ? "stavby" : "staveb"}</strong>.<br/>Opravdu chceš tuto firmu smazat?
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: "9px 20px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 8, color: isDark ? "#fff" : "#1e293b", cursor: "pointer", fontSize: 13 }}>Zrušit</button>
              <button onClick={() => setConfirmStep2(true)} style={{ padding: "9px 20px", background: "linear-gradient(135deg,#dc2626,#b91c1c)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Ano, smazat firmu</button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog 2 – co se stavbami */}
      {confirmDelete && confirmStep2 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: isDark ? "#1e293b" : "#fff", borderRadius: 14, padding: "28px 32px", width: 420, border: "1px solid rgba(239,68,68,0.3)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏗️</div>
            <div style={{ color: isDark ? "#f8fafc" : "#1e293b", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Co se stavbami?</div>
            <div style={{ color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)", fontSize: 13, marginBottom: 24 }}>
              {confirmDelete.count} {confirmDelete.count === 1 ? "stavba zůstane" : "staveb zůstane"} v databázi bez přiřazené firmy.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => { setConfirmDelete(null); setConfirmStep2(false); }} style={{ padding: "9px 20px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 8, color: isDark ? "#fff" : "#1e293b", cursor: "pointer", fontSize: 13 }}>Zrušit</button>
              <button onClick={() => {
                setList(list.filter(f => f.hodnota !== confirmDelete.hodnota));
                setConfirmDelete(null); setConfirmStep2(false);
              }} style={{ padding: "9px 20px", background: "linear-gradient(135deg,#f97316,#ea580c)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Ponechat stavby</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsModal({ firmy, objednatele, stavbyvedouci, users, onChange, onChangeUsers, onClose, onLoadLog, isAdmin, isSuperAdmin, isDark, appVerze, appDatum, onSaveAppInfo, stavbyData }) {
  const [tab, setTab] = useState("ciselniky");
  const [f, setF] = useState([...firmy]);
  const [o, setO] = useState([...objednatele]);
  const [s, setS] = useState([...stavbyvedouci]);
  const [newF, setNewF] = useState("");
  const [newO, setNewO] = useState("");
  const [newS, setNewS] = useState("");
  const [pendingWarn, setPendingWarn] = useState(null);
  const [localLogData, setLocalLogData] = useState([]);
  const [logFilterUser, setLogFilterUser] = useState("");
  const [logFilterAkce, setLogFilterAkce] = useState("");
  const localLogFiltered = localLogData.filter(r =>
    (!logFilterUser || r.uzivatel === logFilterUser) &&
    (!logFilterAkce || r.akce === logFilterAkce)
  );

  // Users
  const [uList, setUList] = useState(users.map(u => ({ ...u })));
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [newName, setNewName] = useState("");
  const [userErr, setUserErr] = useState("");

  const add = (list, setList, val, setVal) => { const v = val.trim(); if (v && !list.includes(v)) { setList([...list, v]); setVal(""); } };

  const addUser = () => {
    setUserErr("");
    if (!newEmail.trim() || !newPass.trim() || !newName.trim()) { setUserErr("Vyplň jméno, email a heslo."); return; }
    if (uList.find(u => u.email === newEmail.trim())) { setUserErr("Uživatel s tímto emailem již existuje."); return; }
    const nextId = uList.length > 0 ? Math.max(...uList.map(u => u.id)) + 1 : 1;
    setUList([...uList, { id: nextId, email: newEmail.trim(), password: newPass.trim(), role: newRole, name: newName.trim() }]);
    setNewEmail(""); setNewPass(""); setNewName(""); setNewRole("user");
  };

  const removeUser = (id) => setUList(uList.filter(u => u.id !== id));

  const handleLoadLog = async () => {
    try {
      const res = await onLoadLog();
      setLocalLogData(Array.isArray(res) ? res : []);
    } catch(e) { setLocalLogData([]); }
  };

  useEffect(() => { if (tab === "log") handleLoadLog(); }, [tab]);

  const fmtCas = (cas) => {
    const d = new Date(cas);
    return d.toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const AKCE_COLOR = { "Přihlášení": "#60a5fa", "Přidání stavby": "#4ade80", "Editace stavby": "#fbbf24", "Smazání stavby": "#f87171", "Nastavení": "#c084fc" };

  const tabs = [
    { key: "ciselniky", label: "📋 Číselníky" },
    { key: "uzivatele", label: "👥 Uživatelé" },
    ...(isAdmin ? [{ key: "log", label: "📜 Log aktivit" }] : []),
    ...(isSuperAdmin ? [{ key: "aplikace", label: "⚙️ Aplikace" }] : []),
  ];
  const [editVerze, setEditVerze] = useState(appVerze);
  const [editDatum, setEditDatum] = useState(appDatum);

  const modalBg = isDark ? "#1e293b" : "#ffffff";
  const modalBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const modalText = isDark ? "#fff" : "#1e293b";
  const modalMuted = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  const modalDivider = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const modalCardBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ background: modalBg, borderRadius: 16, width: 780, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column", border: `1px solid ${modalBorder}`, boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>

        {/* header */}
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${modalDivider}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ color: modalText, margin: 0, fontSize: 17 }}>⚙️ Nastavení</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: modalMuted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 4, padding: "10px 24px 0", borderBottom: `1px solid ${modalDivider}` }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "8px 18px", background: tab === t.key ? "rgba(37,99,235,0.2)" : "transparent", border: "none", borderBottom: tab === t.key ? "2px solid #2563eb" : "2px solid transparent", borderRadius: "6px 6px 0 0", color: tab === t.key ? "#60a5fa" : modalMuted, cursor: "pointer", fontSize: 13, fontWeight: tab === t.key ? 700 : 400 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* body */}
        <div style={{ padding: 24, overflowY: "auto", flex: 1, background: modalBg }}>
          {tab === "ciselniky" && (
            <div style={{ display: "flex", gap: 20 }}>
              <FirmyEditor list={f} setList={setF} isDark={isDark} onNvChange={v => setNewF(v)} stavbyData={stavbyData} />
              <ListEditor label="Objednatelé" color="#34d399" list={o} setList={setO} nv={newO} setNv={setNewO} isDark={isDark} />
              <ListEditor label="Stavbyvedoucí" color="#f472b6" list={s} setList={setS} nv={newS} setNv={setNewS} isDark={isDark} />
            </div>
          )}

          {tab === "uzivatele" && (
            <div>
              {/* Přidat uživatele */}
              <div style={{ background: modalCardBg, border: `1px solid ${modalBorder}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ color: "#60a5fa", fontWeight: 700, fontSize: 12, letterSpacing: 0.5, marginBottom: 12, borderLeft: "3px solid #2563eb", paddingLeft: 8 }}>PŘIDAT UŽIVATELE</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 120px", gap: 10, marginBottom: 10 }}>
                  <div><Lbl>Jméno</Lbl><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Jan Novák" style={inputSx} /></div>
                  <div><Lbl>Email</Lbl><input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="jan@firma.cz" style={inputSx} /></div>
                  <div><Lbl>Heslo</Lbl><input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="••••••••" style={inputSx} /></div>
                  <div>
                    <Lbl>Role</Lbl>
                    <div style={{ position: "relative" }}>
                      <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ ...inputSx, appearance: "none", cursor: "pointer" }}>
                        <option value="user" style={{ background: "#1e293b" }}>User</option>
                        <option value="user_e" style={{ background: "#1e293b" }}>User Editor</option>
                        <option value="admin" style={{ background: "#1e293b" }}>Admin</option>
                      </select>
                      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", pointerEvents: "none", fontSize: 10 }}>▼</span>
                    </div>
                  </div>
                </div>
                {userErr && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>⚠ {userErr}</div>}
                <button onClick={addUser} style={{ padding: "8px 18px", background: "linear-gradient(135deg,#16a34a,#15803d)", border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>+ Přidat uživatele</button>
              </div>

              {/* Seznam uživatelů */}
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, marginBottom: 10 }}>SEZNAM UŽIVATELŮ ({uList.filter(u => !isAdmin || isSuperAdmin ? true : u.role !== "superadmin").length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {uList.filter(u => !isAdmin || isSuperAdmin ? true : u.role !== "superadmin").map(u => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: u.role === "superadmin" ? "rgba(168,85,247,0.2)" : u.role === "admin" ? "rgba(245,158,11,0.2)" : u.role === "user_e" ? "rgba(34,197,94,0.2)" : "rgba(100,116,139,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                      {u.role === "superadmin" ? "⚡" : u.role === "admin" ? "👑" : u.role === "user_e" ? "✏️" : "👤"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: modalText, fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{u.email}</div>
                    </div>
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: u.role === "superadmin" ? "rgba(168,85,247,0.2)" : u.role === "admin" ? "rgba(245,158,11,0.2)" : u.role === "user_e" ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.15)", color: u.role === "superadmin" ? "#c084fc" : u.role === "admin" ? "#fbbf24" : u.role === "user_e" ? "#4ade80" : "#94a3b8" }}>{u.role === "superadmin" ? "SUPERADMIN" : u.role === "admin" ? "ADMIN" : u.role === "user_e" ? "USER EDITOR" : "USER"}</span>
                    <button onClick={() => removeUser(u.id)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "log" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {/* Filtr uživatel */}
                  <select onChange={e => setLogFilterUser(e.target.value)} style={{ padding: "5px 10px", background: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)"}`, borderRadius: 6, color: isDark ? "#e2e8f0" : "#1e293b", fontSize: 12, cursor: "pointer" }}>
                    <option value="">Všichni uživatelé</option>
                    {[...new Set(localLogData.map(r => r.uzivatel))].filter(Boolean).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  {/* Filtr akce */}
                  <select onChange={e => setLogFilterAkce(e.target.value)} style={{ padding: "5px 10px", background: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)"}`, borderRadius: 6, color: isDark ? "#e2e8f0" : "#1e293b", fontSize: 12, cursor: "pointer" }}>
                    <option value="">Všechny akce</option>
                    {Object.keys(AKCE_COLOR).map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.5)", fontSize: 12 }}>{localLogFiltered.length} záznamů</span>
                  <button onClick={handleLoadLog} style={{ padding: "5px 12px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 6, color: isDark ? "#fff" : "#1e293b", cursor: "pointer", fontSize: 12 }}>🔄 Obnovit</button>
                  <button onClick={() => {
                    const akceColors = {
                      "Přihlášení":    { bg: "#DBEAFE", color: "#1D4ED8" },
                      "Přidání stavby":  { bg: "#DCFCE7", color: "#166534" },
                      "Editace stavby":  { bg: "#FEF9C3", color: "#854D0E" },
                      "Smazání stavby":  { bg: "#FEE2E2", color: "#991B1B" },
                      "Nastavení":     { bg: "#F3E8FF", color: "#6B21A8" },
                      "Záloha":        { bg: "#FFEDD5", color: "#9A3412" },
                    };
                    const rows = localLogFiltered.map((r, i) => {
                      const c = akceColors[r.akce] || { bg: "#F8FAFC", color: "#334155" };
                      const rowBg = i % 2 === 0 ? c.bg : "#FFFFFF";
                      return `<tr>
                        <td style="padding:6px 10px;border:1px solid #E2E8F0;background:${rowBg};color:#1E293B;white-space:nowrap">${r.cas ? new Date(r.cas).toLocaleString("cs-CZ") : ""}</td>
                        <td style="padding:6px 10px;border:1px solid #E2E8F0;background:${rowBg};color:#1E293B">${r.uzivatel || ""}</td>
                        <td style="padding:6px 10px;border:1px solid #E2E8F0;background:${c.bg};color:${c.color};font-weight:700;text-align:center">${r.akce || ""}</td>
                        <td style="padding:6px 10px;border:1px solid #E2E8F0;background:${rowBg};color:#475569">${r.detail || ""}</td>
                      </tr>`;
                    }).join("");
                    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>
                      <table><thead><tr>
                        <th style="padding:8px 10px;background:#1E3A8A;color:#fff;border:1px solid #2563EB;font-size:12px">Čas</th>
                        <th style="padding:8px 10px;background:#1E3A8A;color:#fff;border:1px solid #2563EB;font-size:12px">Uživatel</th>
                        <th style="padding:8px 10px;background:#1E3A8A;color:#fff;border:1px solid #2563EB;font-size:12px">Akce</th>
                        <th style="padding:8px 10px;background:#1E3A8A;color:#fff;border:1px solid #2563EB;font-size:12px">Detail</th>
                      </tr></thead><tbody>${rows}</tbody></table>
                    </body></html>`;
                    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `log_aktivit_${new Date().toISOString().slice(0,10)}.xls`;
                    a.click();
                  }} style={{ padding: "5px 12px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 6, color: isDark ? "#fff" : "#1e293b", cursor: "pointer", fontSize: 12 }}>📥 Export Excel</button>
                </div>
              </div>
              <div style={{ overflowY: "auto", maxHeight: 400 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: isDark ? "#1a2744" : "#e2e8f0" }}>
                      {["Čas", "Uživatel", "Akce", "Detail"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", fontWeight: 700, fontSize: 11, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {localLogFiltered.map((r, i) => (
                      <tr key={r.id} style={{ background: i % 2 === 0 ? (isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)") : "transparent" }}>
                        <td style={{ padding: "7px 12px", color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>{fmtCas(r.cas)}</td>
                        <td style={{ padding: "7px 12px", color: isDark ? "#e2e8f0" : "#1e293b" }}>{r.uzivatel}</td>
                        <td style={{ padding: "7px 12px" }}>
                          <span style={{ background: (AKCE_COLOR[r.akce] || "#94a3b8") + "22", color: AKCE_COLOR[r.akce] || "#94a3b8", border: `1px solid ${(AKCE_COLOR[r.akce] || "#94a3b8")}44`, borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{r.akce}</span>
                        </td>
                        <td style={{ padding: "7px 12px", color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", fontSize: 12 }}>{r.detail}</td>
                      </tr>
                    ))}
                    {localLogFiltered.length === 0 && (
                      <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.3)" }}>Žádné záznamy</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${modalDivider}`, display: "flex", gap: 10, justifyContent: "flex-end", background: modalBg }}>
          <button onClick={onClose} style={{ padding: "9px 18px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", border: `1px solid ${modalBorder}`, borderRadius: 8, color: modalText, cursor: "pointer", fontSize: 13 }}>Zrušit</button>
          {tab === "aplikace" && isSuperAdmin && (
            <div style={{ padding: "10px 0" }}>
              <div style={{ color: modalMuted, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 20 }}>INFORMACE O APLIKACI</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 360 }}>
                <div>
                  <div style={{ color: modalMuted, fontSize: 11, marginBottom: 6 }}>VERZE APLIKACE</div>
                  <input value={editVerze} onChange={e => setEditVerze(e.target.value)} placeholder="např. 1.0.0" style={{ width: "100%", padding: "9px 12px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", border: `1px solid ${modalBorder}`, borderRadius: 8, color: modalText, fontSize: 14, boxSizing: "border-box" }}/>
                </div>
                <div>
                  <div style={{ color: modalMuted, fontSize: 11, marginBottom: 6 }}>ROK / DATUM</div>
                  <input value={editDatum} onChange={e => setEditDatum(e.target.value)} placeholder="např. 2025" style={{ width: "100%", padding: "9px 12px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", border: `1px solid ${modalBorder}`, borderRadius: 8, color: modalText, fontSize: 14, boxSizing: "border-box" }}/>
                </div>
                <button onClick={() => { onSaveAppInfo(editVerze, editDatum); onClose(); }} style={{ padding: "10px 20px", background: "linear-gradient(135deg,#7c3aed,#6d28d9)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>💾 Uložit a zavřít</button>
                <div style={{ color: modalMuted, fontSize: 11, marginTop: 8 }}>
                  Zobrazí se ve footeru: © {editDatum} Stavby Znojmo – Martin Dočekal &amp; Claude AI | v{editVerze}
                </div>
              </div>
            </div>
          )}

          {tab !== "log" && tab !== "aplikace" && <button onClick={() => {
            // Kontrola nevyplněných polí
            const unfinished = [];
            if (tab === "ciselniky") {
              if (newF.trim()) unfinished.push("Firma");
              if (newO.trim()) unfinished.push("Objednatel");
              if (newS.trim()) unfinished.push("Stavbyvedoucí");
            }
            if (tab === "uzivatele") {
              if (newEmail.trim() || newPass.trim() || newName?.trim()) unfinished.push("Uživatel");
            }
            if (unfinished.length > 0) {
              setPendingWarn(unfinished);
            } else {
              onChange(f, o, s); onChangeUsers(uList); onClose();
            }
          }} style={{ padding: "9px 22px", background: "linear-gradient(135deg,#16a34a,#15803d)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Uložit vše</button>}
        </div>
      </div>

      {/* Varování – nevyplněná položka */}
      {pendingWarn && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1400, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
          <div style={{ background: isDark ? "#1e293b" : "#fff", borderRadius: 14, padding: "28px 32px", width: 380, border: `1px solid ${isDark ? "rgba(255,165,0,0.3)" : "rgba(255,165,0,0.4)"}`, boxShadow: "0 24px 60px rgba(0,0,0,0.5)", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ color: isDark ? "#f8fafc" : "#1e293b", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Nevyplněná položka</div>
            <div style={{ color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", fontSize: 13, marginBottom: 24 }}>
              Máš rozepsanou položku <strong>{pendingWarn.join(", ")}</strong> která nebyla přidána.<br/>
              <span style={{ fontSize: 12, marginTop: 6, display: "block" }}>Chceš ji zahodit a uložit bez ní?</span>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setPendingWarn(null)} style={{ padding: "9px 20px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 8, color: isDark ? "#fff" : "#1e293b", cursor: "pointer", fontSize: 13 }}>← Zpět doplnit</button>
              <button onClick={() => { setPendingWarn(null); onChange(f, o, s); onChangeUsers(uList); onClose(); }} style={{ padding: "9px 20px", background: "linear-gradient(135deg,#dc2626,#b91c1c)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Zahodit a uložit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [data, setData] = useState([]);
  const [firmy, setFirmy] = useState([]);
  const [objednatele, setObjednatele] = useState([]);
  const [stavbyvedouci, setStavbyvedouci] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [filterFirma, setFilterFirma] = useState("Všechny firmy");
  const [filterText, setFilterText] = useState("");
  const [filterObjed, setFilterObjed] = useState("Všichni objednatelé");
  const [filterSV, setFilterSV] = useState("Všichni stavbyvedoucí");
  const [editRow, setEditRow] = useState(null);
  const [adding, setAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  // ── inline editing odstraněno – editace přes tlačítko ✏️
  const [showExport, setShowExport] = useState(false);
  const [confirmExport, setConfirmExport] = useState(null); // { type, label }

  const doExportXLSColor = () => {
    const firmaColorMap = Object.fromEntries(firmy.map(f => [f.hodnota, f.barva || "#3b82f6"]));
    const hexToRgb = hex => { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : "59,130,246"; };
    const cols = COLUMNS.filter(c => c.key !== "id");
    const headers = cols.map(c => `<th style="padding:7px 10px;background:#1E3A8A;color:#fff;border:1px solid #2563EB;white-space:nowrap;font-size:11px">${c.label}</th>`).join("");
    const rows = filtered.map((row, i) => {
      const hex = firmaColorMap[row.firma] || "#3b82f6";
      const rgb = hexToRgb(hex);
      const bg = i % 2 === 0 ? `rgba(${rgb},0.18)` : `rgba(${rgb},0.07)`;
      const cells = cols.map(c => {
        const v = row[c.key] ?? "";
        const isNum = c.type === "number" && v !== "" && Number(v) !== 0;
        const display = isNum ? Number(v).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v;
        const color = c.key === "rozdil" ? (Number(v) >= 0 ? "#166534" : "#991b1b") : "#1e293b";
        const align = c.type === "number" ? "right" : ["cislo_stavby","ukonceni","sod","ze_dne","cislo_faktury","splatna"].includes(c.key) ? "center" : "left";
        // Sloupec firma – zvýrazni barvou firmy
        const cellBg = c.key === "firma" ? hex : bg;
        const cellColor = c.key === "firma" ? "#fff" : color;
        const cellWeight = c.key === "firma" ? "700" : "400";
        return `<td style="padding:5px 10px;border:1px solid #E2E8F0;background:${cellBg};color:${cellColor};white-space:nowrap;text-align:${align};font-size:10px;font-weight:${cellWeight}">${display}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>
      <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
    const ts = new Date().toISOString().slice(0,16).replace("T","_").replace(":","-");
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stavby_znojmo_${ts}.xls`;
    a.click();
  };
  const [logData, setLogData] = useState([]);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("theme") || "dark"; } catch { return "dark"; }
  });
  const [exportPreview, setExportPreview] = useState(null);

  const isDarkComputed = (t) => t === "dark" || (t === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const loadLog = useCallback(async () => {
    try {
      const res = await sb("log_aktivit?order=cas.desc&limit=1000");
      setLogData(res);
      return res;
    } catch (e) { console.warn("Log load error:", e); return []; }
  }, []);

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isSuperAdmin = user?.role === "superadmin";
  const isEditor = user?.role === "user_e" || isAdmin;

  // ── Šířky sloupců (jen superadmin) ─────────────────────────
  const [colWidths, setColWidths] = useState({});
  const [appVerze, setAppVerze] = useState("1.0");
  const [appDatum, setAppDatum] = useState("2025");

  useEffect(() => {
    sb("nastaveni?klic=eq.app_info").then(res => {
      if (res && res[0]) {
        try {
          const info = JSON.parse(res[0].hodnota);
          if (info.verze) setAppVerze(info.verze);
          if (info.datum) setAppDatum(info.datum);
        } catch {}
      }
    }).catch(() => {});
  }, []);

  const saveAppInfo = async (verze, datum) => {
    try {
      await sb("nastaveni", { method: "POST", body: JSON.stringify({ klic: "app_info", hodnota: JSON.stringify({ verze, datum }) }), prefer: "resolution=merge-duplicates,return=minimal" });
      setAppVerze(verze);
      setAppDatum(datum);
    } catch {}
  };
  const dragInfo = useRef(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    sb("nastaveni?klic=eq.col_widths").then(res => {
      if (res && res[0]) {
        try { setColWidths(JSON.parse(res[0].hodnota)); } catch {}
      }
    }).catch(() => {});
  }, [isSuperAdmin]);

  const saveColWidths = async (widths) => {
    try {
      await sb("nastaveni", { method: "POST", body: JSON.stringify({ klic: "col_widths", hodnota: JSON.stringify(widths) }), prefer: "resolution=merge-duplicates,return=minimal" });
    } catch {}
  };

  const [editingColWidth, setEditingColWidth] = useState(null);

  const startDrag = (e, colKey, currentWidth) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = currentWidth;
    let lastWidth = startWidth;
    const onMove = (ev) => {
      ev.preventDefault();
      const diff = ev.clientX - startX;
      lastWidth = Math.max(40, startWidth + diff);
      setColWidths(prev => ({ ...prev, [colKey]: lastWidth }));
    };
    const onUp = (ev) => {
      ev.preventDefault();
      saveColWidths({ ...colWidths, [colKey]: lastWidth });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const getColWidth = (col) => colWidths[col.key] ?? col.width;

  // ── Načtení dat z Supabase ─────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    try {
      const [stavbyRes, ciselnikyRes, uzivRes] = await Promise.all([
        sb("stavby?order=id"),
        sb("ciselniky?order=poradi"),
        sb("uzivatele?order=id"),
      ]);
      setData(stavbyRes.map(computeRow));
      setFirmy(ciselnikyRes.filter(r => r.typ === "firma").map(r => ({ hodnota: r.hodnota, barva: r.barva || "" })));
      setObjednatele(ciselnikyRes.filter(r => r.typ === "objednatel").map(r => r.hodnota));
      setStavbyvedouci(ciselnikyRes.filter(r => r.typ === "stavbyvedouci").map(r => r.hodnota));
      setUsers(uzivRes.map(u => ({ id: u.id, email: u.email, password: u.heslo, role: u.role, name: u.jmeno })));
    } catch (e) {
      setDbError("Chyba připojení k databázi: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Upozornění na blížící se termíny ──────────────────────
  const [deadlineWarnings, setDeadlineWarnings] = useState([]);
  const [showDeadlines, setShowDeadlines] = useState(false);
  const [showOrphanWarning, setShowOrphanWarning] = useState(false);

  const pracovniDny = (from, to) => {
    let count = 0;
    const d = new Date(from);
    d.setHours(0,0,0,0);
    const end = new Date(to);
    end.setHours(0,0,0,0);
    while (d < end) {
      d.setDate(d.getDate() + 1);
      const day = d.getDay();
      if (day !== 0 && day !== 6) count++;
    }
    return count;
  };

  const parseDatum = (s) => {
    if (!s) return null;
    const parts = s.trim().split(".");
    if (parts.length !== 3) return null;
    const d = new Date(`${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`);
    return isNaN(d) ? null : d;
  };

  useEffect(() => {
    if (!data.length) return;
    const dnes = new Date();
    dnes.setHours(0,0,0,0);
    const warnings = data
      .filter(r => r.ukonceni)
      .map(r => {
        const datum = parseDatum(r.ukonceni);
        if (!datum || datum < dnes) return null;
        const dni = pracovniDny(dnes, datum);
        if (dni > 30) return null;
        return { ...r, dniDo: dni, datumUkonceni: datum };
      })
      .filter(Boolean)
      .sort((a, b) => a.dniDo - b.dniDo);
    setDeadlineWarnings(warnings);
  }, [data]);

  const shownDeadlineOnce = useRef(false);
  useEffect(() => {
    if (!shownDeadlineOnce.current && deadlineWarnings.length > 0) {
      shownDeadlineOnce.current = true;
      setShowDeadlines(true);
    }
  }, [deadlineWarnings]);

  const shownOrphanOnce = useRef(false);
  useEffect(() => {
    if (!shownOrphanOnce.current && data.length > 0 && firmy.length > 0 && user) {
      const firmyNames = firmy.map(f => f.hodnota);
      const orphans = data.filter(s => s.firma && !firmyNames.includes(s.firma));
      if (orphans.length > 0) {
        shownOrphanOnce.current = true;
        setShowOrphanWarning(true);
      }
    }
  }, [data, firmy, user]);

  useEffect(() => {
    const dark = isDarkComputed(theme);
    document.body.style.background = dark ? "#0f172a" : "#f1f5f9";
    document.body.style.color = dark ? "#e2e8f0" : "#1e293b";
  }, [theme]);

  // ── CRUD stavby ────────────────────────────────────────────
  const handleSave = async (updated) => {
    const { id, nabidka, rozdil, ...fields } = updated;
    const numFields = ["ps_i","snk_i","bo_i","ps_ii","bo_ii","poruch","vyfakturovano","zrealizovano","nabidkova_cena","castka_bez_dph","bez_dph_2"];
    numFields.forEach(k => { if (fields[k] === "" || fields[k] == null) fields[k] = 0; else fields[k] = Number(fields[k]) || 0; });
    try {
      await sb(`stavby?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(fields) });
      await logAkce(user?.email, "Editace stavby", `ID: ${id}, ${fields.nazev_stavby}`);
      await loadAll();
    } catch (e) { alert("Chyba uložení: " + e.message); }
    setEditRow(null);
  };

  const handleAdd = async (newRow) => {
    const { id, nabidka, rozdil, ...fields } = newRow;
    const numFields = ["ps_i","snk_i","bo_i","ps_ii","bo_ii","poruch","vyfakturovano","zrealizovano","nabidkova_cena","castka_bez_dph","bez_dph_2"];
    numFields.forEach(k => { if (fields[k] === "" || fields[k] == null) fields[k] = 0; else fields[k] = Number(fields[k]) || 0; });
    try {
      await sb("stavby", { method: "POST", body: JSON.stringify(fields) });
      await logAkce(user?.email, "Přidání stavby", fields.nazev_stavby);
      await loadAll();
    } catch (e) { alert("Chyba přidání: " + e.message); }
    setAdding(false);
  };

  const handleDelete = async (id) => {
    const row = data.find(r => r.id === id);
    try {
      await sb(`stavby?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
      await logAkce(user?.email, "Smazání stavby", `ID: ${id}, ${row?.nazev_stavby || ""}`);
      await loadAll();
    } catch (e) { alert("Chyba mazání: " + e.message); }
    setDeleteConfirm(null);
  };

  // ── CRUD číselníky ─────────────────────────────────────────
  const saveSettings = async (nFirmy, nObjed, nSv) => {
    try {
      await sb("ciselniky?id=gt.0", { method: "DELETE", prefer: "return=minimal" });
      const items = [
        ...nFirmy.map((f, i) => ({ typ: "firma", hodnota: f.hodnota, barva: f.barva || "", poradi: i })),
        ...nObjed.map((h, i) => ({ typ: "objednatel", hodnota: h, barva: "", poradi: i })),
        ...nSv.map((h, i) => ({ typ: "stavbyvedouci", hodnota: h, barva: "", poradi: i })),
      ];
      await sb("ciselniky", { method: "POST", body: JSON.stringify(items) });
      await loadAll();
    } catch (e) { alert("Chyba uložení číselníků: " + e.message); }
  };

  // ── CRUD uživatelé ─────────────────────────────────────────
  const saveUsers = async (uList) => {
    try {
      await sb("uzivatele?id=gt.0", { method: "DELETE", prefer: "return=minimal" });
      const items = uList.map(u => ({ jmeno: u.name, email: u.email, heslo: u.password, role: u.role }));
      await sb("uzivatele", { method: "POST", body: JSON.stringify(items) });
      await loadAll();
    } catch (e) { alert("Chyba uložení uživatelů: " + e.message); }
  };

  const filtered = useMemo(() => data.filter(r => {
    if (filterFirma !== "Všechny firmy" && r.firma !== filterFirma) return false;
    if (filterText && !r.nazev_stavby?.toLowerCase().includes(filterText.toLowerCase()) && !r.cislo_stavby?.toLowerCase().includes(filterText.toLowerCase())) return false;
    if (filterObjed !== "Všichni objednatelé" && filterObjed && r.objednatel !== filterObjed) return false;
    if (filterSV !== "Všichni stavbyvedoucí" && filterSV && r.stavbyvedouci !== filterSV) return false;
    return true;
  }), [data, filterFirma, filterText, filterObjed, filterSV]);

  const [tableHeight, setTableHeight] = useState(500);

  const headerRef = useRef(null);
  const cardsRef = useRef(null);
  const filtersRef = useRef(null);

  const [PAGE_SIZE, setPageSize] = useState(10);
  useEffect(() => {
    const calc = () => {
      const rowH = 36;
      const theadH = 36;
      const paginationH = 44;
      const headerH = headerRef.current?.offsetHeight || 52;
      const cardsH = cardsRef.current?.offsetHeight || 105;
      const filtersH = filtersRef.current?.offsetHeight || 52;
      const reserved = headerH + cardsH + filtersH + theadH + paginationH + 4;
      const rows = Math.max(5, Math.floor((window.innerHeight - reserved) / rowH));
      setPageSize(rows);
      setTableHeight(window.innerHeight - headerH - cardsH - filtersH - paginationH - 4);
    };
    const timer = setTimeout(calc, 200);
    const ro = new ResizeObserver(calc);
    if (headerRef.current) ro.observe(headerRef.current);
    if (cardsRef.current) ro.observe(cardsRef.current);
    if (filtersRef.current) ro.observe(filtersRef.current);
    window.addEventListener("resize", calc);
    return () => { clearTimeout(timer); ro.disconnect(); window.removeEventListener("resize", calc); };
  }, []);
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [filterFirma, filterText, filterObjed, filterSV]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);



  const exportCSV = () => { setConfirmExport({ type: "csv", label: "CSV (.csv)" }); setShowExport(false); };
  const exportXLS = () => { setConfirmExport({ type: "xls", label: "Excel (.xlsx)" }); setShowExport(false); };
  const exportPDF = () => { setConfirmExport({ type: "pdf", label: "PDF tisk" }); setShowExport(false); };
  const exportXLSColor = () => { setConfirmExport({ type: "xls-color", label: "Barevný Excel (.xls)" }); setShowExport(false); };

  const exportLog = async () => {
    setShowExport(false);
    // Načti celý log z databáze
    try {
      const res = await sb("log_aktivit?order=cas.desc&limit=10000");
      const rows = res || [];
      const actionColors = { "Přihlášení": "#dbeafe", "Přidání stavby": "#dcfce7", "Editace stavby": "#fef9c3", "Smazání stavby": "#fee2e2", "Nastavení": "#f3e8ff", "Záloha": "#ffedd5" };
      const headers = `<tr><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB">Datum a čas</th><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB">Uživatel</th><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB">Akce</th><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB">Detail</th></tr>`;
      const dataRows = rows.map((r, i) => {
        const bg = actionColors[r.akce] || (i % 2 === 0 ? "#f8fafc" : "#fff");
        const cas = r.cas ? new Date(r.cas).toLocaleString("cs-CZ") : "";
        return `<tr><td style="padding:5px 10px;border:1px solid #E2E8F0;background:${bg};font-size:10px">${cas}</td><td style="padding:5px 10px;border:1px solid #E2E8F0;background:${bg};font-size:10px">${r.uzivatel||""}</td><td style="padding:5px 10px;border:1px solid #E2E8F0;background:${bg};font-size:10px;font-weight:600">${r.akce||""}</td><td style="padding:5px 10px;border:1px solid #E2E8F0;background:${bg};font-size:10px">${r.detail||""}</td></tr>`;
      }).join("");
      const ts = new Date().toISOString().slice(0,16).replace("T","_").replace(":","-");
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body><table>${headers}${dataRows}</table></body></html>`;
      const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `log_aktivit_${ts}.xls`; a.click();
    } catch(e) { alert("Chyba exportu logu: " + e.message); }
  };

  const zalohaExcel = () => {
    const headers = COLUMNS.filter(c => !c.computed && c.key !== "id").map(c => c.label);
    const rows = data.map(row => COLUMNS.filter(c => !c.computed && c.key !== "id").map(c => row[c.key] ?? ""));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, "Záloha");
    const datum = new Date().toISOString().slice(0,16).replace("T","_").replace(":","-");
    XLSX.writeFile(wb, `zaloha_stavby_${datum}.xlsx`);
    logAkce(user?.email, "Záloha", `${data.length} záznamů`);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, border: "3px solid rgba(37,99,235,0.3)", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Načítám data...</div>
      </div>
    </div>
  );

  if (dbError) return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ background: "#1e293b", borderRadius: 16, padding: 32, maxWidth: 480, textAlign: "center", border: "1px solid rgba(239,68,68,0.3)" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <h3 style={{ color: "#f87171", margin: "0 0 8px" }}>Chyba připojení</h3>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "0 0 20px" }}>{dbError}</p>
        <button onClick={loadAll} style={{ padding: "10px 24px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontWeight: 600 }}>Zkusit znovu</button>
      </div>
    </div>
  );

  if (!user) return <Login onLogin={setUser} users={users} onLogAction={logAkce} />;

  const isDark = isDarkComputed(theme);

  const changeTheme = (t) => {
    setTheme(t);
    try { localStorage.setItem("theme", t); } catch {}
  };

  const T = isDark ? {
    appBg: "#0f172a", headerBg: "rgba(255,255,255,0.03)", headerBorder: "rgba(255,255,255,0.08)",
    cardBg: "rgba(255,255,255,0.04)", cardBorder: "rgba(255,255,255,0.08)",
    theadBg: "#1a2744", cellBorder: "rgba(255,255,255,0.07)", filterBg: "rgba(255,255,255,0.02)",
    text: "#e2e8f0", textMuted: "rgba(255,255,255,0.45)", textFaint: "rgba(255,255,255,0.25)",
    inputBg: "#0f172a", inputBorder: "rgba(255,255,255,0.15)", modalBg: "#1e293b",
    dropdownBg: "#1e293b", hoverBg: "rgba(255,255,255,0.07)", numColor: "#93c5fd",
  } : {
    appBg: "#f1f5f9", headerBg: "#ffffff", headerBorder: "rgba(0,0,0,0.08)",
    cardBg: "#ffffff", cardBorder: "rgba(0,0,0,0.08)",
    theadBg: "#dde3ed", cellBorder: "rgba(0,0,0,0.07)", filterBg: "#f8fafc",
    text: "#1e293b", textMuted: "rgba(0,0,0,0.5)", textFaint: "rgba(0,0,0,0.3)",
    inputBg: "#ffffff", inputBorder: "rgba(0,0,0,0.2)", modalBg: "#ffffff",
    dropdownBg: "#ffffff", hoverBg: "rgba(0,0,0,0.04)", numColor: "#2563eb",
  };

  const nextId = data.length > 0 ? Math.max(...data.map(r => r.id)) + 1 : 1;
  const emptyRow = { id: nextId, firma: firmy[0]?.hodnota||"", ps_i: 0, snk_i: 0, bo_i: 0, ps_ii: 0, bo_ii: 0, poruch: 0, cislo_stavby: "", nazev_stavby: "", vyfakturovano: 0, ukonceni: "", zrealizovano: "", sod: "", ze_dne: "", objednatel: "", stavbyvedouci: "", nabidkova_cena: 0, cislo_faktury: "", castka_bez_dph: 0, splatna: "", cislo_faktury_2: "", bez_dph_2: 0, splatna_2: "" };

  const FIRMA_COLOR_FALLBACK = [
    "#3b82f6","#facc15","#a855f7","#ef4444","#0ea5e9","#f97316","#10b981","#ec4899",
  ];

  const hexToRgba = (hex, alpha) => {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  // Mixes hex color with background to get visible but subtle row color
  const hexToRowBg = (hex) => {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const br = isDark ? 15 : 241, bg2 = isDark ? 23 : 245, bb = isDark ? 42 : 249;
    const mix = isDark ? 0.18 : 0.15;
    const mr = Math.round(r * mix + br * (1 - mix));
    const mg = Math.round(g * mix + bg2 * (1 - mix));
    const mb = Math.round(b * mix + bb * (1 - mix));
    return `rgb(${mr},${mg},${mb})`;
  };

  const getFirmaColor = (firmaName) => {
    const firmaObj = firmy.find(f => f.hodnota === firmaName);
    const hex = (firmaObj?.barva && firmaObj.barva !== "") ? firmaObj.barva
      : FIRMA_COLOR_FALLBACK[firmy.findIndex(f => f.hodnota === firmaName) % FIRMA_COLOR_FALLBACK.length] || "#3b82f6";
    return {
      bg: hexToRowBg(hex),
      badge: hexToRgba(hex, 0.25),
      badgeBorder: hexToRgba(hex, 0.6),
      text: hex,
    };
  };

  const firmaBadge = (firma) => {
    const c = getFirmaColor(firma);
    return { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: c.badge, color: c.text, border: `1px solid ${c.badgeBorder}` };
  };

  const rowBg = (firma) => getFirmaColor(firma).bg;

  return (
    <div style={{ height: "100vh", maxHeight: "100vh", background: T.appBg, fontFamily: "'Segoe UI',Tahoma,sans-serif", color: T.text, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} ${!isDark ? "table td:not(.colored-cell) { color: #1e293b; } table td:not(.colored-cell) input { color: #1e293b; } table td:not(.colored-cell) select { color: #1e293b; }" : ""}`}</style>

      {/* HEADER */}
      <div ref={headerRef} style={{ background: T.headerBg, borderBottom: `1px solid ${T.headerBorder}`, padding: "11px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="46" height="46" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="38" fill="#1e3a8a" />
            <polygon points="47,10 30,42 40,42 33,68 52,36 42,36" fill="#facc15" />
          </svg>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>Stavby Znojmo</div>
            <div style={{ color: T.textMuted, fontSize: 16, textAlign: "center", letterSpacing: 1 }}>kategorie 1 & 2</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {deadlineWarnings.length > 0 && <button onClick={() => setShowDeadlines(true)} style={{ padding: "5px 12px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 7, color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>⚠️ Termíny ({deadlineWarnings.length})</button>}
          {(() => { const firmyNames = firmy.map(f => f.hodnota); const count = data.filter(s => s.firma && !firmyNames.includes(s.firma)).length; return count > 0 ? <button onClick={() => setShowOrphanWarning(true)} style={{ padding: "5px 12px", background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 7, color: "#fbbf24", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🏚️ Bez firmy ({count})</button> : null; })()}
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80" }} />
          <span style={{ color: T.text, fontSize: 13 }}>{user.name}</span>
          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: isSuperAdmin ? "rgba(168,85,247,0.2)" : isAdmin ? "rgba(245,158,11,0.2)" : isEditor ? "rgba(34,197,94,0.2)" : "rgba(100,116,139,0.2)", color: isSuperAdmin ? "#c084fc" : isAdmin ? "#fbbf24" : isEditor ? "#4ade80" : "#94a3b8" }}>{isSuperAdmin ? "SUPERADMIN" : isAdmin ? "ADMIN" : isEditor ? "USER EDITOR" : "USER"}</span>
          {isAdmin && <button onClick={() => { setShowSettings(true); loadLog(); }} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: T.textMuted, cursor: "pointer", fontSize: 12 }}>⚙️ Nastavení</button>}
          <div style={{ display: "flex", background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 8, overflow: "hidden" }}>
            {[["🌞","light","Světlý"],["🌙","dark","Tmavý"]].map(([icon, val, label]) => (
              <button key={val} onClick={() => changeTheme(val)} title={label} style={{ padding: "5px 9px", background: theme === val ? (isDark ? "rgba(37,99,235,0.3)" : "rgba(37,99,235,0.15)") : "transparent", border: "none", color: theme === val ? "#60a5fa" : T.textMuted, cursor: "pointer", fontSize: 13 }}>{icon}</button>
            ))}
          </div>
          <button onClick={() => setUser(null)} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: T.textMuted, cursor: "pointer", fontSize: 12 }}>Odhlásit</button>
        </div>
      </div>

      {/* SUMMARY */}
      <div ref={cardsRef}><SummaryCards data={data} firmy={firmy.map(f => f.hodnota)} isDark={isDark} firmaColors={Object.fromEntries(firmy.map(f => [f.hodnota, f.barva || "#2563eb"]))} /></div>

      {/* FILTERS */}
      <div ref={filtersRef} style={{ padding: "10px 18px", display: "flex", gap: 10, alignItems: "center", background: T.filterBg, borderBottom: `1px solid ${T.cellBorder}`, flexWrap: "wrap" }}>
        <input placeholder="🔍 Hledat stavbu / číslo..." value={filterText} onChange={e => setFilterText(e.target.value)} style={{ ...inputSx, width: 230, background: T.inputBg, border: `1px solid ${T.inputBorder}`, color: T.text }} />
        <NativeSelect value={filterFirma} onChange={setFilterFirma} options={["Všechny firmy", ...firmy.map(f => f.hodnota)]} isDark={isDark} style={{ width: 170 }} />
        <NativeSelect value={filterObjed} onChange={setFilterObjed} options={["Všichni objednatelé", ...objednatele]} isDark={isDark} style={{ width: 190 }} />
        <NativeSelect value={filterSV} onChange={setFilterSV} options={["Všichni stavbyvedoucí", ...stavbyvedouci]} isDark={isDark} style={{ width: 170 }} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)"}`, borderRadius: 7, padding: "4px 12px", color: T.text, fontSize: 13, fontWeight: 600 }}>{filtered.length} záznamů</span>
          <div style={{ position: "relative" }} onMouseEnter={() => setShowExport(true)} onMouseLeave={() => setTimeout(() => setShowExport(false), 360)}>
            <button style={{ padding: "7px 14px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)"}`, borderRadius: 7, color: T.text, cursor: "pointer", fontSize: 12 }}>⬇ Export ▾</button>
            {showExport && (
              <div style={{ position: "absolute", top: "calc(100% + 2px)", right: 0, background: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, borderRadius: 10, padding: "6px 6px", zIndex: 200, minWidth: 180, boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }}>
                <button onClick={exportCSV} style={{ display: "block", width: "100%", padding: "9px 14px", background: "none", border: "none", color: T.text, cursor: "pointer", fontSize: 13, textAlign: "left", borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>📄 CSV (.csv)</button>
                <button onClick={exportXLS} style={{ display: "block", width: "100%", padding: "9px 14px", background: "none", border: "none", color: T.text, cursor: "pointer", fontSize: 13, textAlign: "left", borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>📊 Excel (.xlsx)</button>
                <button onClick={exportXLSColor} style={{ display: "block", width: "100%", padding: "9px 14px", background: "none", border: "none", color: T.text, cursor: "pointer", fontSize: 13, textAlign: "left", borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>🎨 Barevný Excel (.xls)</button>
                {isAdmin && <><div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", margin: "4px 0" }} /><button onClick={exportLog} style={{ display: "block", width: "100%", padding: "9px 14px", background: "none", border: "none", color: T.text, cursor: "pointer", fontSize: 13, textAlign: "left", borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>📜 Export logu (.xls)</button></>}
                <button onClick={exportPDF} style={{ display: "block", width: "100%", padding: "9px 14px", background: "none", border: "none", color: T.text, cursor: "pointer", fontSize: 13, textAlign: "left", borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>🖨️ PDF tisk</button>
              </div>
            )}
          </div>
          {isSuperAdmin && Object.keys(colWidths).length > 0 && (
            <button onClick={() => { setColWidths({}); saveColWidths({}); }} style={{ padding: "5px 10px", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 7, color: "#c084fc", cursor: "pointer", fontSize: 11 }} title="Reset šířek sloupců">↺ Reset šířek</button>
          )}
          {isAdmin && <button onClick={zalohaExcel} style={{ padding: "7px 14px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)"}`, borderRadius: 7, color: T.text, cursor: "pointer", fontSize: 12 }} title="Stáhne všechna data jako Excel zálohu">💾 Záloha</button>}
          {isEditor && <button onClick={() => setAdding(true)} style={{ padding: "7px 14px", background: "linear-gradient(135deg,#16a34a,#15803d)", border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>+ Přidat stavbu</button>}
        </div>
      </div>

      {/* TABLE */}
      <div style={{ overflow: "auto", flex: 1 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed", width: "max-content" }}>
          <colgroup>
            <col style={{ width: 40 }} />
            {(isAdmin || isEditor) && <col style={{ width: 90 }} />}
            {COLUMNS.filter(col => col.key !== "id").map(col => (
              <col key={col.key} style={{ width: getColWidth(col) }} />
            ))}
            {(isAdmin || isEditor) && <col style={{ width: 120 }} />}
          </colgroup>
          <thead>
            <tr style={{ background: T.theadBg }}>
              <th style={{ padding: "9px 11px", textAlign: "center", color: T.textMuted, fontWeight: 700, fontSize: 10.5, letterSpacing: 0.4, whiteSpace: "nowrap", minWidth: 40, position: "sticky", top: 0, background: T.theadBg, zIndex: 10, border: `1px solid ${T.cellBorder}` }}>#</th>
              {(isAdmin || isEditor) && <th style={{ padding: "9px 11px", color: T.textMuted, fontWeight: 700, fontSize: 10.5, position: "sticky", top: 0, background: T.theadBg, zIndex: 10, border: `1px solid ${T.cellBorder}`, textAlign: "center" }}>AKCE</th>}
              {COLUMNS.filter(col => col.key !== "id").map(col => (
                <th key={col.key} style={{ padding: "9px 11px", textAlign: "center", color: T.textMuted, fontWeight: 700, fontSize: 10.5, letterSpacing: 0.4, whiteSpace: "nowrap", width: getColWidth(col), minWidth: 40, position: "sticky", top: 0, background: T.theadBg, zIndex: 10, border: `1px solid ${T.cellBorder}`, userSelect: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    {col.label.toUpperCase()}
                    {isSuperAdmin && (
                      editingColWidth === col.key
                        ? <input
                            autoFocus
                            type="number"
                            defaultValue={Math.round(getColWidth(col))}
                            onBlur={e => { const w = Math.max(40, parseInt(e.target.value)||40); setColWidths(prev => { const n = {...prev, [col.key]: w}; saveColWidths(n); return n; }); setEditingColWidth(null); }}
                            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingColWidth(null); }}
                            style={{ width: 55, fontSize: 10, padding: "1px 3px", background: "#1e3a8a", color: "#fff", border: "1px solid #60a5fa", borderRadius: 3 }}
                            onClick={e => e.stopPropagation()}
                          />
                        : <span
                            onMouseDown={e => startDrag(e, col.key, getColWidth(col))}
                            onClick={e => { e.stopPropagation(); setEditingColWidth(col.key); }}
                            style={{ cursor: "col-resize", color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)", fontSize: 14, padding: "0 4px", userSelect: "none", flexShrink: 0, display: "inline-block" }}
                            title={`Táhni = resize | Klik = zadat šířku (nyní: ${Math.round(getColWidth(col))}px)`}
                          >⟺</span>
                    )}
                  </div>
                </th>
              ))}
              {(isAdmin || isEditor) && <th style={{ padding: "9px 11px", color: T.textMuted, fontWeight: 700, fontSize: 10.5, position: "sticky", top: 0, background: T.theadBg, zIndex: 10, border: `1px solid ${T.cellBorder}`, textAlign: "center" }}>AKCE</th>}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, i) => {
              const globalIndex = page * PAGE_SIZE + i;
              const isFaktura = row.cislo_faktury && row.cislo_faktury.trim() !== "" && row.castka_bez_dph && Number(row.castka_bez_dph) !== 0 && row.splatna && row.splatna.trim() !== "";
              const baseBg = isFaktura ? "rgba(22,163,74,0.25)" : rowBg(row.firma);
              return (
              <tr key={row.id}
                style={{ background: baseBg, transition: "background 0.1s", color: T.text }}
                onMouseEnter={e => e.currentTarget.style.background = isFaktura ? "rgba(22,163,74,0.38)" : T.hoverBg}
                onMouseLeave={e => e.currentTarget.style.background = baseBg}
              >
                {/* # číslo řádku */}
                <td style={{ padding: "7px 11px", textAlign: "center", border: `1px solid ${T.cellBorder}` }}>
                  <span style={{ color: T.textMuted, fontSize: 12 }}>{globalIndex + 1}</span>
                </td>
                {/* AKCE vlevo */}
                {(isAdmin || isEditor) && (
                  <td style={{ padding: "7px 11px", whiteSpace: "nowrap", border: `1px solid ${T.cellBorder}`, textAlign: "center" }}>
                    {isAdmin && <button onClick={() => setDeleteConfirm({ id: row.id, step: 1 })} style={{ padding: "3px 9px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: 11, marginRight: 5 }}>🗑️</button>}
                    <button onClick={() => setEditRow(row)} style={{ padding: "3px 9px", background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 5, color: "#60a5fa", cursor: "pointer", fontSize: 11 }}>✏️</button>
                  </td>
                )}
                {COLUMNS.filter(col => col.key !== "id" && !col.hidden).map(col => {
                  const centerCols = ["cislo_stavby","ukonceni","sod","ze_dne","cislo_faktury","splatna"];
                  const align = col.type === "number" ? "right" : centerCols.includes(col.key) ? "center" : "left";

                  // Dvojité hodnoty pro faktury
                  const key2 = col.key === "cislo_faktury" ? "cislo_faktury_2" : col.key === "castka_bez_dph" ? "bez_dph_2" : col.key === "splatna" ? "splatna_2" : null;
                  const val2 = key2 ? row[key2] : null;
                  const hasDouble = key2 && (val2 || val2 === 0);

                  return (
                    <td key={col.key}
                      className={col.key === "rozdil" || col.type === "number" ? "colored-cell" : ""}
                      style={{ padding: "5px 11px", whiteSpace: "nowrap", textAlign: align, border: `1px solid ${T.cellBorder}`, color: col.key === "rozdil" ? (Number(row[col.key]) >= 0 ? "#4ade80" : "#f87171") : col.type === "number" ? T.numColor : T.text }}
                    >
                      <div>
                        <div>
                          {col.key === "firma" ? <span className="firma-badge" style={firmaBadge(row[col.key])}>{row[col.key]}</span>
                          : col.type === "number" ? fmtN(row[col.key])
                          : col.truncate ? <span title={row[col.key] ?? ""} style={{ display: "inline-block", maxWidth: col.width - 22, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "middle" }}>{row[col.key] ?? ""}</span>
                          : row[col.key] ?? ""}
                        </div>
                        {hasDouble && (
                          <div style={{ borderTop: `1px dashed ${T.cellBorder}`, marginTop: 3, paddingTop: 3, color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", fontSize: 11.5 }}>
                            {col.type === "number" ? fmtN(val2) : val2}
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
                {/* AKCE vpravo */}
                {isAdmin && (
                  <td style={{ padding: "7px 11px", whiteSpace: "nowrap", border: `1px solid ${T.cellBorder}`, textAlign: "center" }}>
                    <button onClick={() => setEditRow(row)} style={{ padding: "3px 9px", background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 5, color: "#60a5fa", cursor: "pointer", fontSize: 11, marginRight: 5 }}>✏️ Editovat</button>
                    <button onClick={() => setDeleteConfirm({ id: row.id, step: 1 })} style={{ padding: "3px 9px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: 11 }}>🗑️</button>
                  </td>
                )}
              </tr>
              );
            })}
            {paginated.length < PAGE_SIZE && Array.from({ length: PAGE_SIZE - paginated.length }).map((_, i) => (
              <tr key={`empty-${i}`} style={{ height: 36 }}>
                <td style={{ border: `1px solid ${T.cellBorder}` }} />
                {isAdmin && <td style={{ border: `1px solid ${T.cellBorder}` }} />}
                {COLUMNS.filter(col => col.key !== "id").map(col => <td key={col.key} style={{ border: `1px solid ${T.cellBorder}` }} />)}
                {isAdmin && <td style={{ border: `1px solid ${T.cellBorder}` }} />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 18px", borderTop: `1px solid ${T.cellBorder}`, background: T.filterBg }}>
          <button onClick={() => setPage(0)} disabled={page === 0} style={{ padding: "4px 9px", background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 6, color: T.textMuted, cursor: page === 0 ? "default" : "pointer", opacity: page === 0 ? 0.4 : 1, fontSize: 13 }}>«</button>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: "4px 9px", background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 6, color: T.textMuted, cursor: page === 0 ? "default" : "pointer", opacity: page === 0 ? 0.4 : 1, fontSize: 13 }}>‹</button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} onClick={() => setPage(i)} style={{ padding: "4px 10px", background: page === i ? "#2563eb" : T.cardBg, border: `1px solid ${page === i ? "#2563eb" : T.cardBorder}`, borderRadius: 6, color: page === i ? "#fff" : T.textMuted, cursor: "pointer", fontSize: 13, fontWeight: page === i ? 700 : 400 }}>{i + 1}</button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} style={{ padding: "4px 9px", background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 6, color: T.textMuted, cursor: page === totalPages - 1 ? "default" : "pointer", opacity: page === totalPages - 1 ? 0.4 : 1, fontSize: 13 }}>›</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page === totalPages - 1} style={{ padding: "4px 9px", background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 6, color: T.textMuted, cursor: page === totalPages - 1 ? "default" : "pointer", opacity: page === totalPages - 1 ? 0.4 : 1, fontSize: 13 }}>»</button>
          <span style={{ color: T.textMuted, fontSize: 12, marginLeft: 6 }}>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} z {filtered.length}</span>
        </div>
      )}

      <div style={{ textAlign: "center", padding: "4px", borderTop: `1px solid ${T.cellBorder}`, color: T.textFaint, fontSize: 11, flexShrink: 0 }}>
        © {appDatum} Stavby Znojmo – Martin Dočekal &amp; Claude AI &nbsp;|&nbsp; v{appVerze}
      </div>

      {/* POTVRZOVACÍ DIALOG */}
      {confirmExport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
          <div style={{ background: isDark ? "#1e293b" : "#fff", borderRadius: 14, padding: "28px 32px", width: 380, border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, boxShadow: "0 24px 60px rgba(0,0,0,0.5)", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📤</div>
            <div style={{ color: isDark ? "#f8fafc" : "#1e293b", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Exportovat data?</div>
            <div style={{ color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", fontSize: 13, marginBottom: 24 }}>Bude exportováno <strong>{filtered.length} záznamů</strong> jako <strong>{confirmExport.label}</strong>{confirmExport.type === "xls-color" ? <><br/><span style={{ fontSize: 13, color: "#f97316", marginTop: 8, display: "block", fontWeight: 600 }}>⚠️ Excel zobrazí varování o formátu – klikněte <strong>Ano</strong> pro otevření.</span></> : ""}</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmExport(null)} style={{ padding: "9px 22px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 8, color: isDark ? "#fff" : "#1e293b", cursor: "pointer", fontSize: 13 }}>Zrušit</button>
              <button onClick={() => {
                const t = confirmExport.type;
                setConfirmExport(null);
                if (t === "xls-color") { doExportXLSColor(); }
                else { setExportPreview({ type: t }); }
              }} style={{ padding: "9px 22px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>✅ Ano, exportovat</button>
            </div>
          </div>
        </div>
      )}

      {/* EXPORT PREVIEW - sdílená tabulka pro CSV a XLS */}
      {(exportPreview?.type === "csv" || exportPreview?.type === "xls") && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
          <div style={{ background: "#1e293b", borderRadius: 16, width: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>
                {exportPreview.type === "csv" ? "📄 Export CSV" : "📊 Export Excel"}
              </h3>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{filtered.length} řádků</span>
                <button
                  onClick={() => {
                    const ts = new Date().toISOString().slice(0,16).replace("T","_").replace(":","-");
                    const ws_data = [COLUMNS.map(c => c.label), ...filtered.map(r => COLUMNS.map(c => r[c.key] ?? ""))];
                    if (exportPreview.type === "xls") {
                      const wb = XLSX.utils.book_new();
                      const ws = XLSX.utils.aoa_to_sheet(ws_data);
                      ws["!cols"] = COLUMNS.map(c => ({ wch: Math.max(c.label.length, 14) }));
                      XLSX.utils.book_append_sheet(wb, ws, "Stavby");
                      XLSX.writeFile(wb, `stavby_znojmo_${ts}.xlsx`);
                    } else {
                      const BOM = "\uFEFF";
                      const h = COLUMNS.map(c => `"${c.label}"`).join(";");
                      const rows = filtered.map(r => COLUMNS.map(c => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
                      const blob = new Blob([BOM + h + "\n" + rows], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a"); a.href = url; a.download = `stavby_znojmo_${ts}.csv`;
                      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                    }
                  }}
                  style={{ padding: "7px 16px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  ⬇ Stáhnout {exportPreview.type === "xls" ? ".xlsx" : ".csv"}
                </button>
                <button onClick={() => setExportPreview(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, background: "#fff" }}>
              <div style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#111" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#1e3a5f" }}>Stavby Znojmo</div>
                  <div style={{ fontSize: 10, color: "#666" }}>kategorie 1 & 2 | Export: {new Date().toLocaleDateString("cs-CZ")} | Záznamů: {filtered.length}</div>
                </div>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 9 }}>
                  <thead>
                    <tr style={{ background: "#1e3a5f" }}>
                      {COLUMNS.map(c => <th key={c.key} style={{ color: "#fff", padding: "4px 6px", textAlign: c.key === "id" ? "center" : c.type === "number" ? "right" : "left", whiteSpace: "nowrap", border: "1px solid #2563eb", fontSize: 8 }}>{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, i) => (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? (row.firma === "DUR plus" ? "#eff6ff" : "#fefce8") : "#fff" }}>
                        {COLUMNS.map(c => {
                          const v = row[c.key] ?? "";
                          const isNum = c.type === "number" && v !== "" && Number(v) !== 0;
                          const display = isNum ? Number(v).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v;
                          const color = c.key === "rozdil" ? (Number(v) >= 0 ? "#166534" : "#991b1b") : "#111";
                          return <td key={c.key} style={{ padding: "3px 6px", border: "1px solid #e2e8f0", whiteSpace: "nowrap", textAlign: c.key === "id" ? "center" : c.type === "number" ? "right" : "left", color, fontSize: 9 }}>{display}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {exportPreview?.type === "pdf" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
          <div style={{ background: "#1e293b", borderRadius: 16, width: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>🖨️ Náhled pro tisk / PDF</h3>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => {
                  const firmaColorMap = Object.fromEntries(firmy.map(f => [f.hodnota, f.barva || "#3b82f6"]));
                  const hexToRgb = hex => { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : "59,130,246"; };
                  const rows = filtered.map((row, i) => {
                    const hex = firmaColorMap[row.firma] || "#3b82f6";
                    const rgb = hexToRgb(hex);
                    const bg = i%2===0 ? `rgba(${rgb},0.18)` : `rgba(${rgb},0.07)`;
                    return `<tr>${COLUMNS.map(c => {
                      const v = row[c.key] ?? "";
                      const isNum = c.type === "number" && v !== "" && Number(v) !== 0;
                      const display = isNum ? Number(v).toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2}) : v;
                      const color = c.key === "rozdil" ? (Number(v)>=0?"#166534":"#991b1b") : "#111";
                      const cellBg = c.key === "firma" ? hex : bg;
                      const cellColor = c.key === "firma" ? "#fff" : color;
                      const cellWeight = c.key === "firma" ? "700" : "400";
                      return `<td style="padding:3px 6px;border:1px solid #e2e8f0;white-space:nowrap;text-align:${c.key==="id"?"center":c.type==="number"?"right":"left"};color:${cellColor};background:${cellBg};font-size:8px;font-weight:${cellWeight}">${display}</td>`;
                    }).join("")}</tr>`;
                  }).join("");
                  const headers = COLUMNS.map(c => `<th style="color:#fff;padding:4px 6px;text-align:${c.key==="id"?"center":c.type==="number"?"right":"left"};white-space:nowrap;border:1px solid #2563eb;font-size:8px">${c.label}</th>`).join("");
                  const win = window.open("","_blank");
                  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Stavby Znojmo – tisk</title>
                  <style>
                    @page { size: A4 landscape; margin: 10mm; }
                    body { font-family: Arial, sans-serif; font-size: 9px; color: #111; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    table { border-collapse: collapse; width: 100%; }
                    thead tr { background: #1e3a5f; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    td, th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    h2 { font-size: 13px; margin: 0 0 2px; }
                    .sub { font-size: 9px; color: #666; margin-bottom: 8px; }
                  </style></head><body>
                  <h2>Stavby Znojmo</h2>
                  <div class="sub">kategorie 1 & 2 | Tisk: ${new Date().toLocaleDateString("cs-CZ")} | Záznamů: ${filtered.length}</div>
                  <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
                  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close()};}<\/script>
                  </body></html>`);
                  win.document.close();
                }} style={{ padding: "7px 16px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>🖨️ Tisk / Uložit jako PDF</button>
                <button onClick={() => setExportPreview(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, background: "#fff" }}>
              <div style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#111" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#1e3a5f" }}>Stavby Znojmo</div>
                  <div style={{ fontSize: 10, color: "#666" }}>kategorie 1 & 2 | Export: {new Date().toLocaleDateString("cs-CZ")} | Záznamů: {filtered.length}</div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 9 }}>
                    <thead>
                      <tr style={{ background: "#1e3a5f" }}>
                        {COLUMNS.map(c => <th key={c.key} style={{ color: "#fff", padding: "4px 6px", textAlign: c.key === "id" ? "center" : c.type === "number" ? "right" : "left", whiteSpace: "nowrap", border: "1px solid #2563eb", fontSize: 8 }}>{c.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row, i) => {
                        const firmaColorMap = Object.fromEntries(firmy.map(f => [f.hodnota, f.barva || "#3b82f6"]));
                        const hexToRgb = hex => { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : "59,130,246"; };
                        const hex = firmaColorMap[row.firma] || "#3b82f6";
                        const rgb = hexToRgb(hex);
                        const bg = i % 2 === 0 ? `rgba(${rgb},0.18)` : `rgba(${rgb},0.07)`;
                        return (
                          <tr key={row.id}>
                            {COLUMNS.map(c => {
                              const v = row[c.key] ?? "";
                              const isNum = c.type === "number" && v !== "" && Number(v) !== 0;
                              const display = isNum ? Number(v).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v;
                              const color = c.key === "rozdil" ? (Number(v) >= 0 ? "#166534" : "#991b1b") : "#111";
                              const cellBg = c.key === "firma" ? hex : bg;
                              const cellColor = c.key === "firma" ? "#fff" : color;
                              return <td key={c.key} style={{ padding: "3px 6px", border: "1px solid #e2e8f0", whiteSpace: "nowrap", textAlign: c.key === "id" ? "center" : c.type === "number" ? "right" : "left", color: cellColor, background: cellBg, fontSize: 9, fontWeight: c.key === "firma" ? 700 : 400 }}>{display}</td>;
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {adding && <FormModal title="➕ Nová stavba" initial={emptyRow} onSave={handleAdd} onClose={() => setAdding(false)} firmy={firmy.map(f => f.hodnota)} objednatele={objednatele} stavbyvedouci={stavbyvedouci} />}
      {editRow && <FormModal title={`✏️ Editace stavby #${editRow.id}`} initial={editRow} onSave={handleSave} onClose={() => setEditRow(null)} firmy={firmy.map(f => f.hodnota)} objednatele={objednatele} stavbyvedouci={stavbyvedouci} />}
      {showSettings && <SettingsModal firmy={firmy} objednatele={objednatele} stavbyvedouci={stavbyvedouci} users={users} onChange={saveSettings} onChangeUsers={saveUsers} onClose={() => setShowSettings(false)} onLoadLog={loadLog} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isDark={isDark} appVerze={appVerze} appDatum={appDatum} onSaveAppInfo={saveAppInfo} stavbyData={data} />}

      {showOrphanWarning && (() => {
        const firmyNames = firmy.map(f => f.hodnota);
        const orphans = data.filter(s => s.firma && !firmyNames.includes(s.firma));
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 2100, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
            <div style={{ background: isDark ? "#1e293b" : "#fff", borderRadius: 16, width: 500, maxHeight: "80vh", display: "flex", flexDirection: "column", border: "1px solid rgba(251,191,36,0.4)", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>
              <div style={{ padding: "18px 24px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(251,191,36,0.08)", borderRadius: "16px 16px 0 0" }}>
                <h3 style={{ color: "#fbbf24", margin: 0, fontSize: 17 }}>🏚️ Stavby bez firmy</h3>
                <button onClick={() => setShowOrphanWarning(false)} style={{ background: "none", border: "none", color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ padding: "16px 24px", overflowY: "auto" }}>
                <p style={{ color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)", fontSize: 13, marginTop: 0 }}>
                  Následující stavby mají přiřazenou firmu která již neexistuje v číselníku:
                </p>
                {orphans.map(s => (
                  <div key={s.id} style={{ padding: "8px 12px", marginBottom: 6, background: isDark ? "rgba(251,191,36,0.08)" : "rgba(251,191,36,0.1)", borderRadius: 8, border: "1px solid rgba(251,191,36,0.2)", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: isDark ? "#e2e8f0" : "#1e293b", fontSize: 13, fontWeight: 600 }}>{s.nazev_stavby || `Stavba #${s.id}`}</span>
                    <span style={{ color: "#fbbf24", fontSize: 12 }}>{s.firma}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: "14px 24px", borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => {
                  const rows = orphans.map((s, i) => {
                    const rowBg = i % 2 === 0 ? "#fefce8" : "#ffffff";
                    return `<tr>
                      <td style="background:${rowBg}">${s.cislo_stavby || ""}</td>
                      <td style="background:${rowBg};font-weight:600">${s.nazev_stavby || ""}</td>
                      <td style="background:#fef3c7;color:#92400e;font-weight:700;text-align:center">${s.firma || ""}</td>
                      <td style="background:${rowBg}">${s.objednatel || ""}</td>
                      <td style="background:${rowBg}">${s.stavbyvedouci || ""}</td>
                    </tr>`;
                  }).join("");
                  const w = window.open("", "_blank");
                  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Stavby bez firmy</title>
                  <style>
                    @page { size: A4 landscape; margin: 10mm; }
                    body { font-family: Arial,sans-serif; padding: 0; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    h2 { margin: 0 0 4px; font-size: 15px; }
                    p { margin: 0 0 12px; color: #64748b; font-size: 11px; }
                    table { width: 100%; border-collapse: collapse; font-size: 11px; }
                    th { background: #1e3a8a; color: #fff; padding: 7px 10px; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    td { padding: 6px 10px; border: 1px solid #e2e8f0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    @media print { button { display: none; } }
                  </style>
                  </head><body>
                  <h2>🏚️ Stavby Znojmo – Stavby bez firmy</h2>
                  <p>Vygenerováno: ${new Date().toLocaleDateString("cs-CZ")} &nbsp;|&nbsp; Celkem ${orphans.length} staveb bez přiřazené firmy</p>
                  <table><thead><tr><th>Č. stavby</th><th>Název stavby</th><th>Původní firma</th><th>Objednatel</th><th>Stavbyvedoucí</th></tr></thead>
                  <tbody>${rows}</tbody></table>
                  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script>
                  </body></html>`);
                  w.document.close();
                }} style={{ padding: "9px 22px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>🖨️ Tisk / PDF</button>
                <button onClick={() => setShowOrphanWarning(false)} style={{ padding: "9px 22px", background: "linear-gradient(135deg,#d97706,#b45309)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Rozumím</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showDeadlines && deadlineWarnings.length > 0 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
          <div style={{ background: isDark ? "#1e293b" : "#fff", borderRadius: 16, width: 820, maxHeight: "85vh", display: "flex", flexDirection: "column", border: "1px solid rgba(239,68,68,0.4)", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>
            {/* header */}
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(239,68,68,0.1)", borderRadius: "16px 16px 0 0" }}>
              <div>
                <h3 style={{ color: "#f87171", margin: 0, fontSize: 17 }}>⚠️ Blížící se termíny ukončení</h3>
                <div style={{ color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.5)", fontSize: 12, marginTop: 4 }}>{deadlineWarnings.length} zakázek s termínem do 30 pracovních dní</div>
              </div>
              <button onClick={() => setShowDeadlines(false)} style={{ background: "none", border: "none", color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            {/* tabulka */}
            <div style={{ overflowY: "auto", flex: 1, padding: 24 }} id="deadline-print-area">
              <div style={{ marginBottom: 16, display: "none" }} className="print-header">
                <div style={{ fontWeight: 800, fontSize: 18 }}>Stavby Znojmo – Blížící se termíny</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Vygenerováno: {new Date().toLocaleDateString("cs-CZ")} | Zakázky s termínem do 30 pracovních dní</div>
                <hr style={{ margin: "8px 0" }} />
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: isDark ? "#1a2744" : "#e2e8f0" }}>
                    {["Č. stavby","Název stavby","Termín ukončení","Dní do termínu","Objednatel","Stavbyvedoucí"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)", fontWeight: 700, fontSize: 11, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deadlineWarnings.map((r, i) => {
                    const urgentColor = r.dniDo <= 5 ? "#f87171" : r.dniDo <= 15 ? "#fb923c" : "#facc15";
                    return (
                      <tr key={r.id} style={{ background: i % 2 === 0 ? (isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)") : "transparent" }}>
                        <td style={{ padding: "8px 12px", color: isDark ? "#e2e8f0" : "#1e293b", fontWeight: 600, whiteSpace: "nowrap", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>{r.cislo_stavby}</td>
                        <td style={{ padding: "8px 12px", color: isDark ? "#e2e8f0" : "#1e293b", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>{r.nazev_stavby}</td>
                        <td style={{ padding: "8px 12px", color: isDark ? "#e2e8f0" : "#1e293b", whiteSpace: "nowrap", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>{r.ukonceni}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>
                          <span style={{ background: urgentColor + "22", color: urgentColor, border: `1px solid ${urgentColor}44`, borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>{r.dniDo} dní</span>
                        </td>
                        <td style={{ padding: "8px 12px", color: isDark ? "#e2e8f0" : "#1e293b", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>{r.objednatel}</td>
                        <td style={{ padding: "8px 12px", color: isDark ? "#e2e8f0" : "#1e293b", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>{r.stavbyvedouci}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* footer */}
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => {
                const firmaColorMap = Object.fromEntries(firmy.map(f => [f.hodnota, f.barva || "#3b82f6"]));
                const rows = deadlineWarnings.map((r, i) => {
                  const urgentColor = r.dniDo <= 5 ? "#dc2626" : r.dniDo <= 15 ? "#ea580c" : "#ca8a04";
                  const urgentBg = r.dniDo <= 5 ? "#fee2e2" : r.dniDo <= 15 ? "#ffedd5" : "#fef9c3";
                  const firmaBg = firmaColorMap[r.firma] || "#3b82f6";
                  const rowBg = i % 2 === 0 ? "#f8fafc" : "#ffffff";
                  return `<tr>
                    <td style="background:${rowBg}">${r.cislo_stavby || ""}</td>
                    <td style="background:${rowBg};font-weight:600">${r.nazev_stavby || ""}</td>
                    <td style="background:${firmaBg};color:#fff;font-weight:700;text-align:center">${r.firma || ""}</td>
                    <td style="background:${rowBg}">${r.ukonceni || ""}</td>
                    <td style="background:${urgentBg};color:${urgentColor};font-weight:700;text-align:center">${r.dniDo} dní</td>
                    <td style="background:${rowBg}">${r.objednatel || ""}</td>
                    <td style="background:${rowBg}">${r.stavbyvedouci || ""}</td>
                  </tr>`;
                }).join("");
                const w = window.open("", "_blank");
                w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Blížící se termíny</title>
                <style>
                  @page { size: A4 landscape; margin: 10mm; }
                  body { font-family: Arial,sans-serif; padding: 0; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                  h2 { margin: 0 0 4px; font-size: 15px; }
                  p { margin: 0 0 12px; color: #64748b; font-size: 11px; }
                  table { width: 100%; border-collapse: collapse; font-size: 11px; }
                  th { background: #1e3a8a; color: #fff; padding: 7px 10px; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                  td { padding: 6px 10px; border: 1px solid #e2e8f0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                  @media print { button { display: none; } }
                </style>
                </head><body>
                <h2>⚠️ Stavby Znojmo – Blížící se termíny ukončení</h2>
                <p>Vygenerováno: ${new Date().toLocaleDateString("cs-CZ")} &nbsp;|&nbsp; Zakázky s termínem do 30 pracovních dní (${deadlineWarnings.length} zakázek)</p>
                <table><thead><tr><th>Č. stavby</th><th>Název stavby</th><th>Firma</th><th>Termín ukončení</th><th>Dní do termínu</th><th>Objednatel</th><th>Stavbyvedoucí</th></tr></thead>
                <tbody>${rows}</tbody></table>
                <script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script>
                </body></html>`);
                w.document.close();
              }} style={{ padding: "9px 18px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>🖨️ Tisk / PDF</button>
              <button onClick={() => setShowDeadlines(false)} style={{ padding: "9px 18px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 8, color: isDark ? "#fff" : "#1e293b", cursor: "pointer", fontSize: 13 }}>Zavřít</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#1e293b", borderRadius: 14, padding: 28, width: 360, border: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{deleteConfirm.step === 2 ? "🚨" : "⚠️"}</div>
            <h3 style={{ color: "#fff", margin: "0 0 8px" }}>{deleteConfirm.step === 2 ? "Opravdu smazat?" : "Smazat záznam?"}</h3>
            <p style={{ color: "rgba(255,255,255,0.4)", margin: "0 0 6px", fontSize: 13 }}>
              {deleteConfirm.step === 2
                ? <><span style={{ color: "#f87171", fontWeight: 700 }}>Toto je poslední varování.</span><br />Záznam bude trvale odstraněn.</>
                : "Chystáš se smazat tento záznam."}
            </p>
            <p style={{ color: "rgba(255,255,255,0.25)", margin: "0 0 22px", fontSize: 12 }}>
              {deleteConfirm.step === 2 ? "Krok 2 z 2 – akce je nevratná." : "Krok 1 z 2 – pokračuj pro potvrzení."}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: "9px 18px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", cursor: "pointer" }}>Zrušit</button>
              {deleteConfirm.step === 1
                ? <button onClick={() => setDeleteConfirm({ id: deleteConfirm.id, step: 2 })} style={{ padding: "9px 18px", background: "linear-gradient(135deg,#d97706,#b45309)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontWeight: 600 }}>Ano, smazat</button>
                : <button onClick={() => handleDelete(deleteConfirm.id)} style={{ padding: "9px 18px", background: "linear-gradient(135deg,#dc2626,#b91c1c)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontWeight: 600 }}>Potvrdit smazání</button>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
