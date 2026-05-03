import { useMemo, useState } from "react";
import { Download, Eye, FileSearch, FileText, Filter, Lock, MoreHorizontal, Search, Share2, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

const categories = [["All Documents",142],["Insurance",18],["Warranty",22],["Invoice",34],["Mortgage",11],["Permit",9],["Appliance Manual",12],["Tax",6],["Inspection",8],["Other",22]] as const;

const documents = [
  { name:"Homeowner Insurance Policy 2025.pdf", category:"Insurance", tags:["policy","2025"], linkedTo:"Property", expires:"Apr 12, 2026", snippet:"Lakeside Insurance policy number LIS-8745123 for 123 Lakeview Dr." },
  { name:"Roof Warranty - GAF.pdf", category:"Warranty", tags:["roof","warranty"], linkedTo:"Roof", expires:"Sep 18, 2034", snippet:"Limited warranty for roof shingles and installation workmanship." },
  { name:"Kitchen Renovation Invoice.pdf", category:"Invoice", tags:["kitchen","upgrade"], linkedTo:"Kitchen", expires:"—", snippet:"Cabinets, countertop, sink, labor, and installation invoice." },
  { name:"Mortgage Statement - Apr 2025.pdf", category:"Mortgage", tags:["statement","apr"], linkedTo:"Mortgage", expires:"May 01, 2025", snippet:"Monthly mortgage statement and remaining balance details." },
  { name:"HVAC Permit.pdf", category:"Permit", tags:["hvac","permit"], linkedTo:"HVAC System", expires:"Jun 14, 2026", snippet:"City permit for HVAC replacement and electrical work." },
  { name:"Dishwasher Manual.pdf", category:"Appliance Manual", tags:["dishwasher","manual"], linkedTo:"Dishwasher", expires:"—", snippet:"Manufacturer installation, maintenance, and troubleshooting guide." },
  { name:"Property Tax Receipt 2024.pdf", category:"Tax", tags:["tax","2024"], linkedTo:"Property", expires:"—", snippet:"Annual property tax receipt and municipal payment confirmation." },
  { name:"Termite Inspection Report.pdf", category:"Inspection", tags:["termite","inspection"], linkedTo:"Property", expires:"May 05, 2026", snippet:"Inspection notes: no active infestation found; repeat in 12 months." },
];

const tagTone: Record<string, string> = {
  Insurance:"bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/50",
  Warranty:"bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/50",
  Invoice:"bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50",
  Mortgage:"bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-900/50",
  Permit:"bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/50",
  Inspection:"bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50",
};

export default function Documents() {
  const [selectedName, setSelectedName] = useState(documents[0].name);
  const [query, setQuery] = useState("");
  const selected = documents.find(document => document.name === selectedName) ?? documents[0];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return documents;
    return documents.filter(document => [document.name, document.category, document.linkedTo, document.snippet, ...document.tags].join(" ").toLowerCase().includes(normalized));
  }, [query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Document Vault</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"><Lock className="h-3.5 w-3.5" />Private</span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Secure, searchable storage for receipts, warranties, insurance, permits, and property documents.</p>
        </div>
        <Button className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700"><Upload className="h-4 w-4" />Upload</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_390px]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Categories</p>
          <div className="space-y-1">{categories.map(([label,count], index) => <button key={label} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${index === 0 ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900"}`}><span>{label}</span><span className="text-xs text-slate-400">{count}</span></button>)}</div>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 lg:flex-row lg:items-center">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search documents, OCR text, tags, vendors…" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900 dark:focus:bg-slate-950" /></div>
            <div className="flex gap-2"><Button variant="outline" size="sm" className="gap-2 rounded-xl"><Filter className="h-4 w-4" />More filters</Button><Button variant="outline" size="sm" className="gap-2 rounded-xl"><Sparkles className="h-4 w-4" />OCR enabled</Button></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400 dark:border-slate-800"><tr><th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">Category</th><th className="px-4 py-3 font-semibold">Tags</th><th className="px-4 py-3 font-semibold">Linked to</th><th className="px-4 py-3 font-semibold">Expiry</th><th className="px-4 py-3" /></tr></thead>
              <tbody>{filtered.map(document => <tr key={document.name} onClick={() => setSelectedName(document.name)} className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/60 ${selectedName === document.name ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}>
                <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-950/30"><FileText className="h-4 w-4" /></div><div><div className="flex items-center gap-2"><p className="font-medium text-slate-900 dark:text-slate-100">{document.name}</p><Lock className="h-3.5 w-3.5 text-emerald-500" /></div><p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{document.snippet}</p></div></div></td>
                <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${tagTone[document.category] ?? "bg-slate-50 text-slate-600 border-slate-100"}`}>{document.category}</span></td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5">{document.tags.map(tag => <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">{tag}</span>)}</div></td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{document.linkedTo}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-400">{document.expires}</td><td className="px-4 py-3 text-right"><MoreHorizontal className="ml-auto h-4 w-4 text-slate-400" /></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex items-center justify-between p-4 text-xs text-slate-500"><span>1-{filtered.length} of 142 documents</span><div className="flex items-center gap-1"><button className="h-7 w-7 rounded-lg bg-blue-600 text-white">1</button><button className="h-7 w-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900">2</button><button className="h-7 w-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900">3</button><span className="px-2">…</span><button className="h-7 w-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900">16</button></div></div>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-start justify-between border-b border-slate-200 p-4 dark:border-slate-800"><div><p className="font-semibold leading-tight">{selected.name}</p><p className="mt-1 text-xs text-slate-500">{selected.category} · Added Apr 12, 2025</p></div><Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl"><MoreHorizontal className="h-4 w-4" /></Button></div>
          <div className="p-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/50"><div className="mx-auto max-w-[260px] rounded-xl bg-white p-5 shadow-sm dark:bg-slate-950"><p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Lakeside Insurance</p><h3 className="mt-5 text-center text-sm font-bold">HOMEOWNERS INSURANCE POLICY</h3><div className="mt-5 space-y-3 text-xs text-slate-500">{[["Policy Number","LIS-8745123"],["Named Insured","Kevin Anderson"],["Property","123 Lakeview Dr"],["Policy Period","Apr 2025 - Apr 2026"]].map(([label,value]) => <div key={label} className="flex justify-between gap-6"><span>{label}</span><strong className="text-right text-slate-800 dark:text-slate-200">{value}</strong></div>)}</div></div></div>
            <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><FileSearch className="h-4 w-4 text-blue-500" /><p className="text-sm font-semibold">Extracted Metadata</p></div><button className="text-xs font-semibold text-blue-600">Edit</button></div><dl className="space-y-2 text-sm">{[["Insurer","Lakeside Insurance"],["Policy Number","LIS-8745123"],["Policy Period","Apr 12, 2025 - Apr 12, 2026"],["Address","123 Lakeview Dr, Austin, TX 78701"]].map(([label,value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium text-slate-900 dark:text-slate-100">{value}</dd></div>)}</dl></div>
            <div className="mt-4 grid grid-cols-3 gap-2"><Button variant="outline" size="sm" className="gap-1 rounded-xl"><Eye className="h-3.5 w-3.5" />View</Button><Button variant="outline" size="sm" className="gap-1 rounded-xl"><Download className="h-3.5 w-3.5" />Download</Button><Button variant="outline" size="sm" className="gap-1 rounded-xl"><Share2 className="h-3.5 w-3.5" />Share</Button></div>
          </div>
        </aside>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Your documents are served through authenticated access and short-lived signed links.</div><span className="hidden font-semibold sm:inline">You own your data.</span></div>
    </div>
  );
}
