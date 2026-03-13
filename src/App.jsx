import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
// BUILD: 2026_03_13_build0077
// ============================================================
// POZNÁMKY PRO CLAUDE (čti na začátku každé session)
// ============================================================
// PRAVIDLO: Každá změna = dva soubory:
//   stavby-app_DATUM_buildXXXX.jsx
//   stavby-app_DATUM_buildXXXX_changelog.txt
//   Třetí řádek souboru: // BUILD: DATUM_buildXXXX
//   Po každém buildu aktualizovat sekci HISTORY níže.
//
// DEPLOY: Vercel + GitHub (doco1971/stavby-znojmo), branch main
//   Soubor patří do: src/App.jsx
//
// TRANSCRIPT: /mnt/transcripts/ — přečíst pro kontext předchozích session
//
// ============================================================
// TECHNICKÉ DETAILY
// ============================================================
//
// SUPABASE: tabulky stavby, ciselniky, uzivatele, log_aktivit, nastaveni
//   sb() helper — fetch wrapper s Bearer tokenem
//   XLSX export: HTML blob (.xls) — NE import("xlsx"), nefunguje v bundlu!
//   XLSX import: XLSX.read(..., { raw: true, cellDates: true }) — raw:true nutné!
//
// TABULKA — sloupce:
//   Faktura 2 (cislo_faktury_2, castka_bez_dph_2, splatna_2): hidden:true
//   ale zobrazují se jako druhý řádek v buňkách faktury (stejný font, čára dashed)
//   Zelený řádek (isFaktura): č.faktury + castka_bez_dph + splatna vyplněny
//     → isOverdue = false
//   Červené ukončení (isOverdue): termín v minulosti, jen pokud !isFaktura
//
// ROLE: user (čtení), user_e (editor), admin, superadmin
//
// DEMO: email=demo / heslo=demo
//   role=admin, max 15 staveb, jen v paměti — NESMÍ zapisovat do DB!
//   Blokováno: logAkce, saveSettings, saveUsers, saveAppInfo, saveColWidths,
//              loadLog, HistorieModal, LogModal, SettingsModal log tab
//   Demo data: 8 staveb, 4 firmy, DEMO_USERS (4 účty viditelné v Nastavení)
//
// IMPORT původní tabulky (📥 Import, jen superadmin):
//   Formát A — původní Excel: List1, hlavička řádek 4, data od řádku 5
//     col1=firma, col3=ps_i, col4=snk_i, col5=bo_i, col6=ps_ii, col7=bo_ii,
//     col8=poruch, col9=cislo_stavby, col10=nazev_stavby,
//     col14=ukonceni, col15=zrealizovano, col16=sod, col17=ze_dne,
//     col18=objednatel, col19=stavbyvedouci, col20=nabidkova_cena,
//     col21=cislo_faktury, col22=castka_bez_dph, col23=splatna
//   Formát B — záloha DB (list "Stavby" z aplikace)
//   Datumy vždy DD.MM.YYYY, čísla jako float (raw:true)
//
// ZÁLOHA DB (💾 Záloha DB, jen superadmin):
//   Excel 3 listy: Stavby + Ciselniky + Uzivatele (bez hesel)
//
// DB MIGRACE (nutné v Supabase SQL editoru):
//   ALTER TABLE stavby ADD COLUMN IF NOT EXISTS poznamka TEXT;
//   ALTER TABLE stavby ADD COLUMN IF NOT EXISTS cislo_faktury_2 TEXT;
//   ALTER TABLE stavby ADD COLUMN IF NOT EXISTS castka_bez_dph_2 NUMERIC;
//   ALTER TABLE stavby ADD COLUMN IF NOT EXISTS splatna_2 TEXT;
//   CREATE POLICY "admin_read_all" ON log_aktivit FOR SELECT USING (true);
//
// MOBIL: tabulka není optimalizována (25 sloupců) → do budoucna kartičky
//
// ============================================================
// PENDING FUNKCE (dohodnuté, zatím neimplementované)
// ============================================================
// [PENDING] 🎨 Layout / rozmístění na ploše — až po dokončení všech funkcí
//
// PRAVIDLA EXPORTU (platí od BUILD0052)
// ============================================================
// Každý build se exportuje jako:
//   1. stavby-app_DATUM_buildXXXX.jsx        — hlavní soubor aplikace
//   2. stavby-app_DATUM_buildXXXX_changelog.txt — popis změn tohoto buildu
// Hlavička .jsx obsahuje vždy aktuální HISTORY + PENDING sekci.
// ============================================================
// HISTORY BUILDŮ (0025–0045)
// ============================================================
//
// BUILD0025 — Notifikace, SVG graf firma/měsíc, auto-logout, poznámka
// BUILD0026 — FIX: recharts odstraněn, duplicate key
// BUILD0027 — FIX: 💬 ikona pro user, nápověda rozšířena
// BUILD0028 — Graf: třetí přepínač Kat. I / II
// BUILD0029 — 🕐 HistorieModal, diff při uložení, FIELD_LABELS
// BUILD0030 — FIX: syntax error v nápovědě
// BUILD0031 — FIX: regex filtr historie (přesná shoda ID)
// BUILD0032 — 📜 LogModal, exporty z logu a historie
// BUILD0033 — 🔴 Tečka na 🕐, RLS banner v logu
// BUILD0034 — FIX: ReferenceError "ur", dynamic import xlsx
// BUILD0035 — Tečka permanentní, nápověda přepsána (16 sekcí)
// BUILD0036 — Nápověda plovoucí (drag), demo banner, RLS kopírovat
// BUILD0037 — Aktualizace hlavičky (jen dokumentace)
// BUILD0038 — Demo jako admin, 8 staveb, DEMO_USERS, tečka při loginu
// BUILD0039 — FIX: demo logy prázdné (isDemo prop), tečka ihned po save
// BUILD0040 — FIX: SettingsModal log tab blokován v demo
// BUILD0041 — 🚨 KRITICKÁ OPRAVA: demo zapisovalo do ostré DB
//   saveSettings/saveUsers/logAkce/saveAppInfo/saveColWidths — vše blokováno
//   PŘÍČINA: demo role admin + chybějící guardy → přepsalo ciselniky+uzivatele
// BUILD0042 — 💾 Záloha DB (superadmin): 3 listy Stavby+Ciselniky+Uzivatele
// BUILD0043 — 📥 Import staveb: původní tabulka + záloha DB formát
// BUILD0044 — FIX: import čísla (raw:true), datumy DD.MM.YYYY, Faktura 2 obnovena
//   Faktura 2 chyběla v COLUMNS/editaci/tabulce — obnovena kompletně
//   FIX syntax error: chybějící </div> po sekci Faktura 2 v EditModal
// BUILD0045 — Aktualizace hlavičky pro nové session (jen dokumentace)
// BUILD0046 — FIX: Faktura 2 v buňce stejný font jako Faktura 1, skryté sloupce
//   Č. FAKTURY 2 / Č. BEZ DPH 2 / SPLATNÁ 2 zmizely z hlavičky (hidden filter)
//   colgroup + thead: přidán filtr !col.hidden (chyběl, data ho měly)
//   Druhý řádek faktury: odstraněn fontSize:11 + color:textMuted → dědí styl buňky
//   FIX: table-wrapper overflowY:"hidden" → "auto" (řádky nebyly vidět)
// BUILD0047 — Označení faktur: červené "e" (E.ON) před Fakturou 1, žluté "S" (sdružení) před Fakturou 2
//   Nápověda doplněna: sekce 🧾 Označení faktur
// BUILD0048 — 🔍 Rozšířený filtr: rok, rozsah nab. ceny, prošlé termíny bez faktury
//   Plovoucí přetahovatelný panel (stejný princip jako nápověda)
//   Tabulka se při otevření filtru neposouvá
//   Nápověda doplněna: sekce 🔍 Rozšířený filtr
// BUILD0049 — FIX filtrovací lišta: kompaktní layout, nowrap, overflowX auto
//   Zmenšeny šířky NativeSelect (145/160/170), hledání 170px, gap 6px
//   Zkráceny popisky tlačítek (záz., Záloha) aby se vešlo na 1 řádek
//   Aktualizována HISTORY + PENDING sekce v hlavičce
// BUILD0050 — FIX blikání stránkování: řádky s Fakturou 2 jsou vyšší
//   PAGE_SIZE se počítal z firstRow → přepočet → blikání
//   Oprava: MIN výška, pak MAX výška, nakonec stableRowH ref — vše nestabilní
// BUILD0051 — FIX posuvník a přetékání: více pokusů o dynamický výpočet
//   useMemo + iterativní simulace stránkování, ratchet DOM měření — vše nestabilní
//   Problém: různé výšky řádků na různých stránkách nelze spolehlivě předpovědět z DOM
// BUILD0052 — FIX definitivní: PAGE_SIZE = fixní useState(7), žádné DOM měření
//   Přidána tlačítka − / + v paginaci pro ruční nastavení počtu řádků (3–50)
// BUILD0053 — Dva pohledy + oprava filtru Kat. II + barevné grafy
//   📋 Stránky / 📜 Vše, filterKat II fix, stacked graf, barevná tabulka
// BUILD0054 — FIX export dropdown překrytý tabulkou
//   position:fixed + getBoundingClientRect, click toggle, kompaktní lišta
// BUILD0055 — FIX legenda grafu Kat. I/II
//   Legenda přesunuta z SVG do HTML, Kat.I/II sekce odděleny
// BUILD0056 — FIX build error: renderBars HTML legenda mimo return
//   Přidán React fragment <> kolem svg+legenda
// BUILD0057 — 3 opravy filtrovací lišty a grafu
//   Graf labels horizontal, Export NativeSelect, height 28px
// BUILD0058 — FIX: graf labels stále šikmé + export menu příliš úzké
//   labels rotate odstraněn, NativeSelect minWidth 220px
// BUILD0059 — FIX: resize sloupce — truncate maxWidth: col.width → getColWidth
// BUILD0060 — FIX: resize sloupce nepustí za header text
//   th: minWidth:0 + maxWidth:getColWidth, input max 2000px
// BUILD0061 — Doplnění nápovědy o nové funkce (BUILD0043–0060)
//   Přidány sekce: Dva pohledy, Rozšířený filtr, Import, Označení faktur e/S
// BUILD0062 — FIX: td overflow:hidden pro truncate sloupce, reset shownDeadlineOnce při změně usera
// BUILD0063 — FIX: th maxWidth odstraněn (blokoval resize), nápověda e/S s barvami
// BUILD0064 — FIX: ikona ⟺ vždy viditelná (flex space-between), objednatel 130px, SV 140px
// BUILD0065 — FIX: tlačítka −/+ vždy viditelná (mimo blok totalPages>1), glow ikony v nápovědě
// BUILD0066 — Nápověda: auto glow všech emoji přes Unicode regex + drop-shadow filter
// BUILD0067 — FIX: drop-shadow → brightness(1.4) — čisté zesvětlení bez modrého nádechu
// BUILD0068 — brightness(2) + bílý glow — příliš agresivní
// BUILD0069 — nadpisová ikona brightness(1.4), ikony v textu bez filtru
// BUILD0070 — všechny ikony brightness(1.4)
// BUILD0077 — FIX: kartičky zobrazovaly jen header (firma+číslo), tělo chybělo
//   Odstraněn overflow:hidden z root divu StavbaCard (ořezával obsah)
//   Přidán minHeight:0 na card view kontejner (iOS flex fix)
// BUILD0076 — FIX: kartičky nefungovaly na iPhone (Chrome/Safari/Firefox)
//   window.innerWidth nespolehlivý na iOS WebKit → přechod na window.matchMedia
//   useIsMobile: mq.matches + mq.addEventListener("change") místo resize listeneru
//   cardView init: window.matchMedia("(max-width: 767px)").matches
// BUILD0075 — FIX: kartičky na mobilu nezobrazovaly se (zobrazovala se tabulka)
//   cardView inicializován lazy: useState(() => window.innerWidth < 768)
//   Odstraněn useEffect který nastavoval cardView až po prvním renderu — příliš pozdě
// BUILD0074 — 📱 Mobilní kartičky
//   useIsMobile hook (breakpoint 768px, resize listener)
//   Výchozí pohled na mobilu: kartičky; na desktopu: tabulka
//   Tlačítko přepínače v liště: jen na mobilu (📋/📇)
//   Kartička: firma tečka + název + číslo stavby, 3 metriky,
//     termín + badge (prošlý/blížící se/vyfakturováno/bez termínu),
//     poznámka (💬 text), faktura(y) e/S, akce dle role
//   Role: user=jen čtení, user_e=editovat+kopie, admin+=smazat
// BUILD0073 — Tlačítko Filtr ▾: červené rozsvícení když je aktivní alespoň 1 rozšířený filtr
//   Stav tlačítka: zavřený+neaktivní / zavřený+aktivní (červená) / otevřený / otevřený+aktivní (červená)
//   Barva nezávislá na tom zda je panel otevřený — signalizuje aktivní filtrování
// BUILD0072 — 📋 Kopírování stavby: tlačítko vedle editace (admin+editor)
//   Otevře FormModal s daty původní stavby, č. stavby + " (kopie)", bez ID
//   Demo: respektuje DEMO_MAX_STAVBY limit; ostrá DB: POST + logAkce "Kopírování stavby"
//   Nápověda doplněna: sekce 📋 Kopírování stavby
//   PENDING odstraněno: 📋 Kopírovat stavbu
// BUILD0071 — ikony v textu fontSize:15 + saturate(1.3) pro sjednocení s nadpisovou ikonou
//   Přidáno: Dva pohledy, Rozšířený filtr, Import staveb, Označení faktur e/S
//   Upraveno: Šířky sloupců (max 2000px, zadání číslem)
//   th: minWidth:0 + maxWidth:getColWidth → fixed layout respektuje col šířku
//   input pro šířku: max 2000px, šířka 65px
//   maxWidth: col.width-22 → getColWidth(col)-22
//   labels: rotate odstraněn, textAnchor middle, font 11 bold
//   NativeSelect dropdown: minWidth max(šířka tlačítka, 220px)
//   1. Graf: firma labels horizontálně, font 9→11, fontWeight 600
//   2. Export: custom dropdown → NativeSelect (stejný styl jako filtry)
//   3. Všechna tlačítka lišty: height: 28px (sjednocená výška)
//   Přidán React fragment <> kolem svg+legenda
//   Legenda přesunuta z SVG do HTML pod grafem
//   Kat. I a Kat. II každá ve svém řádku se svými barvami
//   SVG PAD_B: 100→30, H: 340→280 (více místa pro sloupce)
//   zIndex dropdown: 200 → 1100, overlay: 199 → 1099
//   Export přepnut z hover na click toggle (spolehlivější)
//   📋 Stránky / 📜 Vše — přepínač v filtrovací liště
//   Pohled Vše: zobrazí všechny filtered řádky, skryje paginaci
//   FIX: filterKat "II" nezahrnoval poruch → opraveno
//   Graf Kat. I/II: stacked bars — 3 složky KAT I (fialová/modrá/zelená)
//     + 3 složky KAT II (oranžová/červená/fialová)
//   Tabulka v grafu: rozpad na 6 složek s barvami + součty Kat. I, Kat. II, Celkem
//   Přidána tlačítka − / + v paginaci pro ruční nastavení počtu řádků (3–50)
//   Zobrazení "7 řád." vedle tlačítek — uživatel vidí aktuální hodnotu
//   Každý monitor si nastaví sám dle potřeby
// ============================================================
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
  if (uzivatel === "demo") return; // demo — nepsat do DB
  try {
    await sb("log_aktivit", { method: "POST", body: JSON.stringify({ uzivatel, akce, detail }), prefer: "return=minimal" });
  } catch (e) { console.warn("Log chyba:", e); }
};
// ============================================================
// DEMO MODE
// ============================================================
const DEMO_USER = { id: 0, email: "demo", password: "demo", role: "admin", name: "Demo administrátor" };
const DEMO_FIRMY = [
  { hodnota: "Elektro s.r.o.", barva: "#3b82f6" },
  { hodnota: "Stavmont a.s.", barva: "#10b981" },
  { hodnota: "VHS Znojmo", barva: "#f59e0b" },
  { hodnota: "Silnice JM", barva: "#8b5cf6" },
];
const DEMO_CISELNIKY = {
  objednatele: ["Město Znojmo", "Jihomoravský kraj", "MO ČR", "Správa silnic"],
  stavbyvedouci: ["Jan Novák", "Petr Svoboda", "Marie Horáková", "Tomáš Blaha"],
};
const DEMO_MAX_STAVBY = 15;
const DEMO_USERS = [
  { id: 1, email: "admin@demo.cz",   password: "demo", role: "admin",      name: "Admin Demo",    heslo: "demo" },
  { id: 2, email: "editor@demo.cz",  password: "demo", role: "user_e",     name: "Editor Demo",   heslo: "demo" },
  { id: 3, email: "user@demo.cz",    password: "demo", role: "user",       name: "Čtenář Demo",   heslo: "demo" },
  { id: 4, email: "super@demo.cz",   password: "demo", role: "superadmin", name: "Superadmin Demo", heslo: "demo" },
];

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
  { key: "castka_bez_dph_2", label: "Č. bez DPH 2", width: 105, type: "number", hidden: true },
  { key: "splatna_2", label: "Splatná 2", width: 88, hidden: true },

];

