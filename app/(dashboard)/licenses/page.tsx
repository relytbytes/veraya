"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Plus, Loader2, Pencil, Trash2, ImageUp, ShieldCheck, AlertTriangle, X } from "lucide-react";

interface License {
  id: string; name: string; type: string; number: string | null; issuedTo: string | null;
  authority: string | null; issueDate: string | null; expiryDate: string | null; imageUrl: string | null; notes: string | null;
}

const TYPES = ["LIQUOR", "HEALTH", "BUSINESS", "FOOD_HANDLER", "FIRE", "SIGN", "OTHER"];
const TYPE_LABELS: Record<string, string> = {
  LIQUOR: "Liquor", HEALTH: "Health", BUSINESS: "Business", FOOD_HANDLER: "Food Handler", FIRE: "Fire", SIGN: "Signage", OTHER: "Other",
};

const EMPTY = { name: "", type: "OTHER", number: "", issuedTo: "", authority: "", issueDate: "", expiryDate: "", imageUrl: "", notes: "" };

function expiryStatus(d: string | null): { label: string; cls: string; days: number | null } {
  if (!d) return { label: "No expiry", cls: "bg-gray-100 text-gray-500", days: null };
  const days = Math.ceil((new Date(d + "T12:00:00").getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: `Expired ${-days}d ago`, cls: "bg-red-100 text-red-700", days };
  if (days <= 30) return { label: `Expires in ${days}d`, cls: "bg-amber-100 text-amber-700", days };
  return { label: `Valid · ${new Date(d + "T12:00:00").toLocaleDateString()}`, cls: "bg-emerald-100 text-emerald-700", days };
}

// Compress a chosen image to a data URL (max 1600px / jpeg 0.82) — a backup scan.
async function fileToDataUrl(file: File): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const max = 1600;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<License | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/licenses");
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    if (res.ok) setLicenses(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function openAdd() { setEditing(null); setForm(EMPTY); setDialogOpen(true); }
  function openEdit(l: License) {
    setEditing(l);
    setForm({ name: l.name, type: l.type, number: l.number ?? "", issuedTo: l.issuedTo ?? "", authority: l.authority ?? "", issueDate: l.issueDate ?? "", expiryDate: l.expiryDate ?? "", imageUrl: l.imageUrl ?? "", notes: l.notes ?? "" });
    setDialogOpen(true);
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { const url = await fileToDataUrl(file); setForm((f) => ({ ...f, imageUrl: url })); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const url = editing ? `/api/licenses/${editing.id}` : "/api/licenses";
    const res = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (res.ok) { setDialogOpen(false); load(); }
  }

  async function remove(l: License) {
    if (!confirm(`Delete "${l.name}"?`)) return;
    await fetch(`/api/licenses/${l.id}`, { method: "DELETE" });
    load();
  }

  if (forbidden) {
    return (
      <div>
        <Header title="Licensing" description="Licenses & permits" />
        <div className="p-12 text-center text-gray-400">Licensing is restricted to managers and admins.</div>
      </div>
    );
  }

  const sorted = [...licenses].sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
  const attention = sorted.filter((l) => { const s = expiryStatus(l.expiryDate); return s.days !== null && s.days <= 30; });

  return (
    <div>
      <Header
        title="Licensing"
        description="A vault for every license & permit — scan a backup before posting the original."
        actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" /> Add License</Button>}
      />
      <div className="p-6 space-y-4">
        {attention.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {attention.length} license{attention.length === 1 ? "" : "s"} expired or expiring within 30 days — renew soon.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-gray-500">No licenses yet</p>
            <p className="text-sm mt-1">Add your liquor, health, business and other permits here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map((l) => {
              const s = expiryStatus(l.expiryDate);
              return (
                <div key={l.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  {l.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.imageUrl} alt={l.name} className="w-full h-32 object-cover bg-gray-50" />
                  ) : (
                    <div className="w-full h-32 bg-gray-50 flex items-center justify-center text-gray-300"><ShieldCheck className="h-8 w-8" /></div>
                  )}
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{l.name}</p>
                        <p className="text-xs text-gray-400">{TYPE_LABELS[l.type] ?? l.type}{l.number ? ` · #${l.number}` : ""}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEdit(l)} className="text-gray-400 hover:text-gray-700"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => remove(l)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <span className={cn("inline-block text-[11px] font-medium px-2 py-0.5 rounded-full", s.cls)}>{s.label}</span>
                    {l.issuedTo && <p className="text-xs text-gray-400 truncate">Issued to {l.issuedTo}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit License" : "Add License"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Liquor License" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm">
                  {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>License #</Label><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Issued to</Label><Input value={form.issuedTo} onChange={(e) => setForm({ ...form, issuedTo: e.target.value })} placeholder="Business / person name" /></div>
            <div className="space-y-1.5"><Label>Issuing authority</Label><Input value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} placeholder="State ABC, County Health Dept…" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Issued</Label><Input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Expires</Label><Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Scanned copy</Label>
              {form.imageUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.imageUrl} alt="scan" className="w-full max-h-48 object-contain rounded-md border border-gray-200 bg-gray-50" />
                  <button onClick={() => setForm({ ...form, imageUrl: "" })} className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full flex items-center justify-center gap-2 py-6 rounded-md border-2 border-dashed border-gray-200 text-gray-400 hover:border-gray-300">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageUp className="h-5 w-5" />} Upload / photograph the license
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickImage} />
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full min-h-[60px] rounded-md border border-gray-300 px-3 py-2 text-sm" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