const inputSx = { width: "100%", padding: "9px 11px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };

// ── Globální sdílené konstanty ─────────────────────────────
const NUM_FIELDS = ["ps_i","snk_i","bo_i","ps_ii","bo_ii","poruch","vyfakturovano","zrealizovano","nabidkova_cena","castka_bez_dph","castka_bez_dph_2"];
const DATE_FIELDS = ["ukonceni","splatna","ze_dne","splatna_2"];
const TEXT_FIELDS_EXTRA = ["poznamka"]; // textarea pole – nepatří do NUM ani DATE
const FIRMA_COLOR_FALLBACK = ["#3b82f6","#facc15","#a855f7","#ef4444","#0ea5e9","#f97316","#10b981","#ec4899"];
const hexToRgb = hex => { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : "59,130,246"; };
const hexToRgbaGlobal = (hex, alpha) => `rgba(${hexToRgb(hex)},${alpha})`;

function Lbl({ children }) {
  return <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 5, textTransform: "uppercase" }}>{children}</div>;
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
    <div ref={ref} style={{ position: "relative", display: "inline-block", ...style }}
      onMouseEnter={openDropdown}
      onMouseLeave={() => setTimeout(() => setOpen(false), 480)}
    >
      <button style={{ width: "auto", padding: "0 20px 0 10px", height: 28, background: bg, border: `1px solid ${border}`, borderRadius: 7, color: textColor, cursor: "pointer", fontSize: 12, textAlign: "left", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", position: "relative", minWidth: 80 }}>
        <span>{value}</span>
        <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", pointerEvents: "none" }}>▼</span>
      </button>
      {open && (
        <div style={{ position: "fixed", top: dropUp ? "auto" : dropPos.top, bottom: dropUp ? window.innerHeight - dropPos.top : "auto", left: dropPos.left, minWidth: Math.max(dropPos.width, 220), background: dropBg, border: `1px solid ${border}`, borderRadius: 8, zIndex: 9999, boxShadow: dropShadow, overflow: "auto", maxHeight: 280 }}>
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
// HISTORIE ZMĚN MODAL
// ============================================================
const FIELD_LABELS = {
  firma: "Firma", cislo_stavby: "Č. stavby", nazev_stavby: "Název stavby",
  ps_i: "Plán. stavby I", snk_i: "SNK I", bo_i: "Běžné opravy I",
  ps_ii: "Plán. stavby II", bo_ii: "Běžné opravy II", poruch: "Poruchy",
  vyfakturovano: "Vyfakturováno", ukonceni: "Ukončení", zrealizovano: "Zrealizováno",
  sod: "SOD", ze_dne: "Ze dne", objednatel: "Objednatel", stavbyvedouci: "Stavbyvedoucí",
  nabidkova_cena: "Nab. cena", cislo_faktury: "Č. faktury", castka_bez_dph: "Č. bez DPH",
  splatna: "Splatná", poznamka: "Poznámka",
};

function HistorieModal({ row, isDark, onClose, isDemo }) {
  const [zaznamy, setZaznamy] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemo) { setLoading(false); return; } // demo — žádná DB
    const load = async () => {
      try {
        const res = await sb(`log_aktivit?order=cas.desc&limit=500`);
        const idStr = String(row.id);
        const filtered = (res || []).filter(r => {
          if (!r.detail) return false;
          if (r.akce === "Přidání stavby" && r.detail === (row.nazev_stavby || "")) return true;
          const match = r.detail.match(/^ID:\s*(\d+)[,\s]/);
          return match && match[1] === idStr;
        });
        setZaznamy(filtered);
      } catch { setZaznamy([]); }
      finally { setLoading(false); }
    };
    load();
  }, [row.id, row.nazev_stavby, isDemo]);

  const fmtCas = (cas) => {
    if (!cas) return "";
    const d = new Date(cas);
    return d.toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // Parsuj JSON diff z detailu pokud existuje
  const parseDetail = (detail) => {
    if (!detail) return null;
    try {
      const jsonStart = detail.indexOf("{");
      if (jsonStart === -1) return null;
      return JSON.parse(detail.slice(jsonStart));
    } catch { return null; }
  };

  const AKCE_STYLE = {
    "Přidání stavby":  { bg: "rgba(34,197,94,0.15)",  border: "rgba(34,197,94,0.4)",  color: "#4ade80",  icon: "➕" },
    "Editace stavby":  { bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.4)", color: "#fbbf24",  icon: "✏️" },
    "Smazání stavby":  { bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.4)",  color: "#f87171",  icon: "🗑️" },
  };

  const modalBg  = isDark ? "#1e293b" : "#fff";
  const textC    = isDark ? "#e2e8f0" : "#1e293b";
  const mutedC   = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.45)";
  const borderC  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ background: modalBg, borderRadius: 18, width: "min(680px,96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
        {/* header */}
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${borderC}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 style={{ color: textC, margin: 0, fontSize: 16 }}>🕐 Historie změn</h3>
            <div style={{ color: mutedC, fontSize: 12, marginTop: 3 }}>{row.cislo_stavby && <span style={{ fontWeight: 700, color: isDark ? "#60a5fa" : "#2563eb" }}>{row.cislo_stavby} · </span>}{row.nazev_stavby}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: mutedC, fontSize: 20, cursor: "pointer", lineHeight: 1, marginLeft: 16 }}>✕</button>
        </div>

        {/* obsah */}
        <div style={{ overflowY: "auto", flex: 1, padding: "16px 22px" }}>
          {loading && <div style={{ textAlign: "center", color: mutedC, padding: 40 }}>Načítám historii...</div>}
          {!loading && zaznamy.length === 0 && (
            <div style={{ textAlign: "center", padding: 48 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              <div style={{ color: mutedC, fontSize: 14 }}>{isDemo ? "Demo režim — historie se neukládá" : "Žádné záznamy v historii"}</div>
              {isDemo && <div style={{ color: mutedC, fontSize: 12, marginTop: 6 }}>V ostré verzi se zde zobrazí kompletní přehled změn.</div>}
              <div style={{ color: mutedC, fontSize: 12, marginTop: 6 }}>Historie se zapisuje od tohoto buildu.</div>
            </div>
          )}
          {!loading && zaznamy.map((z, i) => {
            const style = AKCE_STYLE[z.akce] || { bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.3)", color: "#94a3b8", icon: "•" };
            const diff  = parseDetail(z.detail);
            return (
              <div key={i} style={{ marginBottom: 12, padding: "12px 14px", background: style.bg, border: `1px solid ${style.border}`, borderRadius: 10 }}>
                {/* řádek: ikona akce + čas + uživatel */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: diff ? 10 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14 }}>{style.icon}</span>
                    <span style={{ color: style.color, fontWeight: 700, fontSize: 13 }}>{z.akce}</span>
                    <span style={{ color: mutedC, fontSize: 12 }}>— {z.uzivatel}</span>
                  </div>
                  <span style={{ color: mutedC, fontSize: 11, whiteSpace: "nowrap", marginLeft: 12 }}>{fmtCas(z.cas)}</span>
                </div>
                {/* diff tabulka */}
                {diff && diff.zmeny && diff.zmeny.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr>
                          {["Pole","Původní hodnota","Nová hodnota"].map(h => (
                            <th key={h} style={{ padding: "4px 8px", textAlign: "left", color: mutedC, fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${borderC}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {diff.zmeny.map((z2, j) => (
                          <tr key={j} style={{ borderBottom: `1px solid ${borderC}` }}>
                            <td style={{ padding: "4px 8px", color: mutedC, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{FIELD_LABELS[z2.pole] || z2.pole}</td>
                            <td style={{ padding: "4px 8px", color: "#f87171", fontSize: 11, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z2.stare === "" || z2.stare == null ? <em style={{ opacity: 0.5 }}>prázdné</em> : String(z2.stare)}</td>
                            <td style={{ padding: "4px 8px", color: "#4ade80", fontSize: 11, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z2.nove === "" || z2.nove == null ? <em style={{ opacity: 0.5 }}>prázdné</em> : String(z2.nove)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {/* starý formát detailu bez diffu */}
                {!diff && z.detail && <div style={{ color: mutedC, fontSize: 11, marginTop: 4 }}>{z.detail}</div>}
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 22px", borderTop: `1px solid ${borderC}`, display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8 }}>
            {/* PDF export */}
            <button onClick={() => {
              const rows = zaznamy.map((z, i) => {
                const diff = (() => { try { const s = z.detail?.indexOf("{"); return s >= 0 ? JSON.parse(z.detail.slice(s)) : null; } catch { return null; } })();
                const cas = z.cas ? new Date(z.cas).toLocaleString("cs-CZ") : "";
                const akceColor = z.akce === "Přidání stavby" ? "#166534" : z.akce === "Editace stavby" ? "#854D0E" : z.akce === "Smazání stavby" ? "#991B1B" : "#1e293b";
                const akceBg    = z.akce === "Přidání stavby" ? "#dcfce7" : z.akce === "Editace stavby" ? "#fef9c3" : z.akce === "Smazání stavby" ? "#fee2e2" : "#f8fafc";
                const zmenyHtml = diff?.zmeny?.length ? `<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:10px"><thead><tr><th style="background:#e2e8f0;padding:3px 6px;text-align:left">Pole</th><th style="background:#e2e8f0;padding:3px 6px;text-align:left;color:#991b1b">Původní</th><th style="background:#e2e8f0;padding:3px 6px;text-align:left;color:#166534">Nová</th></tr></thead><tbody>${diff.zmeny.map(z2 => `<tr><td style="padding:3px 6px;border-bottom:1px solid #e2e8f0">${FIELD_LABELS[z2.pole]||z2.pole}</td><td style="padding:3px 6px;border-bottom:1px solid #e2e8f0;color:#991b1b">${z2.stare??""}</td><td style="padding:3px 6px;border-bottom:1px solid #e2e8f0;color:#166534">${z2.nove??""}</td></tr>`).join("")}</tbody></table>` : "";
                return `<tr><td style="padding:8px 10px;background:${akceBg};border:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;font-size:11px;color:${akceColor};font-weight:700">${z.akce||""}</td><td style="padding:8px 10px;background:${i%2===0?"#f8fafc":"#fff"};border:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;font-size:11px">${cas}</td><td style="padding:8px 10px;background:${i%2===0?"#f8fafc":"#fff"};border:1px solid #e2e8f0;vertical-align:top;font-size:11px">${z.uzivatel||""}</td><td style="padding:8px 10px;background:${i%2===0?"#f8fafc":"#fff"};border:1px solid #e2e8f0;vertical-align:top;font-size:11px">${zmenyHtml || (z.detail||"")}</td></tr>`;
              }).join("");
              const w = window.open("","_blank");
              w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Historie – ${row.nazev_stavby}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact}h2{margin:0 0 2px;font-size:14px}p{margin:0 0 10px;color:#64748b;font-size:10px}table{width:100%;border-collapse:collapse}th{background:#1e3a8a;color:#fff;padding:7px 10px;text-align:left;font-size:11px}@media print{button{display:none}}</style></head><body><h2>🕐 Historie změn – ${row.cislo_stavby||""} ${row.nazev_stavby||""}</h2><p>Vygenerováno: ${new Date().toLocaleDateString("cs-CZ")} | ${zaznamy.length} záznamů</p><table><thead><tr><th>Akce</th><th>Datum a čas</th><th>Uživatel</th><th>Detail změn</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script></body></html>`);
              w.document.close();
            }} style={{ padding: "7px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 7, color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🖨️ PDF tisk</button>

            {/* XLSX export — jako HTML tabulka (.xls) */}
            <button onClick={() => {
              const headers = `<tr><th style="background:#1E3A8A;color:#fff;padding:6px 10px;border:1px solid #2563EB;font-size:10px">Akce</th><th style="background:#1E3A8A;color:#fff;padding:6px 10px;border:1px solid #2563EB;font-size:10px">Datum a čas</th><th style="background:#1E3A8A;color:#fff;padding:6px 10px;border:1px solid #2563EB;font-size:10px">Uživatel</th><th style="background:#1E3A8A;color:#fff;padding:6px 10px;border:1px solid #2563EB;font-size:10px">Detail změn</th></tr>`;
              const AKCE_BG = { "Přidání stavby":"#dcfce7","Editace stavby":"#fef9c3","Smazání stavby":"#fee2e2" };
              const rows = zaznamy.map((z, i) => {
                const cas = z.cas ? new Date(z.cas).toLocaleString("cs-CZ") : "";
                const bg = AKCE_BG[z.akce] || (i%2===0?"#f8fafc":"#fff");
                const diff = (() => { try { const s = z.detail?.indexOf("{"); return s>=0 ? JSON.parse(z.detail.slice(s)) : null; } catch { return null; } })();
                const detail = diff?.zmeny?.map(x => `${FIELD_LABELS[x.pole]||x.pole}: ${x.stare} → ${x.nove}`).join("; ") || z.detail || "";
                return `<tr><td style="padding:5px 8px;background:${bg};border:1px solid #E2E8F0;font-size:10px;font-weight:700">${z.akce||""}</td><td style="padding:5px 8px;background:${i%2===0?"#f8fafc":"#fff"};border:1px solid #E2E8F0;font-size:10px;white-space:nowrap">${cas}</td><td style="padding:5px 8px;background:${i%2===0?"#f8fafc":"#fff"};border:1px solid #E2E8F0;font-size:10px">${z.uzivatel||""}</td><td style="padding:5px 8px;background:${i%2===0?"#f8fafc":"#fff"};border:1px solid #E2E8F0;font-size:10px">${detail}</td></tr>`;
              }).join("");
              const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body><table><thead>${headers}</thead><tbody>${rows}</tbody></table></body></html>`;
              const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
              const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
              a.download = `historie_${row.cislo_stavby||row.id}_${new Date().toISOString().slice(0,10)}.xls`; a.click();
            }} style={{ padding: "7px 14px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 7, color: "#4ade80", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>📊 Excel</button>
          </div>
          <button onClick={onClose} style={{ padding: "8px 20px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Zavřít</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LOG MODAL (kompletní log zakázek pro admina)
// ============================================================
function LogModal({ isDark, firmy, onClose, isDemo }) {
  const [zaznamy, setZaznamy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser]   = useState("");
  const [filterAkce, setFilterAkce]   = useState("");
  const [filterOd,   setFilterOd]     = useState("");
  const [filterDo,   setFilterDo]     = useState("");

  const AKCE_ZAKÁZKY = ["Přidání stavby","Editace stavby","Smazání stavby"];
  const [totalLoaded, setTotalLoaded] = useState(0);

  useEffect(() => {
    if (isDemo) { setLoading(false); return; } // demo — žádná DB
    const load = async () => {
      try {
        const res = await sb(`log_aktivit?order=cas.desc&limit=10000`);
        const all = res || [];
        setTotalLoaded(all.length);
        setZaznamy(all.filter(r => AKCE_ZAKÁZKY.includes(r.akce)));
      } catch { setZaznamy([]); }
      finally { setLoading(false); }
    };
    load();
  }, [isDemo]);

  const users  = [...new Set(zaznamy.map(r => r.uzivatel).filter(Boolean))];
  const akceList = [...new Set(zaznamy.map(r => r.akce).filter(Boolean))];

  const filtered = zaznamy.filter(r => {
    if (filterUser && r.uzivatel !== filterUser) return false;
    if (filterAkce && r.akce !== filterAkce) return false;
    if (filterOd) {
      const d = new Date(r.cas); const od = new Date(filterOd);
      if (d < od) return false;
    }
    if (filterDo) {
      const d = new Date(r.cas); const doo = new Date(filterDo); doo.setHours(23,59,59);
      if (d > doo) return false;
    }
    return true;
  });

  const fmtCas = (cas) => cas ? new Date(cas).toLocaleString("cs-CZ", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "";

  const parseDetail = (detail) => {
    if (!detail) return null;
    try { const s = detail.indexOf("{"); return s >= 0 ? JSON.parse(detail.slice(s)) : null; } catch { return null; }
  };

  const AKCE_STYLE = {
    "Přidání stavby":  { bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.35)",  color: "#4ade80",  pdfBg: "#dcfce7", pdfColor: "#166534" },
    "Editace stavby":  { bg: "rgba(251,191,36,0.1)",   border: "rgba(251,191,36,0.35)", color: "#fbbf24",  pdfBg: "#fef9c3", pdfColor: "#854D0E" },
    "Smazání stavby":  { bg: "rgba(239,68,68,0.1)",    border: "rgba(239,68,68,0.35)",  color: "#f87171",  pdfBg: "#fee2e2", pdfColor: "#991B1B" },
  };

  const modalBg = isDark ? "#1e293b" : "#fff";
  const textC   = isDark ? "#e2e8f0" : "#1e293b";
  const mutedC  = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.45)";
  const borderC = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const inputS  = { padding: "6px 10px", background: isDark ? "#0f172a" : "#f8fafc", border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`, borderRadius: 7, color: textC, fontSize: 12, outline: "none" };

  // ── exporty ──────────────────────────────────────────────
  const doXLSX = () => {
    const headers = `<tr><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB;font-size:11px">Akce</th><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB;font-size:11px">Datum a čas</th><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB;font-size:11px">Uživatel</th><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB;font-size:11px">Název stavby</th><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB;font-size:11px">Detail změn</th></tr>`;
    const rows = filtered.map((z, i) => {
      const diff = parseDetail(z.detail);
      const zmenyText = diff?.zmeny?.map(x => `${FIELD_LABELS[x.pole]||x.pole}: ${x.stare} → ${x.nove}`).join("; ") || z.detail || "";
      const nazev = diff?.nazev || z.detail?.replace(/^ID:\s*\d+,\s*/,"").split(" {")[0] || "";
      const rowBg = i%2===0 ? "#f8fafc" : "#fff";
      return `<tr><td style="padding:5px 10px;background:${rowBg};border:1px solid #E2E8F0;font-size:10px;font-weight:700">${z.akce||""}</td><td style="padding:5px 10px;background:${rowBg};border:1px solid #E2E8F0;font-size:10px;white-space:nowrap">${fmtCas(z.cas)}</td><td style="padding:5px 10px;background:${rowBg};border:1px solid #E2E8F0;font-size:10px">${z.uzivatel||""}</td><td style="padding:5px 10px;background:${rowBg};border:1px solid #E2E8F0;font-size:10px">${nazev}</td><td style="padding:5px 10px;background:${rowBg};border:1px solid #E2E8F0;font-size:10px">${zmenyText}</td></tr>`;
    }).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body><table><thead>${headers}</thead><tbody>${rows}</tbody></table></body></html>`;
    const ts = new Date().toISOString().slice(0,10);
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `log_zakazek_${ts}.xls`; a.click();
  };

  const doXLSColor = () => {
    const headers = `<tr><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB;font-size:11px">Akce</th><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB;font-size:11px">Datum a čas</th><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB;font-size:11px">Uživatel</th><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB;font-size:11px">Název stavby</th><th style="background:#1E3A8A;color:#fff;padding:7px 10px;border:1px solid #2563EB;font-size:11px">Detail změn</th></tr>`;
    const rows = filtered.map((z, i) => {
      const st = AKCE_STYLE[z.akce] || {};
      const diff = parseDetail(z.detail);
      const zmenyText = diff?.zmeny?.map(x => `${FIELD_LABELS[x.pole]||x.pole}: ${x.stare} → ${x.nove}`).join("; ") || z.detail || "";
      const nazev = diff?.nazev || z.detail?.replace(/^ID:\s*\d+,\s*/,"").split(" {")[0] || "";
      const rowBg = i%2===0 ? "#f8fafc" : "#fff";
      return `<tr><td style="padding:5px 10px;background:${st.pdfBg||rowBg};color:${st.pdfColor||"#1e293b"};font-weight:700;border:1px solid #E2E8F0;white-space:nowrap;font-size:10px">${z.akce||""}</td><td style="padding:5px 10px;background:${rowBg};border:1px solid #E2E8F0;white-space:nowrap;font-size:10px">${fmtCas(z.cas)}</td><td style="padding:5px 10px;background:${rowBg};border:1px solid #E2E8F0;font-size:10px">${z.uzivatel||""}</td><td style="padding:5px 10px;background:${rowBg};border:1px solid #E2E8F0;font-size:10px">${nazev}</td><td style="padding:5px 10px;background:${rowBg};border:1px solid #E2E8F0;font-size:10px">${zmenyText}</td></tr>`;
    }).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body><table><thead>${headers}</thead><tbody>${rows}</tbody></table></body></html>`;
    const ts = new Date().toISOString().slice(0,10);
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `log_zakazek_barevny_${ts}.xls`; a.click();
  };

  const doPDF = () => {
    const rows = filtered.map((z, i) => {
      const st = AKCE_STYLE[z.akce] || {};
      const diff = parseDetail(z.detail);
      const zmenyHtml = diff?.zmeny?.length
        ? `<div style="margin-top:4px;font-size:9px">${diff.zmeny.map(x => `<span style="color:#64748b">${FIELD_LABELS[x.pole]||x.pole}:</span> <span style="color:#991b1b">${x.stare}</span> → <span style="color:#166534">${x.nove}</span>`).join(" &nbsp;|&nbsp; ")}</div>`
        : `<div style="color:#64748b;font-size:9px">${z.detail||""}</div>`;
      const nazev = diff?.nazev || z.detail?.replace(/^ID:\s*\d+,\s*/,"").split(" {")[0] || "";
      const rowBg = i%2===0 ? "#f8fafc" : "#fff";
      return `<tr><td style="padding:6px 8px;background:${st.pdfBg||rowBg};color:${st.pdfColor||"#1e293b"};font-weight:700;border:1px solid #e2e8f0;white-space:nowrap;font-size:10px;vertical-align:top">${z.akce||""}</td><td style="padding:6px 8px;background:${rowBg};border:1px solid #e2e8f0;white-space:nowrap;font-size:10px;vertical-align:top">${fmtCas(z.cas)}</td><td style="padding:6px 8px;background:${rowBg};border:1px solid #e2e8f0;font-size:10px;vertical-align:top">${z.uzivatel||""}</td><td style="padding:6px 8px;background:${rowBg};border:1px solid #e2e8f0;font-size:10px;vertical-align:top"><div style="font-weight:600">${nazev}</div>${zmenyHtml}</td></tr>`;
    }).join("");
    const w = window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Log zakázek</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact}h2{margin:0 0 2px;font-size:14px}p{margin:0 0 10px;color:#64748b;font-size:10px}table{width:100%;border-collapse:collapse}th{background:#1e3a8a;color:#fff;padding:7px 10px;text-align:left;font-size:10px}@media print{button{display:none}}</style></head><body><h2>📜 Log zakázek – Stavby Znojmo</h2><p>Vygenerováno: ${new Date().toLocaleDateString("cs-CZ")} | ${filtered.length} záznamů${filterUser?" | Uživatel: "+filterUser:""}${filterAkce?" | Akce: "+filterAkce:""}</p><table><thead><tr><th>Akce</th><th>Datum a čas</th><th>Uživatel</th><th>Název stavby / Detail</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 1250, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ background: modalBg, borderRadius: 18, width: "min(900px,97vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, boxShadow: "0 32px 80px rgba(0,0,0,0.65)" }}>

        {/* header */}
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${borderC}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ color: textC, margin: 0, fontSize: 16 }}>📜 Log zakázek</h3>
            <div style={{ color: mutedC, fontSize: 12, marginTop: 2 }}>Přidání · Editace · Smazání staveb</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: mutedC, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* RLS varování pokud se zdá že vidíme jen své záznamy */}
        {!loading && totalLoaded > 0 && zaznamy.length > 0 && (() => {
          const uniqueUsers = new Set(zaznamy.map(r => r.uzivatel).filter(Boolean));
          if (uniqueUsers.size <= 1) return (
            <div style={{ margin: "10px 22px 0", padding: "10px 14px", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 8, fontSize: 11, color: "#fbbf24", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Vidíte jen záznamy jednoho uživatele — pravděpodobně blokuje RLS v Supabase.</div>
                <div style={{ color: "rgba(251,191,36,0.8)", marginBottom: 6 }}>Spusťte v Supabase Dashboard → SQL Editor:</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <code style={{ background: "rgba(0,0,0,0.3)", padding: "4px 10px", borderRadius: 5, fontFamily: "monospace", fontSize: 10, color: "#fff", flex: 1 }}>CREATE POLICY "admin_read_all" ON log_aktivit FOR SELECT USING (true);</code>
                  <button onClick={() => { navigator.clipboard.writeText('CREATE POLICY "admin_read_all" ON log_aktivit FOR SELECT USING (true);'); }} style={{ padding: "4px 10px", background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 5, color: "#fbbf24", cursor: "pointer", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>📋 Kopírovat</button>
                </div>
              </div>
            </div>
          );
          return null;
        })()}

        {/* filtry */}
        <div style={{ padding: "10px 22px", borderBottom: `1px solid ${borderC}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)} style={inputS}>
            <option value="">Všichni uživatelé</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={filterAkce} onChange={e => setFilterAkce(e.target.value)} style={inputS}>
            <option value="">Všechny akce</option>
            {akceList.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: mutedC, fontSize: 12 }}>Od:</span>
            <input type="date" value={filterOd} onChange={e => setFilterOd(e.target.value)} style={inputS} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: mutedC, fontSize: 12 }}>Do:</span>
            <input type="date" value={filterDo} onChange={e => setFilterDo(e.target.value)} style={inputS} />
          </div>
          {(filterUser||filterAkce||filterOd||filterDo) && (
            <button onClick={() => { setFilterUser(""); setFilterAkce(""); setFilterOd(""); setFilterDo(""); }} style={{ padding: "6px 12px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 7, color: "#f87171", cursor: "pointer", fontSize: 12 }}>✕ Reset</button>
          )}
          <span style={{ marginLeft: "auto", color: mutedC, fontSize: 12, fontWeight: 600 }}>{filtered.length} záznamů</span>
        </div>

        {/* seznam */}
        <div style={{ overflowY: "auto", flex: 1, padding: "12px 22px" }}>
          {loading && <div style={{ textAlign: "center", color: mutedC, padding: 40 }}>Načítám log...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 48 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
              <div style={{ color: mutedC, fontSize: 14 }}>{isDemo ? "Demo režim — log se neukládá do databáze" : "Žádné záznamy"}</div>
              {isDemo && <div style={{ color: mutedC, fontSize: 12, marginTop: 6 }}>V ostré verzi se zde zobrazí veškeré akce na zakázkách.</div>}
            </div>
          )}
          {!loading && filtered.map((z, i) => {
            const st   = AKCE_STYLE[z.akce] || { bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.2)", color: "#94a3b8" };
            const diff = parseDetail(z.detail);
            const nazev = diff?.nazev || z.detail?.replace(/^ID:\s*\d+,\s*/,"").split(" {")[0] || "";
            return (
              <div key={i} style={{ marginBottom: 8, padding: "10px 14px", background: st.bg, border: `1px solid ${st.border}`, borderRadius: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ color: st.color, fontWeight: 700, fontSize: 12 }}>{z.akce}</span>
                    {nazev && <span style={{ color: textC, fontSize: 12, fontWeight: 600 }}>· {nazev}</span>}
                    <span style={{ color: mutedC, fontSize: 11 }}>— {z.uzivatel}</span>
                  </div>
                  <span style={{ color: mutedC, fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>{fmtCas(z.cas)}</span>
                </div>
                {diff?.zmeny?.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                    {diff.zmeny.map((x, j) => (
                      <span key={j} style={{ fontSize: 11, color: mutedC }}>
                        <span style={{ fontWeight: 600, color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)" }}>{FIELD_LABELS[x.pole]||x.pole}:</span>{" "}
                        <span style={{ color: "#f87171" }}>{String(x.stare||"–")}</span>{" → "}
                        <span style={{ color: "#4ade80" }}>{String(x.nove||"–")}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* footer — exporty */}
        <div style={{ padding: "12px 22px", borderTop: `1px solid ${borderC}`, display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={doXLSX}     style={{ padding: "7px 14px", background: "rgba(34,197,94,0.12)",  border: "1px solid rgba(34,197,94,0.3)",  borderRadius: 7, color: "#4ade80", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>📊 XLSX</button>
            <button onClick={doXLSColor} style={{ padding: "7px 14px", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 7, color: "#fbbf24", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🎨 Barevný Excel</button>
            <button onClick={doPDF}      style={{ padding: "7px 14px", background: "rgba(239,68,68,0.12)",  border: "1px solid rgba(239,68,68,0.3)",  borderRadius: 7, color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🖨️ PDF tisk</button>
          </div>
          <button onClick={onClose} style={{ padding: "8px 20px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Zavřít</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GRAF MODAL
// ============================================================
function GrafModal({ data, firmy, isDark, onClose }) {
  const [mode, setMode] = useState("firma"); // "firma" | "mesic" | "kat"

  const firmaColorMap = Object.fromEntries(firmy.map(f => [f.hodnota, f.barva || "#3b82f6"]));

  // KAT I = ps_i + snk_i + bo_i   |   KAT II = ps_ii + bo_ii + poruch
  const katI  = r => (Number(r.ps_i)||0) + (Number(r.snk_i)||0) + (Number(r.bo_i)||0);
  const katII = r => (Number(r.ps_ii)||0) + (Number(r.bo_ii)||0) + (Number(r.poruch)||0);

  const grafData = useMemo(() => {
    if (mode === "firma") {
      const map = {};
      data.forEach(r => {
        const key = r.firma || "Bez firmy";
        if (!map[key]) map[key] = { name: key, nabidka: 0, vyfakturovano: 0, zrealizovano: 0 };
        map[key].nabidka      += Number(r.nabidka) || 0;
        map[key].vyfakturovano += Number(r.vyfakturovano) || 0;
        map[key].zrealizovano  += Number(r.zrealizovano) || 0;
      });
      return Object.values(map);
    } else if (mode === "mesic") {
      const map = {};
      data.forEach(r => {
        if (!r.ze_dne) return;
        const parts = r.ze_dne.trim().split(".");
        if (parts.length < 3) return;
        const key   = `${parts[2]}-${parts[1].padStart(2,"0")}`;
        const label = `${parts[1]}/${parts[2]}`;
        if (!map[key]) map[key] = { name: label, _sort: key, nabidka: 0, vyfakturovano: 0, zrealizovano: 0 };
        map[key].nabidka      += Number(r.nabidka) || 0;
        map[key].vyfakturovano += Number(r.vyfakturovano) || 0;
        map[key].zrealizovano  += Number(r.zrealizovano) || 0;
      });
      return Object.values(map).sort((a, b) => a._sort.localeCompare(b._sort));
    } else {
      // mode === "kat" — každá firma, rozpad na jednotlivé složky
      const firmaKeys = [...new Set(data.map(r => r.firma || "Bez firmy"))];
      return firmaKeys.map(firma => {
        const rows = data.filter(r => (r.firma || "Bez firmy") === firma);
        return {
          name: firma,
          ps_i:  rows.reduce((s,r) => s+(Number(r.ps_i)||0),  0),
          snk_i: rows.reduce((s,r) => s+(Number(r.snk_i)||0), 0),
          bo_i:  rows.reduce((s,r) => s+(Number(r.bo_i)||0),  0),
          ps_ii: rows.reduce((s,r) => s+(Number(r.ps_ii)||0), 0),
          bo_ii: rows.reduce((s,r) => s+(Number(r.bo_ii)||0), 0),
          poruch:rows.reduce((s,r) => s+(Number(r.poruch)||0),0),
          kat1:  rows.reduce((s,r) => s+katI(r),  0),
          kat2:  rows.reduce((s,r) => s+katII(r), 0),
        };
      });
    }
  }, [data, mode]);

  const fmtTick = (v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v);
  const fmtVal  = (v) => Number(v).toLocaleString("cs-CZ", { minimumFractionDigits: 0 });

  const modalBg = isDark ? "#1e293b" : "#fff";
  const textC   = isDark ? "#e2e8f0" : "#1e293b";
  const mutedC  = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  const gridC   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  const renderBars = () => {
    const isKat  = mode === "kat";
    // Kat mode: 2 skupiny sloupků (I a II), každá stacked ze složek
    // Složky Kat. I: ps_i=#818cf8, snk_i=#38bdf8, bo_i=#4ade80
    // Složky Kat. II: ps_ii=#fb923c, bo_ii=#f87171, poruch=#e879f9
    const KAT_I_KEYS   = ["ps_i","snk_i","bo_i"];
    const KAT_II_KEYS  = ["ps_ii","bo_ii","poruch"];
    const KAT_I_COLORS = ["#818cf8","#38bdf8","#4ade80"];
    const KAT_II_COLORS= ["#fb923c","#f87171","#e879f9"];
    const KAT_I_LABELS = ["Plán. I","SNK","Běžné op. I"];
    const KAT_II_LABELS= ["Plán. II","Běžné op. II","Poruchy"];

    const KEYS    = isKat ? ["kat1","kat2"] : ["nabidka","vyfakturovano","zrealizovano"];
    const LABELS  = isKat ? ["Kat. I","Kat. II"] : ["Nabídka","Vyfakturováno","Zrealizováno"];
    const COLORS  = isKat ? ["#818cf8","#fb923c"] : ["#60a5fa","#4ade80","#fbbf24"];

    const maxVal = Math.max(...grafData.map(d => isKat
      ? Math.max(
          KAT_I_KEYS.reduce((s,k)=>s+(d[k]||0),0),
          KAT_II_KEYS.reduce((s,k)=>s+(d[k]||0),0)
        )
      : Math.max(...KEYS.map(k => d[k] || 0))
    ), 1);

    const W = 700, H = 280, PAD_L = 68, PAD_B = 30, PAD_T = 20, PAD_R = 20;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;
    const groupW = chartW / Math.max(grafData.length, 1);
    const numBars = isKat ? 2 : KEYS.length;
    const barW = Math.min(Math.max(10, groupW / (numBars + 1) - 2), 36);
    const scaleY = v => PAD_T + chartH - (v / maxVal) * chartH;
    const offsets = Array.from({length: numBars}, (_,ki) => (ki - (numBars-1)/2) * (barW + 4));

    return (
      <>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 280, minWidth: 500 }}>
        {/* grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(p => {
          const y = PAD_T + p * chartH;
          return <g key={p}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke={gridC} strokeWidth={1}/>
            <text x={PAD_L - 6} y={y + 4} textAnchor="end" fill={mutedC} fontSize={9}>{fmtTick(maxVal * (1 - p))}</text>
          </g>;
        })}
        <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + chartH} y2={PAD_T + chartH} stroke={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} strokeWidth={1}/>
        {/* bars */}
        {grafData.map((d, gi) => {
          const cx = PAD_L + gi * groupW + groupW / 2;
          if (isKat) {
            // Stacked bars pro KAT I a KAT II
            return [
              { keys: KAT_I_KEYS,  colors: KAT_I_COLORS,  off: offsets[0] },
              { keys: KAT_II_KEYS, colors: KAT_II_COLORS, off: offsets[1] },
            ].map(({ keys, colors, off }, gi2) => {
              let stackY = PAD_T + chartH;
              return keys.map((k, ki) => {
                const val = d[k] || 0;
                if (val <= 0) return null;
                const bh = Math.max(2, (val / maxVal) * chartH);
                stackY -= bh;
                return <rect key={k} x={cx + off - barW/2} y={stackY} width={barW} height={bh} fill={colors[ki]} rx={ki === keys.length-1 ? 3 : 0} opacity={0.9}/>;
              });
            });
          }
          // Normal grouped bars
          return KEYS.map((k, ki) => {
            const val = d[k] || 0;
            const bh  = Math.max(1, (val / maxVal) * chartH);
            const by  = scaleY(val);
            const bx  = cx + offsets[ki];
            const fill = mode === "firma" && ki === 0 ? (firmaColorMap[d.name] || COLORS[0]) : COLORS[ki];
            return <rect key={k} x={bx - barW/2} y={by} width={barW} height={bh} fill={fill} rx={3} opacity={0.88}/>;
          });
        })}
        {/* x labels */}
        {grafData.map((d, gi) => {
          const cx  = PAD_L + gi * groupW + groupW / 2;
          const lbl = d.name.length > 16 ? d.name.slice(0, 15) + "…" : d.name;
          return <text key={gi} x={cx} y={H - PAD_B + 18} textAnchor="middle" fill={mutedC} fontSize={11} fontWeight={600}>{lbl}</text>;
        })}
        {/* legend */}
        {isKat ? (
          <g>
            {/* legend moved to HTML below SVG */}
          </g>
        ) : null}
      </svg>
      {/* HTML Legend */}
      {isKat ? (
        <div style={{ display: "flex", gap: 24, padding: "10px 16px 4px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: isDark ? "#818cf8" : "#4f46e5", marginBottom: 5, letterSpacing: 0.5 }}>── KAT. I ──</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {KAT_I_LABELS.map((l,i) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 11, height: 11, borderRadius: 3, background: KAT_I_COLORS[i], flexShrink: 0 }}/>
                  <span style={{ fontSize: 11, color: mutedC }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: isDark ? "#fb923c" : "#ea580c", marginBottom: 5, letterSpacing: 0.5 }}>── KAT. II ──</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {KAT_II_LABELS.map((l,i) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 11, height: 11, borderRadius: 3, background: KAT_II_COLORS[i], flexShrink: 0 }}/>
                  <span style={{ fontSize: 11, color: mutedC }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 14, padding: "10px 16px 4px", flexWrap: "wrap" }}>
          {LABELS.map((l,i) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 11, height: 11, borderRadius: 3, background: COLORS[i], flexShrink: 0 }}/>
              <span style={{ fontSize: 11, color: mutedC }}>{l}</span>
            </div>
          ))}
        </div>
      )}
      </>
    );
  };

  // Souhrn pro kat mode — speciální struktura
  const renderTable = () => {
    if (mode === "kat") {
      const cols = [
        { key: "ps_i",   label: "Plán. I",     color: "#818cf8" },
        { key: "snk_i",  label: "SNK",          color: "#38bdf8" },
        { key: "bo_i",   label: "Běžné op. I",  color: "#4ade80" },
        { key: "ps_ii",  label: "Plán. II",     color: "#fb923c" },
        { key: "bo_ii",  label: "Běžné op. II", color: "#f87171" },
        { key: "poruch", label: "Poruchy",       color: "#e879f9" },
      ];
      return (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>
              <th style={{ padding: "7px 10px", textAlign: "left", color: mutedC, fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}` }}>Firma</th>
              {cols.map(c => (
                <th key={c.key} style={{ padding: "7px 8px", textAlign: "right", color: c.color, fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, whiteSpace: "nowrap" }}>{c.label}</th>
              ))}
              <th style={{ padding: "7px 10px", textAlign: "right", color: "#818cf8", fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}` }}>Kat. I</th>
              <th style={{ padding: "7px 10px", textAlign: "right", color: "#fb923c", fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}` }}>Kat. II</th>
              <th style={{ padding: "7px 10px", textAlign: "right", color: isDark ? "#93c5fd" : "#2563eb", fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}` }}>Celkem</th>
            </tr>
          </thead>
          <tbody>
            {grafData.map((d, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}` }}>
                <td style={{ padding: "5px 10px", color: textC, fontWeight: 600, whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: firmaColorMap[d.name] || "#3b82f6", marginRight: 6, verticalAlign: "middle" }}/>
                  {d.name}
                </td>
                {cols.map(c => (
                  <td key={c.key} style={{ padding: "5px 8px", textAlign: "right", color: d[c.key] > 0 ? c.color : mutedC, fontFamily: "monospace", fontSize: 11 }}>{d[c.key] > 0 ? fmtVal(d[c.key]) : "—"}</td>
                ))}
                <td style={{ padding: "5px 10px", textAlign: "right", color: "#818cf8", fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>{fmtVal(d.kat1)}</td>
                <td style={{ padding: "5px 10px", textAlign: "right", color: "#fb923c", fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>{fmtVal(d.kat2)}</td>
                <td style={{ padding: "5px 10px", textAlign: "right", color: isDark ? "#93c5fd" : "#2563eb", fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>{fmtVal((d.kat1||0)+(d.kat2||0))}</td>
              </tr>
            ))}
            <tr style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
              <td style={{ padding: "6px 10px", color: textC, fontWeight: 700, fontSize: 11 }}>CELKEM</td>
              {cols.map(c => (
                <td key={c.key} style={{ padding: "6px 8px", textAlign: "right", color: c.color, fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>{fmtVal(grafData.reduce((s,d)=>s+(d[c.key]||0),0))}</td>
              ))}
              <td style={{ padding: "6px 10px", textAlign: "right", color: "#818cf8", fontFamily: "monospace", fontWeight: 700 }}>{fmtVal(grafData.reduce((s,d)=>s+(d.kat1||0),0))}</td>
              <td style={{ padding: "6px 10px", textAlign: "right", color: "#fb923c", fontFamily: "monospace", fontWeight: 700 }}>{fmtVal(grafData.reduce((s,d)=>s+(d.kat2||0),0))}</td>
              <td style={{ padding: "6px 10px", textAlign: "right", color: isDark ? "#93c5fd" : "#2563eb", fontFamily: "monospace", fontWeight: 700 }}>{fmtVal(grafData.reduce((s,d)=>s+(d.kat1||0)+(d.kat2||0),0))}</td>
            </tr>
          </tbody>
        </table>
      );
    }
    // standardní tabulka
    return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>
            {[mode === "firma" ? "Firma" : "Měsíc", "Nabídka", "Vyfakturováno", "Zrealizováno"].map((h, i) => (
              <th key={h} style={{ padding: "7px 12px", textAlign: i === 0 ? "left" : "right", color: mutedC, fontWeight: 700, fontSize: 11, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grafData.map((d, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}` }}>
              <td style={{ padding: "6px 12px", color: textC, fontWeight: 600 }}>
                {mode === "firma" && <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: firmaColorMap[d.name] || "#3b82f6", marginRight: 7, verticalAlign: "middle" }}/>}
                {d.name}
              </td>
              {["nabidka","vyfakturovano","zrealizovano"].map(k => (
                <td key={k} style={{ padding: "6px 12px", textAlign: "right", color: isDark ? "#93c5fd" : "#2563eb", fontFamily: "monospace", fontSize: 12 }}>
                  {fmtVal(d[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ background: modalBg, borderRadius: 18, width: "min(1100px,97vw)", maxHeight: "95vh", display: "flex", flexDirection: "column", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
        {/* header */}
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ color: textC, margin: 0, fontSize: 16 }}>📊 Graf nákladů</h3>
            <div style={{ color: mutedC, fontSize: 11, marginTop: 2 }}>
              {mode === "kat" ? "Kat. I (Plán.+SNK+Běžné op.) vs Kat. II (Plán.+Běžné op.+Poruchy)" : "Nabídka · Vyfakturováno · Zrealizováno"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 8, overflow: "hidden" }}>
              {[["firma","🏢 Firma"],["mesic","📅 Měsíc"],["kat","📂 Kat. I / II"]].map(([val, lbl]) => (
                <button key={val} onClick={() => setMode(val)} style={{ padding: "6px 13px", background: mode === val ? (isDark ? "rgba(37,99,235,0.4)" : "rgba(37,99,235,0.15)") : "transparent", border: "none", borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`, color: mode === val ? "#60a5fa" : mutedC, cursor: "pointer", fontSize: 12, fontWeight: mode === val ? 700 : 400, transition: "all 0.15s", whiteSpace: "nowrap" }}>{lbl}</button>
              ))}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: mutedC, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>
        </div>
        {/* graf */}
        <div style={{ padding: "16px 22px 8px", overflowX: "auto", overflowY: "hidden", flexShrink: 0 }}>
          {grafData.length === 0
            ? <div style={{ textAlign: "center", color: mutedC, padding: 48 }}>Žádná data k zobrazení</div>
            : renderBars()
          }
        </div>
        {/* tabulka */}
        <div style={{ padding: "0 22px 18px", flex: 1, overflowY: "auto", overflowX: "auto" }}>
          {renderTable()}
        </div>
      </div>
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
      if (email.trim().toLowerCase() === "demo" && pass === "demo") {
        onLogin(DEMO_USER);
        return;
      }
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
        <div style={{ marginTop: 16, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 12 }}>
          Zapomenuté heslo? Kontaktuj administrátora.
        </div>
        <div style={{ marginTop: 16, padding: "16px 18px", background: "rgba(251,191,36,0.18)", border: "2px solid rgba(251,191,36,0.7)", borderRadius: 10, textAlign: "center" }}>
          <div style={{ color: "#fbbf24", fontSize: 13, fontWeight: 800, marginBottom: 8, letterSpacing: 0.5 }}>🎮 DEMO PŘÍSTUP</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 7, padding: "5px 14px" }}>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, display: "block", marginBottom: 1 }}>email</span>
              <span style={{ color: "#fff", fontSize: 15, fontWeight: 800, letterSpacing: 1 }}>demo</span>
            </div>
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 7, padding: "5px 14px" }}>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, display: "block", marginBottom: 1 }}>heslo</span>
              <span style={{ color: "#fff", fontSize: 15, fontWeight: 800, letterSpacing: 1 }}>demo</span>
            </div>
          </div>
          <div style={{ color: "#fde68a", fontSize: 11, marginTop: 8, fontWeight: 600 }}>Plný přístup admin · Data se neukládají · Max 15 staveb</div>
        </div>

      </div>
    </div>
  );
}

// ============================================================
// SUMMARY CARDS
// ============================================================
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

  // Číslo 0 zobrazuj jako prázdné pole
  const displayValue = type === "number" && (value === 0 || value === "0") ? "" : (value ?? "");

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

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      // Najdi všechny focusovatelné inputy ve formuláři
      const modal = e.target.closest("[data-modal]");
      if (!modal) return;
      const inputs = Array.from(modal.querySelectorAll("input:not([disabled]), select:not([disabled])"));
      const idx = inputs.indexOf(e.target);
      if (e.key === "Enter") {
        e.preventDefault();
        if (idx < inputs.length - 1) inputs[idx + 1].focus();
      }
      // Tab necháme výchozí chování
    }
  };

  return (
    <div style={full ? { gridColumn: "1 / -1" } : {}}>
      <Lbl>{label}{type === "number" && <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, marginLeft: 4 }}>123</span>}{type === "date" && <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, marginLeft: 4 }}>DD.MM.RRRR</span>}</Lbl>
      <input
        type="text"
        value={displayValue}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
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

  const handleSave = () => {
    for (const k of NUM_FIELDS) {
      const v = form[k];
      if (v !== "" && v != null && isNaN(String(v).replace(",", "."))) {
        setSaveErr(`Pole "${k}" musí být číslo!`);
        return;
      }
    }
    for (const k of DATE_FIELDS) {
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
          <input onMouseDown={e => e.stopPropagation()} value={form["nazev_stavby"] ?? ""} onChange={e => set("nazev_stavby", e.target.value)} placeholder="Název stavby..." onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const modal = e.target.closest("[data-modal]"); if (modal) { const inputs = Array.from(modal.querySelectorAll("input:not([disabled]),select:not([disabled])")); const idx = inputs.indexOf(e.target); if (idx < inputs.length - 1) inputs[idx + 1].focus(); } } }} style={{ flex: 1, padding: "7px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#fff", fontSize: 15, fontWeight: 600, outline: "none", cursor: "text" }} />
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
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, borderLeft: "3px solid #f59e0b", paddingLeft: 8, opacity: 0.7 }}>FAKTURA 2</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <FormField label="Č. faktury 2" value={form["cislo_faktury_2"]} onChange={v => set("cislo_faktury_2", v)} />
                <FormField label="Částka bez DPH 2" value={form["castka_bez_dph_2"]} onChange={v => set("castka_bez_dph_2", v)} type="number" />
                <FormField label="Splatná 2" value={form["splatna_2"]} onChange={v => set("splatna_2", v)} type="date" />
              </div>
            </div>
          </div>
        </div>

        {/* Poznámka */}
        <div style={{ padding: "0 24px 12px" }}>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, borderLeft: "3px solid #a78bfa", paddingLeft: 8 }}>💬 POZNÁMKA</div>
            <textarea
              value={form["poznamka"] || ""}
              onChange={e => set("poznamka", e.target.value)}
              placeholder="Volný komentář ke stavbě..."
              rows={3}
              style={{ width: "100%", padding: "9px 11px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
            />
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

function FirmyEditor({ list, setList, isDark, onNvChange, stavbyData }) {
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

function SettingsModal({ firmy, objednatele, stavbyvedouci, users, onChange, onChangeUsers, onClose, onLoadLog, isAdmin, isSuperAdmin, isDark, appVerze, appDatum, onSaveAppInfo, stavbyData, onResetColWidths, isDemo }) {
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
  const [editUserId, setEditUserId] = useState(null);
  const [editUserPass, setEditUserPass] = useState("");
  const [editUserRole, setEditUserRole] = useState("");

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
    if (isDemo) { setLocalLogData([]); return; }
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
    ...(isAdmin ? [{ key: "uzivatele", label: "👥 Uživatelé" }] : []),
    ...(isAdmin ? [{ key: "log", label: "📜 Log aktivit" }] : []),
    ...(isSuperAdmin ? [{ key: "aplikace", label: "⚙️ Aplikace" }] : []),
  ];
  const [editVerze, setEditVerze] = useState(appVerze);
  const [confirmResetCols, setConfirmResetCols] = useState(false);
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
                {uList.filter(u => !isAdmin || isSuperAdmin ? true : u.role !== "superadmin").map(u => {
                  const roleLabel = u.role === "superadmin" ? "SUPERADMIN" : u.role === "admin" ? "ADMIN" : u.role === "user_e" ? "USER EDITOR" : "USER";
                  const roleColor = u.role === "superadmin" ? "#c084fc" : u.role === "admin" ? "#fbbf24" : u.role === "user_e" ? "#4ade80" : "#94a3b8";
                  const roleBg = u.role === "superadmin" ? "rgba(168,85,247,0.2)" : u.role === "admin" ? "rgba(245,158,11,0.2)" : u.role === "user_e" ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.15)";
                  const icon = u.role === "superadmin" ? "⚡" : u.role === "admin" ? "👑" : u.role === "user_e" ? "✏️" : "👤";
                  return (
                    <div key={u.id}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: roleBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: modalText, fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{u.email}</div>
                        </div>
                        <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: roleBg, color: roleColor }}>{roleLabel}</span>
                        <button onClick={() => { setEditUserId(editUserId === u.id ? null : u.id); setEditUserPass(""); setEditUserRole(u.role); }} style={{ background: "none", border: "none", color: editUserId === u.id ? "#fbbf24" : "#60a5fa", cursor: "pointer", fontSize: 14, padding: "0 4px" }} title="Upravit">✏️</button>
                        <button onClick={() => removeUser(u.id)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 16, padding: "0 4px" }} title="Smazat">✕</button>
                      </div>
                      {editUserId === u.id && (
                        <div style={{ margin: "4px 0 2px 0", padding: "10px 14px", background: "rgba(37,99,235,0.08)", borderRadius: 8, border: "1px solid rgba(37,99,235,0.2)", display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ color: "#60a5fa", fontSize: 11, fontWeight: 700 }}>UPRAVIT UŽIVATELE</div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, minWidth: 70 }}>Nové heslo:</span>
                            <input type="password" value={editUserPass} onChange={e => setEditUserPass(e.target.value)} placeholder="nové heslo (prázdné = beze změny)" style={{ flex: 1, padding: "6px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fff", fontSize: 12 }} />
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, minWidth: 70 }}>Role:</span>
                            <select value={editUserRole} onChange={e => setEditUserRole(e.target.value)} style={{ flex: 1, padding: "6px 10px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fff", fontSize: 12 }}>
                              <option value="user">USER</option>
                              <option value="user_e">USER EDITOR</option>
                              <option value="admin">ADMIN</option>
                              {isSuperAdmin && <option value="superadmin">SUPERADMIN</option>}
                            </select>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => { setUList(uList.map(x => x.id === u.id ? { ...x, password: editUserPass.trim() || x.password, role: editUserRole } : x)); setEditUserId(null); }} style={{ padding: "6px 14px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>💾 Uložit</button>
                            <button onClick={() => setEditUserId(null)} style={{ padding: "6px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12 }}>Zrušit</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "aplikace" && isSuperAdmin && (
            <div style={{ padding: "10px 0", maxWidth: 400 }}>
              <div style={{ color: modalMuted, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 20 }}>INFORMACE O APLIKACI</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                <div style={{ borderTop: `1px solid ${modalBorder}`, paddingTop: 16, marginTop: 8 }}>
                  <div style={{ color: modalMuted, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>ŠÍŘKY SLOUPCŮ</div>
                  <button onClick={() => setConfirmResetCols(true)} style={{ padding: "10px 20px", background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.35)", borderRadius: 8, color: "#c084fc", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>↺ Reset šířek sloupců na výchozí</button>
                  <div style={{ color: modalMuted, fontSize: 11, marginTop: 8 }}>Obnoví původní šířky všech sloupců tabulky.</div>
                </div>
              </div>
            </div>
          )}

          {tab === "log" && (
            <div>
              {isDemo && (
                <div style={{ marginBottom: 14, padding: "12px 16px", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 8, color: "#fbbf24", fontSize: 12, display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>🎮</span>
                  <div><strong>Demo režim</strong> — log aktivit se neukládá do databáze. V ostré verzi se zde zobrazí přihlášení, editace, smazání a veškeré akce všech uživatelů.</div>
                </div>
              )}
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

          {/* Potvrzovací dialog reset šířek */}
          {confirmResetCols && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: isDark ? "#1e293b" : "#fff", borderRadius: 14, padding: "28px 32px", width: 360, border: "1px solid rgba(168,85,247,0.3)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)", textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>↺</div>
                <div style={{ color: isDark ? "#f8fafc" : "#1e293b", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Reset šířek sloupců?</div>
                <div style={{ color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", fontSize: 13, marginBottom: 24 }}>Všechny šířky sloupců se obnoví na výchozí hodnoty. Tuto akci nelze vrátit.</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button onClick={() => setConfirmResetCols(false)} style={{ padding: "9px 20px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, borderRadius: 8, color: isDark ? "#fff" : "#1e293b", cursor: "pointer", fontSize: 13 }}>Zrušit</button>
                  <button onClick={() => { onResetColWidths(); setConfirmResetCols(false); onClose(); }} style={{ padding: "9px 20px", background: "linear-gradient(135deg,#7c3aed,#6d28d9)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Ano, resetovat</button>
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
// MOBILE HOOK
// ============================================================
function useIsMobile(breakpoint = 768) {
  const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
  const [isMobile, setIsMobile] = useState(() => mq.matches);
  useEffect(() => {
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

// ============================================================
// STAVBA CARD (mobilní kartička)
// ============================================================
function StavbaCard({ row, isEditor, isAdmin, isDark, firmy, onEdit, onCopy, onDelete, onHistorie, showTooltip, hideTooltip }) {
  const firmaColor = (firmy.find(f => f.hodnota === row.firma)?.barva) || "#3b82f6";

  const parseDatumCard = (s) => {
    if (!s) return null;
    const p = s.trim().split(".");
    if (p.length !== 3) return null;
    const d = new Date(`${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`);
    return isNaN(d) ? null : d;
  };

  const termínBadge = () => {
    if (!row.ukonceni) return null;
    const datum = parseDatumCard(row.ukonceni);
    if (!datum) return null;
    const dnes = new Date(); dnes.setHours(0,0,0,0);
    const isFak = row.cislo_faktury && row.cislo_faktury.trim() !== "" && Number(row.castka_bez_dph) !== 0 && row.splatna;
    if (isFak) return { label: "vyfakturováno", bg: "rgba(34,197,94,0.15)", color: "#4ade80", border: "rgba(34,197,94,0.4)" };
    if (datum < dnes) return { label: "⚠️ prošlý termín", bg: "rgba(239,68,68,0.15)", color: "#f87171", border: "rgba(239,68,68,0.4)" };
    const diff = Math.round((datum - dnes) / 86400000);
    if (diff <= 10) return { label: `za ${diff} dní`, bg: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "rgba(251,191,36,0.4)" };
    return null;
  };

  const badge = termínBadge();
  const cardBg = isDark ? "#1e293b" : "#ffffff";
  const borderC = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const textC = isDark ? "#e2e8f0" : "#1e293b";
  const mutedC = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const metricBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  const dividerC = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  return (
    <div style={{ background: cardBg, borderRadius: 14, border: `1px solid ${borderC}`, fontFamily: "'Segoe UI',sans-serif" }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", borderBottom: `1px solid ${dividerC}` }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: firmaColor, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: firmaColor }}>{row.firma || "—"}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: mutedC }}>{row.cislo_stavby || ""}</span>
      </div>

      {/* název */}
      <div style={{ padding: "10px 14px 8px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: textC, lineHeight: 1.35, marginBottom: 10 }}>{row.nazev_stavby || "—"}</div>

        {/* metriky */}
        <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
          {[
            { label: "nabídka", val: row.nabidka },
            { label: "vyfakt.", val: row.vyfakturovano, green: Number(row.vyfakturovano) > 0 },
            { label: "rozdíl", val: row.rozdil, colored: true },
          ].map(m => (
            <div key={m.label} style={{ flex: 1, background: metricBg, borderRadius: 8, padding: "7px 9px" }}>
              <div style={{ fontSize: 10, color: mutedC, marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: m.colored ? (Number(m.val) >= 0 ? "#4ade80" : "#f87171") : m.green ? "#4ade80" : textC }}>
                {m.val != null && m.val !== "" && Number(m.val) !== 0 ? Number(m.val).toLocaleString("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "—"}
              </div>
            </div>
          ))}
        </div>

        {/* termín + badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: mutedC }}>{row.ukonceni ? `ukončení: ${row.ukonceni}` : "bez termínu"}</span>
          {badge && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</span>}
        </div>
      </div>

      {/* poznámka */}
      {row.poznamka && row.poznamka.trim() !== "" && (
        <div style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "6px 14px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderTop: `1px solid ${dividerC}` }}>
          <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>💬</span>
          <span style={{ fontSize: 11, color: mutedC, lineHeight: 1.5 }}>{row.poznamka}</span>
        </div>
      )}

      {/* faktury */}
      {row.cislo_faktury && row.cislo_faktury.trim() !== "" && (
        <div style={{ padding: "7px 14px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", borderTop: `1px solid ${dividerC}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", flexShrink: 0, marginTop: 1, textShadow: "0 0 6px rgba(239,68,68,0.5)" }}>e</span>
            <span style={{ fontSize: 11, color: mutedC, lineHeight: 1.6 }}>
              <span style={{ color: textC, fontWeight: 600 }}>{row.cislo_faktury}</span>
              {Number(row.castka_bez_dph) > 0 && <> · {Number(row.castka_bez_dph).toLocaleString("cs-CZ")} Kč</>}
              {row.splatna && <> · spl. {row.splatna}</>}
            </span>
          </div>
          {row.cislo_faktury_2 && row.cislo_faktury_2.trim() !== "" && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: 5, paddingTop: 5, borderTop: `1px dashed ${dividerC}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#facc15", flexShrink: 0, marginTop: 1, textShadow: "0 0 6px rgba(250,204,21,0.5)" }}>S</span>
              <span style={{ fontSize: 11, color: mutedC, lineHeight: 1.6 }}>
                <span style={{ color: textC, fontWeight: 600 }}>{row.cislo_faktury_2}</span>
                {Number(row.castka_bez_dph_2) > 0 && <> · {Number(row.castka_bez_dph_2).toLocaleString("cs-CZ")} Kč</>}
                {row.splatna_2 && <> · spl. {row.splatna_2}</>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* akce */}
      {(isEditor || isAdmin) && (
        <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderTop: `1px solid ${dividerC}`, flexWrap: "wrap" }}>
          <button onClick={() => onHistorie(row)} style={{ padding: "4px 10px", background: "transparent", border: `1px solid ${borderC}`, borderRadius: 6, color: mutedC, cursor: "pointer", fontSize: 11 }}>🕐 hist.</button>
          <button onClick={() => onCopy(row)} style={{ padding: "4px 10px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 6, color: "#34d399", cursor: "pointer", fontSize: 11 }}>📋</button>
          <button onClick={() => onEdit(row)} style={{ padding: "4px 10px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 6, color: "#60a5fa", cursor: "pointer", fontSize: 11, marginLeft: "auto" }}>✏️ editovat</button>
          {isAdmin && <button onClick={() => onDelete(row.id)} style={{ padding: "4px 10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#f87171", cursor: "pointer", fontSize: 11 }}>🗑️</button>}
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
  const [showAdvFilter, setShowAdvFilter] = useState(false);
  const [filterRok, setFilterRok] = useState("");
  const [filterCastkaOd, setFilterCastkaOd] = useState("");
  const [filterCastkaDo, setFilterCastkaDo] = useState("");
  const [filterProslé, setFilterProslé] = useState(false);
  const [filterFakturace, setFilterFakturace] = useState("");
  const [filterKat, setFilterKat] = useState("");
  const [advFilterPos, setAdvFilterPos] = useState({ x: Math.max(20, window.innerWidth/2 - 220), y: 120 });
  const onAdvFilterDragStart = (e) => {
    e.preventDefault();
    const startX = e.clientX - advFilterPos.x, startY = e.clientY - advFilterPos.y;
    const onMove = (ev) => setAdvFilterPos({ x: Math.max(0, Math.min(window.innerWidth-100, ev.clientX-startX)), y: Math.max(0, Math.min(window.innerHeight-60, ev.clientY-startY)) });
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const [editRow, setEditRow] = useState(null);
  const [adding, setAdding] = useState(false);
  const [copyRow, setCopyRow] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const isMobile = useIsMobile(768);
  const [cardView, setCardView] = useState(() => window.matchMedia("(max-width: 767px)").matches);

  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpPos, setHelpPos] = useState({ x: Math.max(20, window.innerWidth/2 - 350), y: 60 });
  const helpDragRef = useRef(null);
  const onHelpDragStart = (e) => {
    e.preventDefault();
    const startX = e.clientX - helpPos.x, startY = e.clientY - helpPos.y;
    const onMove = (ev) => setHelpPos({ x: Math.max(0, Math.min(window.innerWidth-100, ev.clientX-startX)), y: Math.max(0, Math.min(window.innerHeight-60, ev.clientY-startY)) });
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // ── Graf ──────────────────────────────────────────────────
  const [showGraf, setShowGraf] = useState(false);
  // ── Log zakázek ──────────────────────────────────────────
  const [showLog, setShowLog] = useState(false);
  // ── Historie změn ────────────────────────────────────────
  const [historieRow, setHistorieRow] = useState(null);
  // ── Tečka v historii — svítí permanentně pokud má stavba záznamy v logu ──
  const [historieNovinky, setHistorieNovinky] = useState({});
  useEffect(() => {
    if (!user || user.email === "demo") return;
    const checkNovinky = async () => {
      try {
        const res = await sb(`log_aktivit?order=cas.desc&limit=5000`);
        const novinky = {};
        (res || []).forEach(r => {
          // Editace/Smazání — ID na začátku detailu
          const match = r.detail?.match(/^ID:\s*(\d+)[,\s]/);
          if (match) novinky[match[1]] = true;
        });
        setHistorieNovinky(novinky);
      } catch { /* tiché selhání */ }
    };
    checkNovinky();
  }, [user]);
  // ── Auto-logout ──────────────────────────────────────────
  const [autoLogoutWarning, setAutoLogoutWarning] = useState(false);
  const [autoLogoutCountdown, setAutoLogoutCountdown] = useState(60);
  const autoLogoutTimer = useRef(null);
  const autoLogoutCountdownTimer = useRef(null);
  const AUTO_LOGOUT_MINUTES = 15;
  // ── Browser notifikace ───────────────────────────────────
  const notifPermission = useRef(null);
  const notifSentRef = useRef(false);
  const notifIntervalRef = useRef(null);
  const [tooltip, setTooltip] = useState({ visible: false, text: "", x: 0, y: 0 });
  const tooltipTimer = useRef(null);
  const showTooltip = (e, text) => {
    const r = e.currentTarget.getBoundingClientRect();
    tooltipTimer.current = setTimeout(() => {
      setTooltip({ visible: true, text, x: r.left + r.width / 2, y: r.bottom + 6 });
    }, 600);
  };
  const hideTooltip = () => { clearTimeout(tooltipTimer.current); setTooltip(t => ({ ...t, visible: false })); };
  // ── inline editing odstraněno – editace přes tlačítko ✏️
  const [showExport, setShowExport] = useState(false);
  const exportBtnRef = useRef(null);
  const [exportPos, setExportPos] = useState({ top: 0, right: 0 });
  const [confirmExport, setConfirmExport] = useState(null); // { type, label }

  // ── Toast notifikace (nahrazuje alert) ────────────────────
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const doExportXLSColor = () => {
    const firmaColorMap = Object.fromEntries(firmy.map(f => [f.hodnota, f.barva || "#3b82f6"]));
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
  const isDemo = user?.email === "demo";

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
    if (isDemo) { setAppVerze(verze); setAppDatum(datum); return; }
    try {
      await sb("nastaveni", { method: "POST", body: JSON.stringify({ klic: "app_info", hodnota: JSON.stringify({ verze, datum }) }), prefer: "resolution=merge-duplicates,return=minimal" });
      setAppVerze(verze);
      setAppDatum(datum);
    } catch {}
  };
  const dragInfo = useRef(null);

  useEffect(() => {
    if (!isSuperAdmin || isDemo) return;
    sb("nastaveni?klic=eq.col_widths").then(res => {
      if (res && res[0]) {
        try { setColWidths(JSON.parse(res[0].hodnota)); } catch {}
      }
    }).catch(() => {});
  }, [isSuperAdmin, isDemo]);

  const saveColWidths = async (widths) => {
    if (isDemo) return; // demo — neukládat šířky do DB
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
  const loadAll = useCallback(async (isDemo = false) => {
    setLoading(true);
    setDbError(null);
    if (isDemo) {
      const dnes = new Date();
      const fmtDate = (d) => `${d.getDate().toString().padStart(2,"0")}.${(d.getMonth()+1).toString().padStart(2,"0")}.${d.getFullYear()}`;
      const za5  = new Date(dnes); za5.setDate(za5.getDate() + 5);
      const za10 = new Date(dnes); za10.setDate(za10.getDate() + 10);
      const za25 = new Date(dnes); za25.setDate(za25.getDate() + 25);
      const za45 = new Date(dnes); za45.setDate(za45.getDate() + 45);
      const pred5  = new Date(dnes); pred5.setDate(pred5.getDate() - 5);
      const pred10 = new Date(dnes); pred10.setDate(pred10.getDate() - 10);
      const pred30 = new Date(dnes); pred30.setDate(pred30.getDate() - 30);
      const pred60 = new Date(dnes); pred60.setDate(pred60.getDate() - 60);
      const demoStavby = [
        computeRow({ id:1, firma:"Elektro s.r.o.",  cislo_stavby:"ZN-I-2025-001",  nazev_stavby:"Rekonstrukce VO Pražská",          ps_i:850000,  snk_i:120000, bo_i:0,      ps_ii:0,      bo_ii:0,      poruch:45000,  vyfakturovano:720000,  ukonceni:fmtDate(za10),  zrealizovano:680000,  sod:"SOD-2025-014", ze_dne:"15.01.2025", objednatel:"Město Znojmo",       stavbyvedouci:"Jan Novák",       nabidkova_cena:1015000, cislo_faktury:"FAK-2025-031", castka_bez_dph:594000,  splatna:"28.02.2025", poznamka:"Práce probíhají dle harmonogramu, zbývá dokončit úsek u náměstí." }),
        computeRow({ id:2, firma:"Stavmont a.s.",   cislo_stavby:"ZN-I-2025-002",  nazev_stavby:"Oprava kanalizace Dvořákova",      ps_i:0,       snk_i:0,      bo_i:320000, ps_ii:0,      bo_ii:180000, poruch:0,      vyfakturovano:0,       ukonceni:fmtDate(pred30), zrealizovano:0,      sod:"SOD-2025-022", ze_dne:"10.02.2025", objednatel:"Jihomoravský kraj",  stavbyvedouci:"Petr Svoboda",    nabidkova_cena:500000,  cislo_faktury:"",             castka_bez_dph:0,       splatna:"",           poznamka:"" }),
        computeRow({ id:3, firma:"VHS Znojmo",      cislo_stavby:"ZN-II-2025-003", nazev_stavby:"Výměna vodovodního řadu Horní",    ps_i:0,       snk_i:0,      bo_i:0,      ps_ii:640000, bo_ii:0,      poruch:95000,  vyfakturovano:640000,  ukonceni:fmtDate(pred5),  zrealizovano:640000,  sod:"SOD-2025-031", ze_dne:"05.03.2025", objednatel:"Město Znojmo",       stavbyvedouci:"Marie Horáková",  nabidkova_cena:735000,  cislo_faktury:"FAK-2025-044", castka_bez_dph:528000,  splatna:"30.04.2025", poznamka:"" }),
        computeRow({ id:4, firma:"Silnice JM",      cislo_stavby:"ZN-I-2025-004",  nazev_stavby:"Oprava komunikace Přímětická",    ps_i:1200000, snk_i:0,      bo_i:85000,  ps_ii:0,      bo_ii:0,      poruch:0,      vyfakturovano:950000,  ukonceni:fmtDate(za25),  zrealizovano:900000,  sod:"SOD-2025-041", ze_dne:"20.03.2025", objednatel:"Správa silnic",      stavbyvedouci:"Tomáš Blaha",     nabidkova_cena:1285000, cislo_faktury:"",             castka_bez_dph:0,       splatna:"",           poznamka:"Pozor — změna trasy v úseku km 1,2–1,8, nutné nové povolení." }),
        computeRow({ id:5, firma:"Elektro s.r.o.",  cislo_stavby:"ZN-II-2025-005", nazev_stavby:"Rozšíření sítě NN Citonice",       ps_i:0,       snk_i:0,      bo_i:0,      ps_ii:380000, bo_ii:210000, poruch:30000,  vyfakturovano:380000,  ukonceni:fmtDate(pred60), zrealizovano:380000,  sod:"SOD-2025-052", ze_dne:"01.01.2025", objednatel:"MO ČR",              stavbyvedouci:"Jan Novák",       nabidkova_cena:620000,  cislo_faktury:"FAK-2025-018", castka_bez_dph:314000,  splatna:"15.02.2025", poznamka:"" }),
        computeRow({ id:6, firma:"Stavmont a.s.",   cislo_stavby:"ZN-I-2025-006",  nazev_stavby:"Revitalizace parku Smetanovo nám.", ps_i:560000, snk_i:75000,  bo_i:0,      ps_ii:0,      bo_ii:0,      poruch:0,      vyfakturovano:0,       ukonceni:fmtDate(za45),  zrealizovano:0,      sod:"SOD-2025-061", ze_dne:"01.04.2025", objednatel:"Město Znojmo",       stavbyvedouci:"Petr Svoboda",    nabidkova_cena:635000,  cislo_faktury:"",             castka_bez_dph:0,       splatna:"",           poznamka:"" }),
        computeRow({ id:7, firma:"VHS Znojmo",      cislo_stavby:"ZN-II-2025-007", nazev_stavby:"ČOV — rozšíření kapacity",         ps_i:0,       snk_i:0,      bo_i:0,      ps_ii:2100000,bo_ii:340000, poruch:180000, vyfakturovano:1800000, ukonceni:fmtDate(za5),   zrealizovano:1750000, sod:"SOD-2025-071", ze_dne:"15.02.2025", objednatel:"Jihomoravský kraj",  stavbyvedouci:"Marie Horáková",  nabidkova_cena:2620000, cislo_faktury:"FAK-2025-056", castka_bez_dph:1487000, splatna:"31.05.2025", poznamka:"Finální přejímka naplánována na konec května." }),
        computeRow({ id:8, firma:"Silnice JM",      cislo_stavby:"ZN-I-2025-008",  nazev_stavby:"SNK Znojmo — sítě pro RD",         ps_i:0,       snk_i:430000, bo_i:0,      ps_ii:0,      bo_ii:0,      poruch:0,      vyfakturovano:430000,  ukonceni:fmtDate(pred10), zrealizovano:430000,  sod:"SOD-2025-082", ze_dne:"10.03.2025", objednatel:"Správa silnic",      stavbyvedouci:"Tomáš Blaha",     nabidkova_cena:430000,  cislo_faktury:"FAK-2025-062", castka_bez_dph:355000,  splatna:"30.04.2025", poznamka:"" }),
      ];
      setData(demoStavby);
      setFirmy(DEMO_FIRMY);
      setObjednatele(DEMO_CISELNIKY.objednatele);
      setStavbyvedouci(DEMO_CISELNIKY.stavbyvedouci);
      setUsers(DEMO_USERS);
      setLoading(false);
      return;
    }
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

  useEffect(() => { loadAll(user?.email === "demo"); }, [loadAll, user?.email]);

  // ── Upozornění na blížící se termíny ──────────────────────
  const [deadlineWarnings, setDeadlineWarnings] = useState([]);
  const [showDeadlines, setShowDeadlines] = useState(false);
  const [showOrphanWarning, setShowOrphanWarning] = useState(false);

  const pracovniDny = (from, to) => {
    const d0 = new Date(from); d0.setHours(0,0,0,0);
    const d1 = new Date(to); d1.setHours(0,0,0,0);
    if (d1 <= d0) return 0;
    const totalDays = Math.round((d1 - d0) / 86400000);
    const fullWeeks = Math.floor(totalDays / 7);
    const extra = totalDays % 7;
    const startDay = d0.getDay();
    let extraWork = 0;
    for (let i = 1; i <= extra; i++) {
      const day = (startDay + i) % 7;
      if (day !== 0 && day !== 6) extraWork++;
    }
    return fullWeeks * 5 + extraWork;
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
  // Reset při změně uživatele
  useEffect(() => { shownDeadlineOnce.current = false; shownOrphanOnce.current = false; }, [user?.email]);
  useEffect(() => {
    if (user && user.email !== "demo" && !shownDeadlineOnce.current && deadlineWarnings.length > 0) {
      shownDeadlineOnce.current = true;
      setShowDeadlines(true);
    }
  }, [deadlineWarnings, user]);

  const shownOrphanOnce = useRef(false);
  useEffect(() => {
    if (user && user.email !== "demo" && !shownOrphanOnce.current && data.length > 0 && firmy.length > 0) {
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

  // ── Auto-logout: 15 min nečinnost ────────────────────────
  useEffect(() => {
    if (!user || isDemo) return;
    const resetTimer = () => {
      if (autoLogoutWarning) return; // neresetuj když countdown běží
      clearTimeout(autoLogoutTimer.current);
      autoLogoutTimer.current = setTimeout(() => {
        setAutoLogoutWarning(true);
        setAutoLogoutCountdown(60);
      }, AUTO_LOGOUT_MINUTES * 60 * 1000);
    };
    const events = ["mousemove","keydown","click","scroll","touchstart"];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      clearTimeout(autoLogoutTimer.current);
    };
  }, [user, isDemo, autoLogoutWarning]);

  useEffect(() => {
    if (!autoLogoutWarning) { clearInterval(autoLogoutCountdownTimer.current); return; }
    autoLogoutCountdownTimer.current = setInterval(() => {
      setAutoLogoutCountdown(c => {
        if (c <= 1) {
          clearInterval(autoLogoutCountdownTimer.current);
          setAutoLogoutWarning(false);
          setUser(null);
          return 60;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(autoLogoutCountdownTimer.current);
  }, [autoLogoutWarning]);

  // ── Browser notifikace ───────────────────────────────────
  const sendDeadlineNotifications = useCallback((warnings) => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const urgent = warnings.filter(r => r.dniDo <= 7);
    urgent.forEach(r => {
      new Notification("⚠️ Blížící se termín stavby", {
        body: `${r.cislo_stavby} – ${r.nazev_stavby}\nTermín: ${r.ukonceni} (${r.dniDo} pracovních dní)`,
        icon: "/favicon.ico",
        tag: `stavba-${r.id}`,
      });
    });
  }, []);

  useEffect(() => {
    if (!user || isDemo || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().then(p => { notifPermission.current = p; });
    } else {
      notifPermission.current = Notification.permission;
    }
  }, [user, isDemo]);

  useEffect(() => {
    if (!user || isDemo || deadlineWarnings.length === 0) return;
    if (!notifSentRef.current) {
      notifSentRef.current = true;
      sendDeadlineNotifications(deadlineWarnings);
    }
    // Opakovat každých 60 minut pouze pokud tab není aktivní
    clearInterval(notifIntervalRef.current);
    notifIntervalRef.current = setInterval(() => {
      if (document.hidden) sendDeadlineNotifications(deadlineWarnings);
    }, 60 * 60 * 1000);
    return () => clearInterval(notifIntervalRef.current);
  }, [deadlineWarnings, user, isDemo, sendDeadlineNotifications]);

  // ── CRUD stavby ────────────────────────────────────────────
  const handleSave = async (updated) => {
    const { id, nabidka, rozdil, ...fields } = updated;
    NUM_FIELDS.forEach(k => { if (fields[k] === "" || fields[k] == null) fields[k] = 0; else fields[k] = Number(fields[k]) || 0; });
    // Okamžitě rozsvítit tečku pro tuto stavbu
    setHistorieNovinky(prev => ({ ...prev, [String(id)]: true }));
    if (isDemo) {
      setData(prev => prev.map(r => r.id === id ? computeRow({ ...r, ...fields }) : r));
      setEditRow(null);
      return;
    }
    try {
      const staryRow = data.find(r => r.id === id) || {};
      const zmeny = Object.keys(fields)
        .filter(k => k !== "id" && String(staryRow[k] ?? "") !== String(fields[k] ?? ""))
        .map(k => ({ pole: k, stare: staryRow[k] ?? "", nove: fields[k] ?? "" }));
      const detailJson = JSON.stringify({ nazev: fields.nazev_stavby, zmeny });
      await sb(`stavby?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(fields) });
      await logAkce(user?.email, "Editace stavby", `ID: ${id}, ${fields.nazev_stavby} ${detailJson}`);
      await loadAll();
    } catch (e) { showToast("Chyba uložení: " + e.message, "error"); }
    setEditRow(null);
  };

  const handleAdd = async (newRow) => {
    const { id, nabidka, rozdil, ...fields } = newRow;
    NUM_FIELDS.forEach(k => { if (fields[k] === "" || fields[k] == null) fields[k] = 0; else fields[k] = Number(fields[k]) || 0; });
    if (isDemo) {
      if (data.length >= DEMO_MAX_STAVBY) {
        showToast(`Demo verze: maximum ${DEMO_MAX_STAVBY} staveb.`, "error");
        return;
      }
      const demoId = data.length > 0 ? data.reduce((m, r) => Math.max(m, r.id), 0) + 1 : 1;
      setData(prev => [...prev, computeRow({ ...fields, id: demoId })]);
      setAdding(false);
      return;
    }
    try {
      await sb("stavby", { method: "POST", body: JSON.stringify(fields) });
      await logAkce(user?.email, "Přidání stavby", fields.nazev_stavby);
      await loadAll();
    } catch (e) { showToast("Chyba přidání: " + e.message, "error"); }
    setAdding(false);
  };

  const handleCopy = (row) => {
    const { id, nabidka, rozdil, cislo_stavby, ...rest } = row;
    setCopyRow({ ...rest, cislo_stavby: (cislo_stavby ? cislo_stavby + " (kopie)" : "(kopie)") });
  };

  const handleCopySave = async (newRow) => {
    const { id, nabidka, rozdil, ...fields } = newRow;
    NUM_FIELDS.forEach(k => { if (fields[k] === "" || fields[k] == null) fields[k] = 0; else fields[k] = Number(fields[k]) || 0; });
    if (isDemo) {
      if (data.length >= DEMO_MAX_STAVBY) {
        showToast(`Demo verze: maximum ${DEMO_MAX_STAVBY} staveb.`, "error");
        return;
      }
      const demoId = data.length > 0 ? data.reduce((m, r) => Math.max(m, r.id), 0) + 1 : 1;
      setData(prev => [...prev, computeRow({ ...fields, id: demoId })]);
      setCopyRow(null);
      showToast("Kopie stavby uložena (demo).", "ok");
      return;
    }
    try {
      await sb("stavby", { method: "POST", body: JSON.stringify(fields) });
      await logAkce(user?.email, "Kopírování stavby", fields.nazev_stavby + (fields.cislo_stavby ? ` (${fields.cislo_stavby})` : ""));
      await loadAll();
      showToast("Kopie stavby byla úspěšně uložena.", "ok");
    } catch (e) { showToast("Chyba kopírování: " + e.message, "error"); }
    setCopyRow(null);
  };

  const handleDelete = async (id) => {
    if (isDemo) {
      setData(prev => prev.filter(r => r.id !== id));
      setDeleteConfirm(null);
      return;
    }
    const row = data.find(r => r.id === id);
    try {
      await sb(`stavby?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
      await logAkce(user?.email, "Smazání stavby", `ID: ${id}, ${row?.nazev_stavby || ""}`);
      await loadAll();
    } catch (e) { showToast("Chyba mazání: " + e.message, "error"); }
    setDeleteConfirm(null);
  };

  // ── CRUD číselníky ─────────────────────────────────────────
  const saveSettings = async (nFirmy, nObjed, nSv) => {
    if (isDemo) {
      // V demo jen aktualizuj lokální state, nepsat do DB
      setFirmy(nFirmy);
      setObjednatele(nObjed);
      setStavbyvedouci(nSv);
      showToast("Demo: změny uloženy jen lokálně", "ok");
      return;
    }
    try {
      await sb("ciselniky?id=gt.0", { method: "DELETE", prefer: "return=minimal" });
      const items = [
        ...nFirmy.map((f, i) => ({ typ: "firma", hodnota: f.hodnota, barva: f.barva || "", poradi: i })),
        ...nObjed.map((h, i) => ({ typ: "objednatel", hodnota: h, barva: "", poradi: i })),
        ...nSv.map((h, i) => ({ typ: "stavbyvedouci", hodnota: h, barva: "", poradi: i })),
      ];
      await sb("ciselniky", { method: "POST", body: JSON.stringify(items) });
      await loadAll();
    } catch (e) { showToast("Chyba uložení číselníků: " + e.message, "error"); }
  };

  // ── CRUD uživatelé ─────────────────────────────────────────
  const saveUsers = async (uList) => {
    if (isDemo) {
      // V demo jen aktualizuj lokální state, nepsat do DB
      setUsers(uList);
      showToast("Demo: změny uloženy jen lokálně", "ok");
      return;
    }
    try {
      await sb("uzivatele?id=gt.0", { method: "DELETE", prefer: "return=minimal" });
      const items = uList.map(u => ({ jmeno: u.name, email: u.email, heslo: u.password, role: u.role }));
      await sb("uzivatele", { method: "POST", body: JSON.stringify(items) });
      await loadAll();
    } catch (e) { showToast("Chyba uložení uživatelů: " + e.message, "error"); }
  };

  const filtered = useMemo(() => data.filter(r => {
    if (filterFirma !== "Všechny firmy" && r.firma !== filterFirma) return false;
    if (filterText && !r.nazev_stavby?.toLowerCase().includes(filterText.toLowerCase()) && !r.cislo_stavby?.toLowerCase().includes(filterText.toLowerCase())) return false;
    if (filterObjed !== "Všichni objednatelé" && filterObjed && r.objednatel !== filterObjed) return false;
    if (filterSV !== "Všichni stavbyvedoucí" && filterSV && r.stavbyvedouci !== filterSV) return false;
    if (filterRok) { if (!((r.ukonceni && r.ukonceni.includes(filterRok)) || (r.ze_dne && r.ze_dne.includes(filterRok)))) return false; }
    if (filterCastkaOd !== "" && Number(r.nabidkova_cena) < Number(filterCastkaOd)) return false;
    if (filterCastkaDo !== "" && Number(r.nabidkova_cena) > Number(filterCastkaDo)) return false;
    if (filterProslé) { const dnes = new Date(); dnes.setHours(0,0,0,0); const isFak = r.cislo_faktury && r.cislo_faktury.trim() !== "" && r.castka_bez_dph && Number(r.castka_bez_dph) !== 0 && r.splatna && r.splatna.trim() !== ""; if (isFak || !r.ukonceni) return false; const [d,m,y] = r.ukonceni.split(".").map(Number); if (new Date(y,m-1,d) >= dnes) return false; }
    if (filterFakturace) { const isFak = r.cislo_faktury && r.cislo_faktury.trim() !== "" && r.castka_bez_dph && Number(r.castka_bez_dph) !== 0 && r.splatna && r.splatna.trim() !== ""; if (filterFakturace === "ano" && !isFak) return false; if (filterFakturace === "ne" && isFak) return false; }
    if (filterKat === "I" && !((Number(r.ps_i)||0)+(Number(r.snk_i)||0)+(Number(r.bo_i)||0) > 0)) return false;
    if (filterKat === "II" && !((Number(r.ps_ii)||0)+(Number(r.bo_ii)||0)+(Number(r.poruch)||0) > 0)) return false;
    return true;
  }), [data, filterFirma, filterText, filterObjed, filterSV, filterRok, filterCastkaOd, filterCastkaDo, filterProslé, filterFakturace, filterKat]);

  const [tableHeight, setTableHeight] = useState(500);

  const headerRef = useRef(null);
  const cardsRef = useRef(null);
  const filtersRef = useRef(null);
  const tableWrapRef = useRef(null);
  const paginationRef = useRef(null);
  const footerRef = useRef(null);

  // PAGE_SIZE: fixní hodnota, uživatel může měnit tlačítky v paginaci
  const [PAGE_SIZE, setPageSize] = useState(7);
  const [viewMode, setViewMode] = useState("page"); // "page" | "scroll"
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [filterFirma, filterText, filterObjed, filterSV, filterRok, filterCastkaOd, filterCastkaDo, filterProslé, filterFakturace, filterKat]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const displayRows = viewMode === "scroll" ? filtered : paginated;



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
    } catch(e) { showToast("Chyba exportu logu: " + e.message, "error"); }
  };

  const zalohaExcel = async () => {
    const datum = new Date().toISOString().slice(0,16).replace("T","_").replace(":","-");
    const wb = XLSX.utils.book_new();

    // List 1 — Stavby
    const stavbyHeaders = COLUMNS.filter(c => !c.computed && c.key !== "id").map(c => c.label);
    const stavbyRows = data.map(row => COLUMNS.filter(c => !c.computed && c.key !== "id").map(c => row[c.key] ?? ""));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([stavbyHeaders, ...stavbyRows]), "Stavby");

    // List 2 — Ciselniky (živá data z DB)
    try {
      const cis = await sb("ciselniky?order=typ,poradi");
      const cisHeaders = ["id", "typ", "hodnota", "barva", "poradi"];
      const cisRows = (cis || []).map(r => [r.id, r.typ, r.hodnota, r.barva || "", r.poradi]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cisHeaders, ...cisRows]), "Ciselniky");
    } catch { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Chyba načtení"]]), "Ciselniky"); }

    // List 3 — Uzivatele (bez hesla)
    try {
      const uz = await sb("uzivatele?order=id");
      const uzHeaders = ["id", "jmeno", "email", "role"];
      const uzRows = (uz || []).map(r => [r.id, r.jmeno, r.email, r.role]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([uzHeaders, ...uzRows]), "Uzivatele");
    } catch { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Chyba načtení"]]), "Uzivatele"); }

    XLSX.writeFile(wb, `zaloha_DB_${datum}.xlsx`);
    logAkce(user?.email, "Záloha", `${data.length} staveb + ciselniky + uzivatele`);
  };

  // ── Import původní tabulky (superadmin) ──────────────────────
  const importRef = useRef(null);
  const [importLog, setImportLog] = useState(null); // { ok, chyby, zprava }

  const fmtDateFromXls = (v) => {
    if (!v) return "";
    let d;
    if (v instanceof Date) {
      d = v;
    } else if (typeof v === "number") {
      // Excel serial date → JS Date
      d = new Date(Math.round((v - 25569) * 86400 * 1000));
    } else if (typeof v === "string" && v.includes("-")) {
      d = new Date(v);
    } else {
      return String(v);
    }
    if (isNaN(d.getTime())) return String(v);
    const dd = d.getDate().toString().padStart(2,"0");
    const mm = (d.getMonth()+1).toString().padStart(2,"0");
    return `${dd}.${mm}.${d.getFullYear()}`;
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ""; // reset aby šel znovu vybrat stejný soubor
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });

        // ── Detekce listu: buď "Stavby" (záloha DB) nebo první list (původní tabulka) ──
        const isZaloha = wb.SheetNames.includes("Stavby");
        const ws = isZaloha ? wb.Sheets["Stavby"] : wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, cellDates: true });

        let stavbyRows = [];
        let ok = 0, chyby = [];

        if (isZaloha) {
          // Záložní formát — první řádek jsou záhlaví z aplikace
          const headers = raw[0];
          const colIdx = (label) => headers.findIndex(h => h === label);
          const FIELD_MAP = [
            ["Firma", "firma"], ["Číslo stavby", "cislo_stavby"], ["Název stavby", "nazev_stavby"],
            ["PS Kat.I", "ps_i"], ["SNK", "snk_i"], ["BO Kat.I", "bo_i"],
            ["PS Kat.II", "ps_ii"], ["BO Kat.II", "bo_ii"], ["Poruchy", "poruch"],
            ["Nabídka", "nabidkova_cena"], ["Vyfakturováno", "vyfakturovano"],
            ["Zrealizováno", "zrealizovano"], ["SOD", "sod"], ["Ze dne", "ze_dne"],
            ["Objednatel", "objednatel"], ["Stavbyvedoucí", "stavbyvedouci"],
            ["Ukončení", "ukonceni"], ["Č.faktury", "cislo_faktury"],
            ["Částka bez DPH", "castka_bez_dph"], ["Splatná", "splatna"],
            ["Č.faktury 2", "cislo_faktury_2"], ["Č. bez DPH 2", "castka_bez_dph_2"], ["Splatná 2", "splatna_2"],
            ["Poznámka", "poznamka"],
          ];
          for (const row of raw.slice(1)) {
            if (!row[colIdx("Název stavby")]) continue;
            const fields = {};
            FIELD_MAP.forEach(([label, key]) => { fields[key] = row[colIdx(label)] ?? ""; });
            stavbyRows.push(fields);
          }
        } else {
          // Původní tabulka — pevné pozice sloupců (řádek 4 = hlavička, data od řádku 5)
          // Col: 0=region,1=firma,2=porč,3=ps_i,4=snk_i,5=bo_i,6=ps_ii,7=bo_ii,8=poruch,
          //      9=č.stavby,10=název,14=ukončení,15=zreal.,16=sod,17=ze_dne,
          //      18=objednatel,19=stavbyved.,20=nab.cena,21=č.fakt.,22=č.bez_dph,23=splatná
          const dataRows = raw.slice(4); // přeskočit řádky 1-4 (hlavička)
          for (const row of dataRows) {
            const nazev = row[10];
            if (!nazev) continue; // přeskočit prázdné řádky
            const numVal = (v) => {
              if (v === null || v === undefined || v === "") return 0;
              if (typeof v === "number") return v;
              const n = parseFloat(String(v).replace(/\s/g,"").replace(",","."));
              return isNaN(n) ? 0 : n;
            };
            stavbyRows.push({
              firma:          String(row[1] || ""),
              cislo_stavby:   String(row[9] || row[2] || ""),
              nazev_stavby:   String(nazev),
              ps_i:           numVal(row[3]),
              snk_i:          numVal(row[4]),
              bo_i:           numVal(row[5]),
              ps_ii:          numVal(row[6]),
              bo_ii:          numVal(row[7]),
              poruch:         numVal(row[8]),
              nabidkova_cena: numVal(row[20]),
              vyfakturovano:  numVal(row[13]),
              zrealizovano:   numVal(row[15]),
              sod:            String(row[16] || ""),
              ze_dne:         fmtDateFromXls(row[17]),
              objednatel:     String(row[18] || ""),
              stavbyvedouci:  String(row[19] || ""),
              ukonceni:       fmtDateFromXls(row[14]),
              cislo_faktury:  String(row[21] || ""),
              castka_bez_dph: numVal(row[22]),
              splatna:        fmtDateFromXls(row[23]),
              poznamka:       "",
            });
          }
        }

        if (stavbyRows.length === 0) {
          setImportLog({ ok: 0, chyby: ["Nenalezena žádná data ke importu."] });
          return;
        }

        // ── Uložit do DB — DELETE vše + POST nové ──
        await sb("stavby?id=gt.0", { method: "DELETE", prefer: "return=minimal" });
        const NUM = ["ps_i","snk_i","bo_i","ps_ii","bo_ii","poruch","nabidkova_cena","vyfakturovano","zrealizovano","castka_bez_dph"];
        const cleaned = stavbyRows.map(r => {
          const c = { ...r };
          NUM.forEach(k => { c[k] = Number(c[k]) || 0; });
          return c;
        });
        // Vkládej po 50 kusech (Supabase limit)
        for (let i = 0; i < cleaned.length; i += 50) {
          const chunk = cleaned.slice(i, i+50);
          try {
            await sb("stavby", { method: "POST", body: JSON.stringify(chunk), prefer: "return=minimal" });
            ok += chunk.length;
          } catch(e) { chyby.push(`Řádky ${i+1}-${i+chunk.length}: ${e.message}`); }
        }

        await loadAll();
        logAkce(user?.email, "Import", `${ok} staveb importováno z ${file.name}`);
        setImportLog({ ok, chyby, zprava: `Importováno ${ok} staveb z "${file.name}"` });
      } catch(e) {
        setImportLog({ ok: 0, chyby: ["Chyba čtení souboru: " + e.message] });
      }
    };
    reader.readAsArrayBuffer(file);
  };
  const isDark = isDarkComputed(theme);

  // ── Cache barev firem – useMemo, přepočítá se jen při změně firem/tématu ──
  const firmaColorCache = useMemo(() => {
    const cache = {};
    firmy.forEach((firmaObj, idx) => {
      const name = firmaObj.hodnota;
      const hex = (firmaObj.barva && firmaObj.barva !== "")
        ? firmaObj.barva
        : FIRMA_COLOR_FALLBACK[idx % FIRMA_COLOR_FALLBACK.length] || "#3b82f6";
      const parts = hexToRgb(hex).split(",").map(Number);
      const [r, g, b] = parts;
      const br = isDark ? 15 : 241, bg2 = isDark ? 23 : 245, bb = isDark ? 42 : 249;
      const mix = isDark ? 0.18 : 0.15;
      cache[name] = {
        bg: `rgb(${Math.round(r*mix+br*(1-mix))},${Math.round(g*mix+bg2*(1-mix))},${Math.round(b*mix+bb*(1-mix))})`,
        badge: hexToRgbaGlobal(hex, 0.25),
        badgeBorder: hexToRgbaGlobal(hex, 0.6),
        text: hex,
        hex,
      };
    });
    return cache;
  }, [firmy, isDark]);

  // ── firmaColorMap pro exporty ──────────────────────────────
  const firmaColorMapCache = useMemo(() => Object.fromEntries(firmy.map(f => [f.hodnota, f.barva || "#3b82f6"])), [firmy]);

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

  const nextId = data.length > 0 ? data.reduce((max, r) => Math.max(max, r.id), 0) + 1 : 1;
  const emptyRow = { id: nextId, firma: firmy[0]?.hodnota||"", ps_i: 0, snk_i: 0, bo_i: 0, ps_ii: 0, bo_ii: 0, poruch: 0, cislo_stavby: "", nazev_stavby: "", vyfakturovano: 0, ukonceni: "", zrealizovano: "", sod: "", ze_dne: "", objednatel: "", stavbyvedouci: "", nabidkova_cena: 0, cislo_faktury: "", castka_bez_dph: 0, splatna: "", cislo_faktury_2: "", castka_bez_dph_2: 0, splatna_2: "", poznamka: "" };

  const getFirmaColor = (firmaName) => firmaColorCache[firmaName] || { bg: isDark ? "#1a2744" : "#e2e8f0", badge: "rgba(59,130,246,0.25)", badgeBorder: "rgba(59,130,246,0.6)", text: "#3b82f6", hex: "#3b82f6" };

  const firmaBadge = (firma) => {
    const c = getFirmaColor(firma);
    return { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: c.badge, color: c.text, border: `1px solid ${c.badgeBorder}` };
  };

  const rowBg = (firma) => getFirmaColor(firma).bg;

  return (
    <div style={{ height: "100dvh", maxHeight: "100dvh", background: T.appBg, fontFamily: "'Segoe UI',Tahoma,sans-serif", color: T.text, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`html,body{overflow:hidden;height:100%;margin:0;padding:0} .table-wrapper{-webkit-overflow-scrolling:touch;} * { -webkit-tap-highlight-color: transparent; } @keyframes spin{to{transform:rotate(360deg)}} ${!isDark ? "table td:not(.colored-cell) { color: #1e293b; } table td:not(.colored-cell) input { color: #1e293b; } table td:not(.colored-cell) select { color: #1e293b; }" : ""}`}</style>
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "12px 20px", borderRadius: 10, background: toast.type === "error" ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxWidth: 360 }}>
          {toast.type === "error" ? "⚠️ " : "✅ "}{toast.msg}
        </div>
      )}
      {isDemo && (
        <div style={{ background: "linear-gradient(90deg,#b45309,#d97706)", color: "#fff", textAlign: "center", padding: "6px 16px", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, flexShrink: 0 }}>
          🎮 DEMO VERZE — plný přístup admin, data se neukládají, maximum {DEMO_MAX_STAVBY} staveb ({data.length}/{DEMO_MAX_STAVBY})
        </div>
      )}

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
          {!isDemo && deadlineWarnings.length > 0 && <button onClick={() => setShowDeadlines(true)} onMouseEnter={e => showTooltip(e, `Stavby s termínem dokončení do 30 dní`)} onMouseLeave={hideTooltip} style={{ padding: "5px 12px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 7, color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>⚠️ Termíny ({deadlineWarnings.length})</button>}
          {!isDemo && (() => { const firmyNames = firmy.map(f => f.hodnota); const count = data.filter(s => s.firma && !firmyNames.includes(s.firma)).length; return count > 0 ? <button onClick={() => setShowOrphanWarning(true)} style={{ padding: "5px 12px", background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 7, color: "#fbbf24", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🏚️ Bez firmy ({count})</button> : null; })()}
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80" }} />
          <span style={{ color: T.text, fontSize: 13 }}>{user.name}</span>
          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: isSuperAdmin ? "rgba(168,85,247,0.2)" : isAdmin ? "rgba(245,158,11,0.2)" : isEditor ? "rgba(34,197,94,0.2)" : "rgba(100,116,139,0.2)", color: isSuperAdmin ? "#c084fc" : isAdmin ? "#fbbf24" : isEditor ? "#4ade80" : "#94a3b8" }}>{isSuperAdmin ? "SUPERADMIN" : isAdmin ? "ADMIN" : isEditor ? "USER EDITOR" : "USER"}</span>
          <button onClick={() => setShowHelp(true)} onMouseEnter={e => showTooltip(e, "Nápověda k aplikaci")} onMouseLeave={hideTooltip} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: T.textMuted, cursor: "pointer", fontSize: 12 }}>❓ Nápověda</button>
          {isAdmin && <button onClick={() => { setShowSettings(true); if (!isDemo) loadLog(); }} onMouseEnter={e => showTooltip(e, "Nastavení: číselníky, uživatelé, log aktivit")} onMouseLeave={hideTooltip} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: T.textMuted, cursor: "pointer", fontSize: 12 }}>⚙️ Nastavení</button>}
          {isAdmin && <button onClick={() => setShowLog(true)} onMouseEnter={e => showTooltip(e, "Log všech akcí na zakázkách")} onMouseLeave={hideTooltip} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: T.textMuted, cursor: "pointer", fontSize: 12 }}>📜 Log</button>}
          <div style={{ display: "flex", background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 8, overflow: "hidden" }}>
            {[["🌞","light","Světlý"],["🌙","dark","Tmavý"]].map(([icon, val, label]) => (
              <button key={val} onClick={() => changeTheme(val)} onMouseEnter={e => showTooltip(e, label + " režim")} onMouseLeave={hideTooltip} style={{ padding: "5px 9px", background: theme === val ? (isDark ? "rgba(37,99,235,0.3)" : "rgba(37,99,235,0.15)") : "transparent", border: "none", color: theme === val ? "#60a5fa" : T.textMuted, cursor: "pointer", fontSize: 13 }}>{icon}</button>
            ))}
          </div>
          <button onClick={() => setShowLogoutConfirm(true)} onMouseEnter={e => showTooltip(e, "Odhlásit se z aplikace")} onMouseLeave={hideTooltip} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: T.textMuted, cursor: "pointer", fontSize: 12 }}>Odhlásit</button>
        </div>
      </div>

      {/* SUMMARY */}
      <div ref={cardsRef}><SummaryCards data={data} firmy={firmy.map(f => f.hodnota)} isDark={isDark} firmaColors={Object.fromEntries(firmy.map(f => [f.hodnota, f.barva || "#2563eb"]))} /></div>

      {/* FILTERS */}
      <div ref={filtersRef} style={{ padding: "4px 10px", display: "flex", gap: 4, alignItems: "center", background: T.filterBg, borderBottom: `1px solid ${T.cellBorder}`, flexWrap: "nowrap", overflowX: "auto", minHeight: 38 }}>
        <input placeholder="🔍 Hledat..." onMouseEnter={e => showTooltip(e, "Hledat podle názvu nebo čísla stavby")} onMouseLeave={hideTooltip} value={filterText} onChange={e => setFilterText(e.target.value)} style={{ ...inputSx, width: 150, minWidth: 110, background: T.inputBg, border: `1px solid ${T.inputBorder}`, color: T.text, padding: "4px 8px", fontSize: 11 }} />
        <NativeSelect value={filterFirma} onChange={setFilterFirma} options={["Všechny firmy", ...firmy.map(f => f.hodnota)]} isDark={isDark} style={{ width: 130, flexShrink: 0 }} />
        <NativeSelect value={filterObjed} onChange={setFilterObjed} options={["Všichni objednatelé", ...objednatele]} isDark={isDark} style={{ width: 145, flexShrink: 0 }} />
        <NativeSelect value={filterSV} onChange={setFilterSV} options={["Všichni stavbyvedoucí", ...stavbyvedouci]} isDark={isDark} style={{ width: 155, flexShrink: 0 }} />
        <button onClick={() => setShowAdvFilter(v => !v)} onMouseEnter={e => showTooltip(e, "Rozšířený filtr: rok, částka, prošlé termíny")} onMouseLeave={hideTooltip} style={{ padding: "0 8px", height: 28, background: showAdvFilter ? (filterRok || filterCastkaOd || filterCastkaDo || filterProslé || filterFakturace || filterKat) ? "rgba(239,68,68,0.25)" : "rgba(37,99,235,0.25)" : (filterRok || filterCastkaOd || filterCastkaDo || filterProslé || filterFakturace || filterKat) ? "rgba(239,68,68,0.18)" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"), border: `1px solid ${(filterRok || filterCastkaOd || filterCastkaDo || filterProslé || filterFakturace || filterKat) ? "rgba(239,68,68,0.7)" : showAdvFilter ? "rgba(37,99,235,0.5)" : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)")}`, borderRadius: 7, color: (filterRok || filterCastkaOd || filterCastkaDo || filterProslé || filterFakturace || filterKat) ? "#f87171" : showAdvFilter ? "#60a5fa" : T.text, cursor: "pointer", fontSize: 12, fontWeight: (showAdvFilter || filterRok || filterCastkaOd || filterCastkaDo || filterProslé || filterFakturace || filterKat) ? 700 : 400, whiteSpace: "nowrap", flexShrink: 0, boxShadow: (filterRok || filterCastkaOd || filterCastkaDo || filterProslé || filterFakturace || filterKat) ? "0 0 8px rgba(239,68,68,0.4)" : "none" }}>Filtr {showAdvFilter ? "▲" : "▼"}</button>
        <div style={{ display: "flex", gap: 2, flexShrink: 0, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)", borderRadius: 7, padding: 2, border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)"}` }}>
          {[["page","📋 Stránky"],["scroll","📜 Vše"]].map(([vm, lbl]) => (
            <button key={vm} onClick={() => setViewMode(vm)} style={{ padding: "0 7px", height: 28, background: viewMode === vm ? (isDark ? "rgba(37,99,235,0.4)" : "#2563eb") : "transparent", border: "none", borderRadius: 5, color: viewMode === vm ? "#fff" : T.textMuted, cursor: "pointer", fontSize: 11, fontWeight: viewMode === vm ? 700 : 400, whiteSpace: "nowrap" }}>{lbl}</button>
          ))}
        </div>
        {isMobile && (
          <button onClick={() => setCardView(v => !v)} onMouseEnter={e => showTooltip(e, cardView ? "Přepnout na tabulku" : "Přepnout na kartičky")} onMouseLeave={hideTooltip} style={{ padding: "0 8px", height: 28, background: cardView ? "rgba(37,99,235,0.25)" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"), border: `1px solid ${cardView ? "rgba(37,99,235,0.5)" : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)")}`, borderRadius: 7, color: cardView ? "#60a5fa" : T.text, cursor: "pointer", fontSize: 13, fontWeight: cardView ? 700 : 400, flexShrink: 0 }} title={cardView ? "Tabulka" : "Kartičky"}>{cardView ? "☰" : "▦"}</button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <span style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)"}`, borderRadius: 7, padding: "0 8px", height: 28, display: "inline-flex", alignItems: "center", color: T.text, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{filtered.length} záz.</span>
          <button onClick={() => setShowGraf(true)} onMouseEnter={e => showTooltip(e, "Sloupcový graf nákladů")} onMouseLeave={hideTooltip} style={{ padding: "0 10px", height: 28, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)"}`, borderRadius: 7, color: T.text, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>📊 Graf</button>
          <NativeSelect
            value="⬇ Export"
            onChange={v => {
              if (v === "📄 CSV (.csv)")           exportCSV();
              else if (v === "📊 Excel (.xlsx)")   exportXLS();
              else if (v === "🎨 Barevný Excel")   exportXLSColor();
              else if (v === "📜 Export logu")     exportLog();
              else if (v === "🖨️ PDF tisk")        exportPDF();
            }}
            options={["⬇ Export", "📄 CSV (.csv)", "📊 Excel (.xlsx)", "🎨 Barevný Excel", ...(isAdmin ? ["📜 Export logu"] : []), "🖨️ PDF tisk"]}
            isDark={isDark}
            style={{ flexShrink: 0 }}
          />
          {isSuperAdmin && <button onClick={zalohaExcel} onMouseEnter={e => showTooltip(e, "Záloha celé DB: stavby + číselníky + uživatelé (Excel, 3 listy)")} onMouseLeave={hideTooltip} style={{ padding: "0 10px", height: 28, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)"}`, borderRadius: 7, color: T.text, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>💾 Záloha</button>}
          {isSuperAdmin && <>
            <input ref={importRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: "none" }} />
            <button onClick={() => importRef.current?.click()} onMouseEnter={e => showTooltip(e, "Import staveb z původní tabulky nebo zálohy DB (Excel)")} onMouseLeave={hideTooltip} style={{ padding: "0 10px", height: 28, background: isDark ? "rgba(251,191,36,0.1)" : "rgba(251,191,36,0.15)", border: `1px solid ${isDark ? "rgba(251,191,36,0.3)" : "rgba(251,191,36,0.5)"}`, borderRadius: 7, color: "#f59e0b", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>📥 Import</button>
          </>}
          {isEditor && (
            <button
              onMouseEnter={e => showTooltip(e, "Přidat novou stavbu")} onMouseLeave={hideTooltip}
              onClick={() => { if (isDemo && data.length >= DEMO_MAX_STAVBY) { showToast(`Demo verze: maximum ${DEMO_MAX_STAVBY} staveb.`, "error"); return; } setAdding(true); }}
              style={{ padding: "0 14px", height: 28, background: isDemo && data.length >= DEMO_MAX_STAVBY ? "rgba(100,116,139,0.4)" : "linear-gradient(135deg,#16a34a,#15803d)", border: "none", borderRadius: 7, color: "#fff", cursor: isDemo && data.length >= DEMO_MAX_STAVBY ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600 }}
            >{isDemo ? `+ Přidat stavbu (${data.length}/${DEMO_MAX_STAVBY})` : "+ Přidat stavbu"}</button>
          )}
        </div>
      </div>

      {/* CARD VIEW (mobil) */}
      {cardView && (
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "10px 10px", display: "flex", flexDirection: "column", gap: 10, background: isDark ? "#0f172a" : "#f1f5f9" }}>
          {displayRows.length === 0 && (
            <div style={{ textAlign: "center", padding: 48, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", fontSize: 14 }}>Žádné záznamy</div>
          )}
          {displayRows.map(row => (
            <StavbaCard
              key={row.id}
              row={row}
              isEditor={isEditor}
              isAdmin={isAdmin}
              isDark={isDark}
              firmy={firmy}
              onEdit={setEditRow}
              onCopy={handleCopy}
              onDelete={(id) => setDeleteConfirm({ id, step: 1 })}
              onHistorie={setHistorieRow}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
            />
          ))}
        </div>
      )}

      {/* TABLE */}
      <div ref={tableWrapRef} className="table-wrapper" style={{ display: cardView ? "none" : undefined, overflowX: "auto", overflowY: "auto", flex: 1, minHeight: 0, ...(viewMode === "scroll" ? { overflowY: "auto" } : {}) }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed", width: "max-content" }}>
          <colgroup>
            <col style={{ width: 40 }} />
            {(isAdmin || isEditor) && <col style={{ width: 90 }} />}
            {COLUMNS.filter(col => col.key !== "id" && !col.hidden).map(col => (
              <col key={col.key} style={{ width: getColWidth(col) }} />
            ))}
            {(isAdmin || isEditor) && <col style={{ width: 120 }} />}
          </colgroup>
          <thead>
            <tr style={{ background: T.theadBg }}>
              <th style={{ padding: "9px 11px", textAlign: "center", color: T.textMuted, fontWeight: 700, fontSize: 10.5, letterSpacing: 0.4, whiteSpace: "nowrap", minWidth: 40, position: "sticky", top: 0, background: T.theadBg, zIndex: 10, border: `1px solid ${T.cellBorder}` }}>#</th>
              {(isAdmin || isEditor) && <th style={{ padding: "9px 11px", color: T.textMuted, fontWeight: 700, fontSize: 10.5, position: "sticky", top: 0, background: T.theadBg, zIndex: 10, border: `1px solid ${T.cellBorder}`, textAlign: "center" }}>AKCE</th>}
              {COLUMNS.filter(col => col.key !== "id" && !col.hidden).map(col => (
                <th key={col.key} style={{ padding: "6px 4px 6px 8px", textAlign: "center", color: T.textMuted, fontWeight: 700, fontSize: 10.5, letterSpacing: 0.4, width: getColWidth(col), minWidth: 0, position: "sticky", top: 0, background: T.theadBg, zIndex: 10, border: `1px solid ${T.cellBorder}`, userSelect: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, width: "100%", minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "center", minWidth: 0 }}>{col.label.toUpperCase()}</span>
                    {isSuperAdmin && (
                      editingColWidth === col.key
                        ? <input
                            autoFocus
                            type="number"
                            defaultValue={Math.round(getColWidth(col))}
                            onBlur={e => { const w = Math.max(40, Math.min(2000, parseInt(e.target.value)||40)); setColWidths(prev => { const n = {...prev, [col.key]: w}; saveColWidths(n); return n; }); setEditingColWidth(null); }}
                            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingColWidth(null); }}
                            style={{ width: 50, fontSize: 10, padding: "1px 3px", background: "#1e3a8a", color: "#fff", border: "1px solid #60a5fa", borderRadius: 3, flexShrink: 0 }}
                            onClick={e => e.stopPropagation()}
                          />
                        : <span
                            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); startDrag(e, col.key, getColWidth(col)); }}
                            onClick={e => { e.preventDefault(); e.stopPropagation(); setEditingColWidth(col.key); }}
                            style={{ cursor: "col-resize", color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)", fontSize: 12, padding: "1px 3px", userSelect: "none", flexShrink: 0, display: "inline-flex", alignItems: "center", borderRadius: 3, background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.07)", lineHeight: 1 }}
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
            {displayRows.map((row, i) => {
              const globalIndex = page * PAGE_SIZE + i;
              const isFaktura = row.cislo_faktury && row.cislo_faktury.trim() !== "" && row.castka_bez_dph && Number(row.castka_bez_dph) !== 0 && row.splatna && row.splatna.trim() !== "";
              const isFaktura2 = !!(row.cislo_faktury_2 || row.castka_bez_dph_2 || row.splatna_2);
              const baseBg = isFaktura ? "rgba(22,163,74,0.45)" : rowBg(row.firma);
              return (
              <tr key={row.id}
                style={{ background: baseBg, transition: "background 0.1s", color: T.text, minHeight: 34 }}
                onMouseEnter={e => e.currentTarget.style.background = isFaktura ? "rgba(22,163,74,0.60)" : T.hoverBg}
                onMouseLeave={e => e.currentTarget.style.background = baseBg}
              >
                {/* # číslo řádku */}
                <td style={{ padding: "7px 11px", textAlign: "center", border: `1px solid ${T.cellBorder}` }}>
                  <span style={{ color: T.textMuted, fontSize: 12 }}>{globalIndex + 1}</span>
                </td>
                {/* AKCE vlevo */}
                {(isAdmin || isEditor) && (
                  <td style={{ padding: "7px 11px", whiteSpace: "nowrap", border: `1px solid ${T.cellBorder}`, textAlign: "center" }}>
                    {isAdmin && <button onClick={() => setDeleteConfirm({ id: row.id, step: 1 })} onMouseEnter={e => showTooltip(e, "Smazat stavbu")} onMouseLeave={hideTooltip} style={{ padding: "3px 9px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: 11, marginRight: 5 }}>🗑️</button>}
                    <button onClick={() => setEditRow(row)} onMouseEnter={e => showTooltip(e, "Editovat stavbu")} onMouseLeave={hideTooltip} style={{ padding: "3px 9px", background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 5, color: "#60a5fa", cursor: "pointer", fontSize: 11 }}>✏️</button>
                    {!isDemo && <button onClick={() => setHistorieRow(row)} onMouseEnter={e => showTooltip(e, historieNovinky[String(row.id)] ? "Historie změn — obsahuje záznamy" : "Historie změn stavby")} onMouseLeave={hideTooltip} style={{ padding: "3px 9px", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 5, color: "#c084fc", cursor: "pointer", fontSize: 11, marginLeft: 5, position: "relative" }}>
                      🕐{historieNovinky[String(row.id)] && <span style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 6px #ef4444, 0 0 12px rgba(239,68,68,0.7)", display: "block" }}/>}
                    </button>}
                  </td>
                )}
                {COLUMNS.filter(col => col.key !== "id" && !col.hidden).map(col => {
                  const centerCols = ["cislo_stavby","ukonceni","sod","ze_dne","cislo_faktury","splatna"];
                  const align = col.type === "number" ? "right" : centerCols.includes(col.key) ? "center" : "left";

                  // Dvojité hodnoty pro faktury
                  const isOverdue = !isFaktura && col.key === "ukonceni" && row.ukonceni && (() => {
                    const s = row.ukonceni.trim();
                    let d;
                    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
                      d = new Date(s); // ISO: YYYY-MM-DD
                    } else {
                      const p = s.split(".");
                      if (p.length !== 3) return false;
                      d = new Date(`${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`);
                    }
                    const dnes = new Date(); dnes.setHours(0,0,0,0);
                    return !isNaN(d) && d < dnes;
                  })();

                  return (
                    <td key={col.key}
                      className={col.key === "rozdil" || col.type === "number" ? "colored-cell" : ""}
                      style={{ padding: "5px 11px", whiteSpace: "nowrap", textAlign: align, border: `1px solid ${T.cellBorder}`, color: isOverdue ? "#f87171" : col.key === "rozdil" ? (Number(row[col.key]) >= 0 ? "#4ade80" : "#f87171") : col.type === "number" ? T.numColor : T.text, fontWeight: isOverdue ? 700 : "inherit", background: isOverdue ? "rgba(239,68,68,0.18)" : undefined, overflow: col.truncate ? "hidden" : undefined, maxWidth: col.truncate ? getColWidth(col) : undefined }}
                    >
                      <div>
                        <div>
                          {col.key === "firma" ? <span className="firma-badge" style={firmaBadge(row[col.key])}>{row[col.key]}</span>
                          : col.key === "nazev_stavby" ? <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{row[col.key] ?? ""}</span>
                              {row.poznamka && row.poznamka.trim() !== "" && <span onMouseEnter={e => showTooltip(e, row.poznamka)} onMouseLeave={hideTooltip} style={{ cursor: "help", fontSize: 13, flexShrink: 0 }}>💬</span>}
                            </span>
                          : col.type === "number" ? fmtN(row[col.key])
                          : col.truncate ? <span title={row[col.key] ?? ""} style={{ display: "inline-block", maxWidth: getColWidth(col) - 22, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "middle" }}>{row[col.key] ?? ""}</span>
                          : isOverdue ? <span>⚠️ {row[col.key]}</span>
                          : col.key === "cislo_faktury" && row[col.key] ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontWeight: 700, fontSize: 13, color: "#ef4444", lineHeight: 1, flexShrink: 0, textShadow: "0 0 6px #ef4444, 0 0 12px rgba(239,68,68,0.7)" }}>e</span>{row[col.key]}</span>
                          : row[col.key] ?? ""}
                        </div>
                        {/* Druhý řádek pro fakturační sloupce */}
                        {col.key === "cislo_faktury" && row.cislo_faktury_2 && (
                          <div style={{ borderTop: `1px dashed ${T.cellBorder}`, marginTop: 2, paddingTop: 2, display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontWeight: 700, fontSize: 13, color: "#facc15", lineHeight: 1, flexShrink: 0, textShadow: "0 0 6px #facc15, 0 0 12px rgba(250,204,21,0.7)" }}>S</span>{row.cislo_faktury_2}</div>
                        )}
                        {col.key === "castka_bez_dph" && row.castka_bez_dph_2 > 0 && (
                          <div style={{ borderTop: `1px dashed ${T.cellBorder}`, marginTop: 2, paddingTop: 2 }}>{fmtN(row.castka_bez_dph_2)}</div>
                        )}
                        {col.key === "splatna" && row.splatna_2 && (
                          <div style={{ borderTop: `1px dashed ${T.cellBorder}`, marginTop: 2, paddingTop: 2 }}>{row.splatna_2}</div>
                        )}

                      </div>
                    </td>
                  );
                })}
                {/* AKCE vpravo */}
                {(isAdmin || isEditor) && (
                  <td style={{ padding: "7px 11px", whiteSpace: "nowrap", border: `1px solid ${T.cellBorder}`, textAlign: "center" }}>
                    <button onClick={() => setEditRow(row)} onMouseEnter={e => showTooltip(e, "Editovat stavbu")} onMouseLeave={hideTooltip} style={{ padding: "3px 9px", background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 5, color: "#60a5fa", cursor: "pointer", fontSize: 11, marginRight: 5 }}>✏️ Editovat</button>
                    <button onClick={() => handleCopy(row)} onMouseEnter={e => showTooltip(e, "Kopírovat stavbu")} onMouseLeave={hideTooltip} style={{ padding: "3px 9px", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 5, color: "#34d399", cursor: "pointer", fontSize: 11, marginRight: isAdmin ? 5 : 0 }}>📋</button>
                    {isAdmin && <button onClick={() => setDeleteConfirm({ id: row.id, step: 1 })} onMouseEnter={e => showTooltip(e, "Smazat stavbu")} onMouseLeave={hideTooltip} style={{ padding: "3px 9px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: 11 }}>🗑️</button>}
                  </td>
                )}
              </tr>
              );
            })}

          </tbody>
        </table>
      </div>

      <div ref={paginationRef} style={{ display: cardView || viewMode === "scroll" ? "none" : "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 18px", borderTop: `1px solid ${T.cellBorder}`, background: T.filterBg, flexShrink: 0, minHeight: 44 }}>
        {totalPages > 1 && <>
          <button onClick={() => setPage(0)} disabled={page === 0} style={{ padding: "4px 9px", background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 6, color: T.textMuted, cursor: page === 0 ? "default" : "pointer", opacity: page === 0 ? 0.4 : 1, fontSize: 13 }}>«</button>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: "4px 9px", background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 6, color: T.textMuted, cursor: page === 0 ? "default" : "pointer", opacity: page === 0 ? 0.4 : 1, fontSize: 13 }}>‹</button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} onClick={() => setPage(i)} style={{ padding: "4px 10px", background: page === i ? "#2563eb" : T.cardBg, border: `1px solid ${page === i ? "#2563eb" : T.cardBorder}`, borderRadius: 6, color: page === i ? "#fff" : T.textMuted, cursor: "pointer", fontSize: 13, fontWeight: page === i ? 700 : 400 }}>{i + 1}</button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} style={{ padding: "4px 9px", background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 6, color: T.textMuted, cursor: page === totalPages - 1 ? "default" : "pointer", opacity: page === totalPages - 1 ? 0.4 : 1, fontSize: 13 }}>›</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page === totalPages - 1} style={{ padding: "4px 9px", background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 6, color: T.textMuted, cursor: page === totalPages - 1 ? "default" : "pointer", opacity: page === totalPages - 1 ? 0.4 : 1, fontSize: 13 }}>»</button>
          <span style={{ color: T.textMuted, fontSize: 12, marginLeft: 6 }}>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} z {filtered.length}</span>
        </>}
        <span style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: totalPages > 1 ? 10 : 0, borderLeft: totalPages > 1 ? `1px solid ${T.cellBorder}` : "none", paddingLeft: totalPages > 1 ? 10 : 0 }}>
          <button onClick={() => setPageSize(s => Math.max(3, s - 1))} title="Méně řádků na stránce" style={{ padding: "2px 6px", background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 5, color: T.textMuted, cursor: "pointer", fontSize: 12, lineHeight: 1 }}>−</button>
          <span style={{ color: T.textMuted, fontSize: 11, minWidth: 28, textAlign: "center" }}>{PAGE_SIZE} řád.</span>
          <button onClick={() => setPageSize(s => Math.min(50, s + 1))} title="Více řádků na stránce" style={{ padding: "2px 6px", background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 5, color: T.textMuted, cursor: "pointer", fontSize: 12, lineHeight: 1 }}>+</button>
        </span>
      </div>

      <div ref={footerRef} style={{ textAlign: "center", padding: "4px", borderTop: `1px solid ${T.cellBorder}`, color: T.textFaint, fontSize: 11, flexShrink: 0 }}>
        © {appDatum} Stavby Znojmo – Martin Dočekal &amp; Claude AI &nbsp;|&nbsp; v{appVerze}
      </div>

      {/* HELP MODAL */}
      {/* IMPORT RESULT MODAL */}
      {importLog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1600, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
          <div style={{ background: "#1e293b", borderRadius: 16, width: "min(480px,92vw)", padding: "28px 32px", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>{importLog.chyby?.length > 0 ? "⚠️" : "✅"}</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, textAlign: "center", marginBottom: 8 }}>
              {importLog.chyby?.length > 0 ? "Import dokončen s chybami" : "Import úspěšný"}
            </div>
            {importLog.zprava && <div style={{ color: "#86efac", fontSize: 13, textAlign: "center", marginBottom: 12 }}>{importLog.zprava}</div>}
            {importLog.chyby?.length > 0 && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                {importLog.chyby.map((c, i) => <div key={i} style={{ color: "#fca5a5", fontSize: 12, marginBottom: 4 }}>• {c}</div>)}
              </div>
            )}
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button onClick={() => setImportLog(null)} style={{ padding: "9px 28px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Zavřít</button>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1400, pointerEvents: "none", fontFamily: "'Segoe UI',sans-serif" }}>
          <div style={{ position: "fixed", left: helpPos.x, top: helpPos.y, pointerEvents: "all", background: "#1e293b", borderRadius: 16, width: "min(680px,95vw)", maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }}>
            {/* Header — táhlo */}
            <div onMouseDown={onHelpDragStart} style={{ padding: "14px 22px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "grab", userSelect: "none", background: "rgba(255,255,255,0.03)" }}>
              <div>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>❓ Nápověda – Stavby Znojmo</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontWeight: 400, marginLeft: 10 }}>⠿ přetáhnout</span>
              </div>
              <button onClick={() => setShowHelp(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer", pointerEvents: "all" }}>✕</button>
            </div>
            {/* Obsah */}
            <div style={{ overflowY: "auto", padding: "18px 22px", color: "#e2e8f0", fontSize: 13, lineHeight: 1.7 }}>
              {/* Intro */}
              <div style={{ marginBottom: 18, padding: "11px 15px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", borderRadius: 10, fontSize: 12, color: "#93c5fd", lineHeight: 1.6 }}>
                <strong style={{ color: "#60a5fa" }}>Stavby Znojmo</strong> — evidence stavebních zakázek pro kategorie I a II. Každá stavba obsahuje informace o firmě, termínech, fakturaci a realizaci. Změny se automaticky zaznamenávají v historii. Aplikace podporuje role USER, USER EDITOR, ADMIN a SUPERADMIN.
              </div>
              {[
                { icon: "🏗️", title: "Přidání stavby", text: "Klikněte na zelené tlačítko + Přidat stavbu v hlavičce. Vyplňte název stavby (povinný) a ostatní pole dle potřeby. Klávesa Enter přeskočí na další pole ve formuláři. Uložte tlačítkem Uložit — stavba se okamžitě zobrazí v tabulce." },
                { icon: "✏️", title: "Editace stavby", text: "Klikněte na modré tlačítko ✏️ v levém sloupci u řádku stavby. Otevře se formulář s předvyplněnými hodnotami — změňte co potřebujete a uložte. Všechny změny se automaticky zaznamenají do Historie změn." },
                { icon: "🗑️", title: "Smazání stavby", text: "Klikněte na červené tlačítko 🗑️ v levém sloupci. Systém požádá o potvrzení — musíte kliknout dvakrát (ochrana proti náhodnému smazání). Smazanou stavbu nelze obnovit." },
                { icon: "🕐", title: "Historie změn stavby", text: <span>Fialové tlačítko 🕐 v levém sloupci otevře historii změn. Kdo, kdy a která pole změnil. <span style={{display:"inline-flex",alignItems:"center",gap:2}}>Červená tečka <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#ef4444",boxShadow:"0 0 6px #ef4444, 0 0 12px rgba(239,68,68,0.7)",verticalAlign:"middle"}}/>  na ikoně</span> = stavba má záznamy v historii. Export jako Excel nebo PDF.</span> },
                { icon: "📜", title: "Log zakázek", text: "Tlačítko 📜 Log v hlavičce (pouze admin) otevře kompletní přehled všech akcí na zakázkách — přidání, editace i smazání. Záznamy lze filtrovat podle uživatele, typu akce a datumového rozsahu. Exporty: Excel, Barevný Excel a PDF tisk." },
                { icon: "💬", title: "Poznámka ke stavbě", text: <span>V editačním formuláři najdete fialovou sekci 💬 POZNÁMKA. Ikona <span style={{fontSize:13}}>💬</span> se zobrazí vedle názvu stavby pokud poznámka existuje — najeďte myší pro zobrazení textu.</span> },
                { icon: "🎨", title: "Barevné řádky", text: <span>Každá firma má přiřazenou barvu (nastavitelnou v Nastavení). <span style={{background:"rgba(34,197,94,0.25)",color:"#4ade80",padding:"1px 5px",borderRadius:4,fontWeight:600}}>Zelený řádek</span> = stavba má fakturu, částku i datum splatnosti — kompletně vyfakturována.</span> },
                { icon: "⚠️", title: "Termíny ukončení", text: <span>Pole Ukončení se zobrazí <span style={{color:"#f87171",fontWeight:700}}>červeně ⚠️</span> pokud je termín v minulosti a stavba nemá fakturu. Tlačítko <span style={{color:"#f87171",fontWeight:700}}>⚠️ Termíny</span> v hlavičce zobrazí přehled staveb s termínem do 30 dní — včetně zbývajících pracovních dní.</span> },
                { icon: "🔍", title: "Filtry a vyhledávání", text: "Vyhledávejte podle názvu nebo čísla stavby (pole Hledat). Filtrujte podle firmy, objednatele nebo stavbyvedoucího. Filtry lze kombinovat. Graf 📊 a export vždy pracují jen s aktuálně vyfiltrovanými daty." },
                { icon: "📱", title: "Mobilní kartičky", text: "Na mobilu se automaticky zobrazí kartičkový pohled. Tlačítko ▦/☰ v liště přepíná mezi kartičkami a tabulkou. Každá kartička zobrazuje firmu, číslo a název stavby, 3 finanční metriky, termín s barevným stavem, poznámku a faktury. Akce (editovat, kopie, smazat) jsou dostupné dle role." },
                { icon: "📋", title: "Kopírování stavby", text: "Tlačítko 📋 vedle editace otevře formulář s předvyplněnými daty dané stavby. Číslo stavby dostane příponu \" (kopie)\". Po uložení se vytvoří nový samostatný záznam — původní zůstane nezměněn. Funkce je dostupná pro editory i administrátory." },
                { icon: "📊", title: "Graf nákladů", text: "Tlačítko 📊 Graf ve filtrovací liště otevře interaktivní sloupcový graf. Tři přepínače: 🏢 Firma, 📅 Měsíc, 📂 Kat. I / II (Plán.+SNK+Běžné op. vs. Plán.+Běžné op.+Poruchy). Graf vždy odráží aktuální filtr." },
                { icon: "📤", title: "Export dat", text: "CSV — prostá tabulka. Excel (.xlsx) — standardní formát. Barevný Excel (.xls) — se zbarvením firem (potvrďte varování Excelu). PDF — tisk na A4 landscape. Vše pracuje s aktuálním filtrem." },
                { icon: "💾", title: "Záloha DB", text: "Tlačítko Záloha DB (pouze superadmin) stáhne kompletní zálohu celé databáze jako Excel se třemi listy: Stavby, Ciselniky, Uzivatele. Doporučujeme zálohovat pravidelně, zvláště před hromadnými změnami nebo aktualizací aplikace." },
                { icon: "⚙️", title: "Nastavení", text: "Správa firem (název + barva řádku), číselníků objednatelů a stavbyvedoucích. Admin spravuje uživatele — přidává, mění hesla a role. Role: USER (čtení), USER EDITOR (editace), ADMIN (plný přístup), SUPERADMIN (+ nastavení aplikace)." },
                { icon: "🔔", title: "Notifikace v prohlížeči", text: "Aplikace zobrazuje upozornění na blížící se termíny i mimo otevřenou záložku. Po přihlášení prohlížeč zobrazí dialog — klikněte Povolit. Notifikace se odešlou pro stavby s termínem do 7 pracovních dní, opakují každých 60 min pokud záložka není aktivní." },
                { icon: "⏱️", title: "Automatické odhlášení", text: "Aplikace se automaticky odhlásí po 15 minutách nečinnosti. Před odhlášením se zobrazí varování s odpočítáváním 60 sekund — klikněte Jsem tady pro pokračování. Neaktivní v demo režimu." },
                { icon: "🌙", title: "Tmavý / světlý režim", text: "Přepínejte mezi 🌞 světlým a 🌙 tmavým režimem tlačítky v pravém horním rohu. Preference se uloží v prohlížeči." },
                { icon: "↔️", title: "Šířky sloupců", text: "Táhněte ikonu ⟺ v záhlaví sloupce pro změnu šířky (max 2000px). Kliknutím na ⟺ zadáte šířku číslem. Nastavení se uloží v databázi. Superadmin může resetovat šířky na výchozí v Nastavení → Aplikace." },
                { icon: "📋", title: "Dva pohledy — Stránky / Vše", text: "Přepínač 📋 Stránky / 📜 Vše v liště přepíná mezi stránkovaným zobrazením (tlačítka −/+ pro počet řádků na stránce) a plným výpisem všech záznamů s vertikálním scrollem." },
                { icon: "🔍", title: "Rozšířený filtr", text: "Tlačítko Filtr ▾ otevře plovoucí panel s rozšířenými možnostmi: rok uvedení do provozu, rozsah nabídkové ceny (od/do), prošlé termíny bez faktury, stav fakturace a kategorie I / II. Panel lze přetáhnout myší kamkoliv na plochu." },
                { icon: "📥", title: "Import staveb", text: "Tlačítko 📥 Import (pouze superadmin) načte stavby z Excelu — podporuje původní tabulkový formát i zálohu DB. Před importem systém zobrazí náhled a umožní potvrdit nebo zrušit. Existující záznamy se aktualizují, nové přidají." },
                { icon: "🧾", title: "Označení faktur", text: <span>Červené <span style={{fontWeight:700,color:"#ef4444",textShadow:"0 0 6px #ef4444"}}>e</span> před číslem faktury = E.ON (sdružená dodávka). Žluté <span style={{fontWeight:700,color:"#facc15",textShadow:"0 0 6px #facc15"}}>S</span> před druhým číslem faktury = faktura sdružení. Druhá faktura se zobrazí jako druhý řádek v buňce (přerušovaná čára).</span> },
              ].map(({ icon, title, text }) => {
                const emojiRe = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
                const glowEmoji = (str) => {
                  if (typeof str !== "string") return str;
                  const parts = [];
                  let last = 0, m;
                  emojiRe.lastIndex = 0;
                  while ((m = emojiRe.exec(str)) !== null) {
                    if (m.index > last) parts.push(str.slice(last, m.index));
                    parts.push(<span key={m.index} style={{ filter: "brightness(1.4) saturate(1.3)", display: "inline-block", fontSize: 15 }}>{m[0]}</span>);
                    last = m.index + m[0].length;
                  }
                  if (last < str.length) parts.push(str.slice(last));
                  return parts.length > 1 ? parts : str;
                };
                const glowNode = (node) => {
                  if (typeof node === "string") return glowEmoji(node);
                  if (!node || typeof node !== "object" || !node.props) return node;
                  const kids = node.props.children;
                  const newKids = Array.isArray(kids) ? kids.map(glowNode) : glowNode(kids);
                  return { ...node, props: { ...node.props, children: newKids } };
                };
                return (
                  <div key={title} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontWeight: 700, marginBottom: 3, color: "#60a5fa" }}><span style={{ filter: "brightness(1.4) saturate(1.3)", display: "inline-block", fontSize: 16 }}>{icon}</span> {title}</div>
                    <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>{typeof text === "string" ? glowEmoji(text) : glowNode(text)}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "11px 22px", borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "right", background: "rgba(255,255,255,0.02)" }}>
              <button onClick={() => setShowHelp(false)} style={{ padding: "8px 20px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Zavřít</button>
            </div>
          </div>
        </div>
      )}

      {/* TOOLTIP */}
      {tooltip.visible && (
        <div style={{ position: "fixed", left: tooltip.x, top: tooltip.y, transform: "translateX(-50%)", background: "rgba(15,23,42,0.95)", color: "#e2e8f0", fontSize: 12, padding: "5px 10px", borderRadius: 6, pointerEvents: "none", zIndex: 9999, whiteSpace: "nowrap", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
          {tooltip.text}
          <div style={{ position: "absolute", top: -4, left: "50%", transform: "translateX(-50%)", width: 8, height: 8, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.12)", borderBottom: "none", borderRight: "none", rotate: "45deg" }} />
        </div>
      )}

      {/* LOGOUT CONFIRM */}
      {showLogoutConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: isDark ? "#1e293b" : "#fff", borderRadius: 14, padding: "28px 32px", width: 320, textAlign: "center", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>👋</div>
            <div style={{ color: isDark ? "#fff" : "#1e293b", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Odhlásit se?</div>
            <div style={{ color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.5)", fontSize: 13, marginBottom: 22 }}>Budete přesměrováni na přihlašovací obrazovku.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setShowLogoutConfirm(false)} style={{ padding: "9px 20px", background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)"}`, borderRadius: 8, color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)", cursor: "pointer", fontSize: 13 }}>Zrušit</button>
              <button onClick={() => { setShowLogoutConfirm(false); setUser(null); }} style={{ padding: "9px 20px", background: "linear-gradient(135deg,#ef4444,#dc2626)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Odhlásit se</button>
            </div>
          </div>
        </div>
      )}

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
                  const rows = filtered.map((row, i) => {
                    const hex = firmaColorMapCache[row.firma] || "#3b82f6";
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
                        const hex = firmaColorMapCache[row.firma] || "#3b82f6";
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
      {copyRow && <FormModal title="📋 Kopírovat stavbu" initial={copyRow} onSave={handleCopySave} onClose={() => setCopyRow(null)} firmy={firmy.map(f => f.hodnota)} objednatele={objednatele} stavbyvedouci={stavbyvedouci} />}
      {showSettings && <SettingsModal firmy={firmy} objednatele={objednatele} stavbyvedouci={stavbyvedouci} users={users} onChange={saveSettings} onChangeUsers={saveUsers} onClose={() => setShowSettings(false)} onLoadLog={loadLog} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isDark={isDark} appVerze={appVerze} appDatum={appDatum} onSaveAppInfo={saveAppInfo} stavbyData={data} onResetColWidths={() => { setColWidths({}); saveColWidths({}); }} isDemo={isDemo} />}

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

      {/* ROZŠÍŘENÝ FILTR — plovoucí overlay */}
      {showAdvFilter && (
        <div style={{ position: "fixed", left: advFilterPos.x, top: advFilterPos.y, zIndex: 500, background: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)"}`, borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.35)", width: 340, fontFamily: "'Segoe UI',sans-serif" }}>
          <div onMouseDown={onAdvFilterDragStart} style={{ padding: "10px 16px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "grab", userSelect: "none", borderRadius: "12px 12px 0 0", background: isDark ? "rgba(37,99,235,0.15)" : "rgba(37,99,235,0.08)" }}>
            <span style={{ color: isDark ? "#60a5fa" : "#2563eb", fontWeight: 700, fontSize: 13 }}>🔍 Rozšířený filtr</span>
            <button onClick={() => setShowAdvFilter(false)} style={{ background: "none", border: "none", color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 0 }}>✕</button>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", fontSize: 12, width: 100, flexShrink: 0 }}>Rok:</span>
              <input value={filterRok} onChange={e => setFilterRok(e.target.value)} placeholder="např. 2025" style={{ ...inputSx, flex: 1, background: isDark ? "#0f172a" : "#f8fafc", border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`, color: isDark ? "#fff" : "#1e293b", padding: "7px 10px" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", fontSize: 12, width: 100, flexShrink: 0 }}>Nab. cena od:</span>
              <input value={filterCastkaOd} onChange={e => setFilterCastkaOd(e.target.value)} placeholder="0" type="number" style={{ ...inputSx, flex: 1, background: isDark ? "#0f172a" : "#f8fafc", border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`, color: isDark ? "#fff" : "#1e293b", padding: "7px 10px" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", fontSize: 12, width: 100, flexShrink: 0 }}>Nab. cena do:</span>
              <input value={filterCastkaDo} onChange={e => setFilterCastkaDo(e.target.value)} placeholder="∞" type="number" style={{ ...inputSx, flex: 1, background: isDark ? "#0f172a" : "#f8fafc", border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`, color: isDark ? "#fff" : "#1e293b", padding: "7px 10px" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={filterProslé} onChange={e => setFilterProslé(e.target.checked)} style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#ef4444", flexShrink: 0 }} />
              <span style={{ color: isDark ? "#e2e8f0" : "#1e293b", fontSize: 13 }}>⚠️ Jen prošlé termíny bez faktury</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", fontSize: 12, width: 100, flexShrink: 0 }}>Fakturace:</span>
              <select value={filterFakturace} onChange={e => setFilterFakturace(e.target.value)} style={{ ...inputSx, flex: 1, background: isDark ? "#0f172a" : "#f8fafc", border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`, color: isDark ? "#fff" : "#1e293b", padding: "7px 10px" }}>
                <option value="">Vše</option>
                <option value="ano">✅ Vyfakturováno</option>
                <option value="ne">❌ Nevyfakturováno</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", fontSize: 12, width: 100, flexShrink: 0 }}>Kategorie:</span>
              <select value={filterKat} onChange={e => setFilterKat(e.target.value)} style={{ ...inputSx, flex: 1, background: isDark ? "#0f172a" : "#f8fafc", border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`, color: isDark ? "#fff" : "#1e293b", padding: "7px 10px" }}>
                <option value="">Vše</option>
                <option value="I">Kategorie I</option>
                <option value="II">Kategorie II</option>
              </select>
            </div>
            {(filterRok || filterCastkaOd || filterCastkaDo || filterProslé || filterFakturace || filterKat) && (
              <div style={{ paddingTop: 8, borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}` }}>
                <button onClick={() => { setFilterRok(""); setFilterCastkaOd(""); setFilterCastkaDo(""); setFilterProslé(false); setFilterFakturace(""); setFilterKat(""); }} style={{ padding: "6px 14px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 7, color: "#f87171", cursor: "pointer", fontSize: 12, width: "100%" }}>✕ Vymazat rozšířené filtry</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LOG MODAL */}
      {showLog && <LogModal isDark={isDark} firmy={firmy} onClose={() => setShowLog(false)} isDemo={isDemo} />}

      {/* HISTORIE MODAL */}
      {historieRow && <HistorieModal row={historieRow} isDark={isDark} onClose={() => setHistorieRow(null)} isDemo={isDemo} />}

      {/* GRAF MODAL */}
      {showGraf && <GrafModal data={filtered} firmy={firmy} isDark={isDark} onClose={() => setShowGraf(false)} />}

      {/* AUTO-LOGOUT VAROVÁNÍ */}
      {autoLogoutWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
          <div style={{ background: isDark ? "#1e293b" : "#fff", borderRadius: 16, padding: "32px 36px", width: 360, textAlign: "center", border: "1px solid rgba(239,68,68,0.4)", boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏱️</div>
            <h3 style={{ color: isDark ? "#fff" : "#1e293b", margin: "0 0 8px", fontSize: 18 }}>Automatické odhlášení</h3>
            <p style={{ color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", margin: "0 0 6px", fontSize: 14 }}>
              Detekována nečinnost ({AUTO_LOGOUT_MINUTES} minut).
            </p>
            <div style={{ fontSize: 48, fontWeight: 800, color: autoLogoutCountdown <= 10 ? "#f87171" : "#fbbf24", margin: "16px 0", fontVariantNumeric: "tabular-nums" }}>
              {autoLogoutCountdown}
            </div>
            <p style={{ color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.4)", margin: "0 0 24px", fontSize: 13 }}>
              Budete odhlášeni za <strong>{autoLogoutCountdown}</strong> {autoLogoutCountdown === 1 ? "sekundu" : autoLogoutCountdown < 5 ? "sekundy" : "sekund"}.
            </p>
            <button
              onClick={() => {
                setAutoLogoutWarning(false);
                clearInterval(autoLogoutCountdownTimer.current);
                clearTimeout(autoLogoutTimer.current);
                autoLogoutTimer.current = setTimeout(() => {
                  setAutoLogoutWarning(true);
                  setAutoLogoutCountdown(60);
                }, AUTO_LOGOUT_MINUTES * 60 * 1000);
              }}
              style={{ padding: "11px 28px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
            >
              ✅ Jsem tady – pokračovat
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
