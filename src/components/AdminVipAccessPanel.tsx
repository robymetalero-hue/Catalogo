/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { VipAccess, VipAnalyticsEvent, VipOrder, Product } from "../types";
import { 
  Plus, Trash2, Copy, Check, ExternalLink, Clock, Shield, ShieldAlert, Users, 
  ShoppingBag, Eye, Activity, Phone, Settings, AlertCircle, Calendar, 
  TrendingUp, BarChart2, X, AlertTriangle, Play, RefreshCw, Smartphone, FileText, CheckCircle, Edit, DollarSign
} from "lucide-react";

interface AdminVipAccessPanelProps {
  products: Product[];
  categories: string[];
}

export default function AdminVipAccessPanel({ products, categories }: AdminVipAccessPanelProps) {
  // Navigation Tabs inside VIP Admin
  const [activeSection, setActiveSection] = useState<"accesses" | "orders">("orders");

  // Accesses & Analytics States
  const [accesses, setAccesses] = useState<VipAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Form state for creating VIP accesses
  const [clientName, setClientName] = useState("");
  const [pin, setPin] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [sessionDuration, setSessionDuration] = useState(30);
  const [notes, setNotes] = useState("");

  // Last created access for showing PIN once
  const [createdAccess, setCreatedAccess] = useState<{ access: VipAccess; rawPin: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Analytics Modal
  const [selectedAccessForAnalytics, setSelectedAccessForAnalytics] = useState<VipAccess | null>(null);
  const [analyticsData, setAnalyticsData] = useState<{ events: VipAnalyticsEvent[]; orders: VipOrder[] } | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // --- VIP ORDERS MANAGEMENT STATES ---
  const [vipOrders, setVipOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  
  // Selected order for status change & quotation / cotización
  const [selectedOrderForQuote, setSelectedOrderForQuote] = useState<any | null>(null);
  const [quoteStatus, setQuoteStatus] = useState("pendiente");
  const [quoteAdminNotes, setQuoteAdminNotes] = useState("");
  const [quotedItems, setQuotedItems] = useState<any[]>([]);
  const [quoteFinalTotal, setQuoteFinalTotal] = useState(0);

  useEffect(() => {
    fetchAccesses();
    fetchVipOrders();
  }, []);

  const fetchAccesses = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vip/accesses");
      if (!res.ok) throw new Error("Fallo al cargar accesos VIP.");
      const data = await res.json();
      setAccesses(data);
    } catch (err: any) {
      showMsg("No se pudieron cargar los accesos VIP del servidor.", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchVipOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch("/api/vip/orders");
      if (!res.ok) throw new Error("Error al obtener pedidos VIP.");
      const data = await res.json();
      setVipOrders(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCreateAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !pin.trim() || selectedDepts.length === 0) {
      showMsg("Por favor, rellena todos los campos obligatorios.", "error");
      return;
    }

    if (pin.length < 3 || pin.length > 4 || isNaN(Number(pin))) {
      showMsg("El PIN de seguridad debe constar de 3 o 4 dígitos numéricos.", "error");
      return;
    }

    setActionLoading("create");
    try {
      const res = await fetch("/api/vip/accesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: clientName.trim(),
          pin: pin.trim(),
          allowedDepartments: selectedDepts,
          sessionDurationMinutes: sessionDuration,
          notes: notes.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Fallo al crear el acceso VIP.");
      }

      setCreatedAccess({ access: data, rawPin: data.rawPin });
      setAccesses([data, ...accesses]);
      
      // Reset form
      setClientName("");
      setPin("");
      setSelectedDepts([]);
      setNotes("");
      
      showMsg("¡Acceso VIP Generado Exitosamente!");
    } catch (err: any) {
      showMsg(err.message || "Error al generar el PIN de acceso.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm("¿Seguro que deseas revocar este acceso VIP de forma inmediata? El cliente no podrá volver a ver la sección privada.")) return;
    
    setActionLoading(id);
    try {
      const res = await fetch(`/api/vip/accesses/${id}/revoke`, { method: "POST" });
      if (!res.ok) throw new Error("Fallo al revocar acceso.");
      
      setAccesses(accesses.map(acc => acc.id === id ? { ...acc, status: "revoked" as const } : acc));
      showMsg("Acceso VIP revocado correctamente.");
      
      if (selectedAccessForAnalytics?.id === id) {
        setSelectedAccessForAnalytics({ ...selectedAccessForAnalytics, status: "revoked" });
      }
    } catch (err: any) {
      showMsg(err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Seguro que deseas eliminar permanentemente este registro de acceso VIP de la base de datos?")) return;
    
    setActionLoading(id);
    try {
      const res = await fetch(`/api/vip/accesses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Fallo al eliminar acceso.");
      
      setAccesses(accesses.filter(acc => acc.id !== id));
      showMsg("Registro de acceso eliminado.");
    } catch (err: any) {
      showMsg(err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const loadAnalytics = async (access: VipAccess) => {
    setSelectedAccessForAnalytics(access);
    setLoadingAnalytics(true);
    setAnalyticsData(null);
    try {
      const res = await fetch(`/api/vip/analytics/${access.id}`);
      if (!res.ok) throw new Error("Error cargando analíticas.");
      const data = await res.json();
      setAnalyticsData(data);
    } catch (err: any) {
      showMsg("No se pudieron cargar las analíticas detalladas.", "error");
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const generateWhatsAppMessage = (client: string, rawPin: string, duration: number, depts: string[]) => {
    const appUrl = window.location.origin;
    const vipUrl = `${appUrl}/vip`;
    const deptsStr = depts.join(", ");
    
    return `*¡Hola ${client}!* ✨

Te hemos asignado un *Acceso VIP Exclusivo* para explorar nuestras colecciones privadas y lanzamientos especiales de: *${deptsStr}*.

🔑 *Tu PIN de Acceso:* \`${rawPin}\`
⏳ *Duración de la sesión:* ${duration} minutos (vínculo único de seguridad para 1 dispositivo).

Accede de forma segura haciendo clic aquí:
👉 ${vipUrl}

_Nota: No compartas este enlace ni tu PIN. Una vez ingreses, tu sesión se bloqueará en tu dispositivo por seguridad._ 🛡️`;
  };

  const handleCopyWhatsApp = (client: string, rawPin: string, duration: number, depts: string[], id: string) => {
    const text = generateWhatsAppMessage(client, rawPin, duration, depts);
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 3000);
  };

  const toggleDept = (dept: string) => {
    if (selectedDepts.includes(dept)) {
      setSelectedDepts(selectedDepts.filter(d => d !== dept));
    } else {
      setSelectedDepts([...selectedDepts, dept]);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: VipAccess["status"]) => {
    const configs = {
      active: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "Activo" },
      used: { bg: "bg-blue-50 text-blue-700 border-blue-200", text: "Usado" },
      expired: { bg: "bg-slate-100 text-slate-700 border-slate-200", text: "Expirado" },
      blocked: { bg: "bg-red-50 text-red-700 border-red-200", text: "Bloqueado" },
      revoked: { bg: "bg-amber-50 text-amber-700 border-amber-200", text: "Revocado" }
    };
    const cfg = configs[status] || { bg: "bg-slate-100 text-slate-700 border-slate-200", text: status };
    return (
      <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${cfg.bg}`}>
        {cfg.text}
      </span>
    );
  };

  const renderOrderStatusBadge = (status: string) => {
    const configs: Record<string, { bg: string; text: string }> = {
      pendiente: { bg: "bg-amber-100 text-amber-800 border-amber-200 animate-pulse", text: "Pendiente" },
      "en revisión": { bg: "bg-blue-100 text-blue-800 border-blue-200", text: "En revisión" },
      cotizado: { bg: "bg-purple-100 text-purple-800 border-purple-200", text: "Cotizado" },
      confirmado: { bg: "bg-emerald-100 text-emerald-800 border-emerald-200", text: "Confirmado" },
      rechazado: { bg: "bg-red-100 text-red-800 border-red-200", text: "Rechazado" },
      preparado: { bg: "bg-teal-100 text-teal-800 border-teal-200", text: "Preparado" },
      entregado: { bg: "bg-slate-100 text-slate-800 border-slate-200", text: "Entregado" }
    };
    const cfg = configs[status] || { bg: "bg-slate-100 text-slate-800 border-slate-200", text: status };
    return (
      <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${cfg.bg}`}>
        {cfg.text}
      </span>
    );
  };

  // Calculate remaining session time for analytics
  const getRemainingTimePercent = (access: VipAccess) => {
    if (access.status !== "active" || !access.sessionExpiresAt) return 0;
    const expiry = new Date(access.sessionExpiresAt).getTime();
    const start = access.sessionStartedAt ? new Date(access.sessionStartedAt).getTime() : Date.now();
    const now = Date.now();
    const total = expiry - start;
    if (total <= 0) return 0;
    const remaining = expiry - now;
    if (remaining <= 0) return 0;
    return Math.min(100, Math.round((remaining / total) * 100));
  };

  const getRemainingTimeText = (access: VipAccess) => {
    if (access.status !== "active" || !access.sessionExpiresAt) return "Expirado o inactivo";
    const expiry = new Date(access.sessionExpiresAt).getTime();
    const now = Date.now();
    const remainingMs = expiry - now;
    if (remainingMs <= 0) return "Tiempo agotado";
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    return `${mins}m y ${secs}s restantes`;
  };

  // --- VIP ORDERS MANAGEMENT FLOWS ---
  const handleOpenQuoteEditor = (order: any) => {
    setSelectedOrderForQuote(order);
    setQuoteStatus(order.status || "pendiente");
    setQuoteAdminNotes(order.adminNotes || "");
    
    // Initialize quoted items with order items if not already quoted
    const items = order.quotedItems || order.items.map((i: any) => ({ ...i }));
    setQuotedItems(items);
    recalculateQuoteTotal(items);
  };

  const updateQuotedItemPrice = (index: number, price: number) => {
    const updated = quotedItems.map((item, idx) => idx === index ? { ...item, price: Number(price) || 0 } : item);
    setQuotedItems(updated);
    recalculateQuoteTotal(updated);
  };

  const updateQuotedItemQuantity = (index: number, qty: number) => {
    const updated = quotedItems.map((item, idx) => idx === index ? { ...item, quantity: Number(qty) || 0 } : item);
    setQuotedItems(updated);
    recalculateQuoteTotal(updated);
  };

  const removeQuotedItem = (index: number) => {
    const updated = quotedItems.filter((_, idx) => idx !== index);
    setQuotedItems(updated);
    recalculateQuoteTotal(updated);
  };

  const addCustomQuotedItem = () => {
    const item = {
      name: "Artículo Adicional",
      sku: "ADD-01",
      price: 0,
      quantity: 1,
      category: "Personalizado"
    };
    const updated = [...quotedItems, item];
    setQuotedItems(updated);
    recalculateQuoteTotal(updated);
  };

  const recalculateQuoteTotal = (items: any[]) => {
    const total = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
    setQuoteFinalTotal(total);
  };

  const handleUpdateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForQuote) return;

    setActionLoading("update-quote");
    try {
      const res = await fetch(`/api/vip/orders/${selectedOrderForQuote.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: quoteStatus,
          adminNotes: quoteAdminNotes.trim(),
          quotedItems: quotedItems,
          finalTotal: quoteFinalTotal
        })
      });

      if (!res.ok) throw new Error("No se pudo actualizar el pedido VIP.");
      
      showMsg("¡Cotización y Estado Actualizados Exitosamente!");
      setSelectedOrderForQuote(null);
      fetchVipOrders();
    } catch (err: any) {
      showMsg(err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Count pending VIP orders for notifications
  const pendingOrdersCount = vipOrders.filter(o => o.status === "pendiente").length;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      
      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 pb-px gap-6">
        <button
          onClick={() => setActiveSection("orders")}
          className={`pb-3 text-xs uppercase font-extrabold tracking-wider transition-all relative flex items-center gap-1.5 cursor-pointer ${
            activeSection === "orders" ? "text-amber-600 font-black" : "text-slate-400 hover:text-slate-800"
          }`}
        >
          <ShoppingBag size={14} />
          <span>Gestión de Pedidos VIP</span>
          {pendingOrdersCount > 0 && (
            <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-full animate-bounce shrink-0">
              {pendingOrdersCount} Nuevos
            </span>
          )}
          {activeSection === "orders" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />
          )}
        </button>

        <button
          onClick={() => setActiveSection("accesses")}
          className={`pb-3 text-xs uppercase font-extrabold tracking-wider transition-all relative flex items-center gap-1.5 cursor-pointer ${
            activeSection === "accesses" ? "text-amber-600 font-black" : "text-slate-400 hover:text-slate-800"
          }`}
        >
          <Shield size={14} />
          <span>Accesos VIP & Monitoreo</span>
          {activeSection === "accesses" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />
          )}
        </button>
      </div>

      {/* SECTION 1: ORDERS DASHBOARD */}
      {activeSection === "orders" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Overview */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-400 font-bold uppercase text-xs tracking-wider">
                  <ShoppingBag size={14} />
                  <span>Cuentas por cobrar & Cotizaciones</span>
                </div>
                <h3 className="text-xl font-extrabold tracking-tight">Administración de Pedidos VIP</h3>
                <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                  Monitorea las órdenes de compra enviadas de forma directa por los clientes VIP. Puedes editar estados, ajustar cotizaciones con precios especiales o descuentos, y enviar respuestas que tus clientes verán en tiempo real.
                </p>
              </div>
              
              <div className="flex gap-3">
                <div className="bg-slate-800 rounded-2xl p-3 border border-slate-700 flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                    <Clock size={16} />
                  </div>
                  <div>
                    <span className="block text-[9px] text-slate-400 font-bold uppercase">Pendientes</span>
                    <span className="text-sm font-black text-amber-400 leading-none">{pendingOrdersCount}</span>
                  </div>
                </div>

                <button 
                  onClick={fetchVipOrders}
                  className="bg-slate-800 hover:bg-slate-750 text-white p-3 rounded-2xl border border-slate-700 flex items-center justify-center transition-all cursor-pointer"
                  title="Sincronizar Pedidos"
                >
                  <RefreshCw size={16} className={loadingOrders ? "animate-spin text-amber-400" : "text-slate-300"} />
                </button>
              </div>
            </div>
          </div>

          {/* Messages */}
          {message && (
            <div className={`p-4 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
              message.type === "success" 
                ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                : "bg-red-50 text-red-800 border-red-200"
            }`}>
              <AlertCircle size={16} />
              <span>{message.text}</span>
            </div>
          )}

          {/* Orders Table list */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
            {loadingOrders ? (
              <div className="py-20 flex flex-col items-center justify-center">
                <span className="w-8 h-8 border-3 border-amber-500/10 border-t-amber-500 rounded-full animate-spin mb-2" />
                <span className="text-xs text-slate-400 font-medium">Buscando nuevos pedidos VIP...</span>
              </div>
            ) : vipOrders.length === 0 ? (
              <div className="py-20 text-center border-dashed rounded-3xl space-y-2">
                <ShoppingBag size={32} className="text-slate-400 mx-auto" />
                <h4 className="font-bold text-sm text-slate-500">Ningún pedido registrado todavía</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Tus clientes VIP verán un carrito interno donde podrán enviar sus solicitudes directamente a Firestore sin WhatsApp.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase bg-slate-50/50">
                      <th className="px-4 py-3">Código Pedido</th>
                      <th className="px-4 py-3">Cliente VIP</th>
                      <th className="px-4 py-3">Detalle Artículos</th>
                      <th className="px-4 py-3">Nota Cliente</th>
                      <th className="px-4 py-3">Total Solicitado</th>
                      <th className="px-4 py-3">Total Cotizado</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {vipOrders.map(order => {
                      const isPending = order.status === "pendiente";
                      return (
                        <tr key={order.id} className={`hover:bg-slate-50/60 transition-colors ${
                          isPending ? "bg-amber-50/15 border-l-2 border-l-amber-500" : ""
                        }`}>
                          <td className="px-4 py-4 font-mono text-xs font-bold text-slate-700">
                            {order.id}
                            <span className="block text-[9px] text-slate-400 font-normal font-sans mt-0.5">
                              {new Date(order.createdAt).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span className="font-bold text-slate-800 block">{order.clientName}</span>
                            <span className="text-[10px] text-slate-400 font-mono block">Acceso: {order.accessId}</span>
                          </td>
                          <td className="px-4 py-4 max-w-[280px]">
                            <div className="space-y-1.5">
                              {order.items?.map((item: any, idx: number) => (
                                <div key={idx} className="flex justify-between text-[11px] text-slate-600 gap-2">
                                  <span className="truncate">{item.quantity}x {item.name}</span>
                                  {item.observation && (
                                    <span className="text-[10px] text-amber-600 font-medium truncate max-w-[100px] bg-amber-50 px-1 rounded">
                                      {item.observation}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-4 max-w-[200px] truncate text-slate-500 italic" title={order.customerNote}>
                            {order.customerNote || "-"}
                          </td>
                          <td className="px-4 py-4 font-extrabold text-slate-700">
                            ${order.total?.toLocaleString() || "0"}
                          </td>
                          <td className="px-4 py-4 font-black text-amber-600">
                            {order.finalTotal !== null ? `$${order.finalTotal.toLocaleString()}` : "-"}
                          </td>
                          <td className="px-4 py-4">
                            {renderOrderStatusBadge(order.status)}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button
                              onClick={() => handleOpenQuoteEditor(order)}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-3xs"
                            >
                              <Edit size={11} />
                              <span>Cotizar / Responder</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* EDIT QUOTE & ANSWER MODAL OVERLAY */}
          {selectedOrderForQuote && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
              <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
                
                {/* Header */}
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-500 text-slate-950 rounded-xl">
                      <DollarSign size={18} />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm">Gestionar Pedido & Cotización VIP</h4>
                      <p className="text-[11px] text-slate-400">
                        Código: <strong className="font-mono text-slate-600">{selectedOrderForQuote.id}</strong> | Cliente: {selectedOrderForQuote.clientName}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedOrderForQuote(null)}
                    className="p-1 px-2.5 text-xs border border-slate-200 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  >
                    Cerrar
                  </button>
                </div>

                <form onSubmit={handleUpdateQuote} className="flex-1 flex flex-col justify-between overflow-y-auto">
                  <div className="p-6 space-y-5 flex-1 overflow-y-auto">
                    
                    {/* Status selection and admin reply notes */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Estado del Pedido VIP</label>
                        <select
                          value={quoteStatus}
                          onChange={e => setQuoteStatus(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-bold text-slate-700 bg-slate-50 focus:outline-none focus:border-amber-500"
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="en revisión">En revisión</option>
                          <option value="cotizado">Cotizado</option>
                          <option value="confirmado">Confirmado / Aprobado</option>
                          <option value="preparado">Preparado / Listo</option>
                          <option value="entregado">Entregado</option>
                          <option value="rechazado">Rechazado</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Observaciones / Nota al Cliente</label>
                        <textarea
                          rows={2}
                          placeholder="Escribe un mensaje que el cliente leerá. Ej. Ya aplicamos tu descuento VIP de cliente mayorista..."
                          value={quoteAdminNotes}
                          onChange={e => setQuoteAdminNotes(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-amber-500 resize-none"
                        />
                      </div>
                    </div>

                    {/* Customer generic notes if available */}
                    {selectedOrderForQuote.customerNote && (
                      <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs leading-normal">
                        <span className="font-bold text-slate-500 block text-[9px] uppercase tracking-wider mb-1">Instrucciones del Cliente:</span>
                        <p className="text-slate-600 italic">"{selectedOrderForQuote.customerNote}"</p>
                      </div>
                    )}

                    {/* Quotation Editor: Items adjusting table */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Artículos a Cotizar / Ajustar</span>
                        <button
                          type="button"
                          onClick={addCustomQuotedItem}
                          className="text-[10px] text-amber-600 hover:text-amber-700 font-extrabold uppercase tracking-wider flex items-center gap-1 bg-amber-50 px-2 py-1 rounded"
                        >
                          <Plus size={10} />
                          <span>Añadir Producto</span>
                        </button>
                      </div>

                      <div className="border border-slate-150 rounded-xl overflow-hidden bg-slate-50/50">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-[9px] font-bold text-slate-400 uppercase border-b border-slate-150">
                              <th className="p-2.5">Producto</th>
                              <th className="p-2.5 w-24">Precio ($)</th>
                              <th className="p-2.5 w-20">Cantidad</th>
                              <th className="p-2.5 text-right w-24">Subtotal</th>
                              <th className="p-2.5 text-right w-12"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {quotedItems.map((item, idx) => (
                              <tr key={idx} className="hover:bg-white transition-colors">
                                <td className="p-2.5">
                                  <div className="font-bold text-slate-700 truncate max-w-[200px]">{item.name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">{item.sku}</div>
                                  {item.observation && (
                                    <div className="text-[9px] text-amber-600 italic">"{item.observation}"</div>
                                  )}
                                </td>
                                <td className="p-2.5">
                                  <input
                                    type="number"
                                    value={item.price}
                                    onChange={e => updateQuotedItemPrice(idx, parseFloat(e.target.value))}
                                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-xs font-mono text-slate-700 focus:outline-none focus:border-amber-500"
                                  />
                                </td>
                                <td className="p-2.5">
                                  <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={e => updateQuotedItemQuantity(idx, parseInt(e.target.value))}
                                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-xs font-mono text-slate-700 focus:outline-none focus:border-amber-500"
                                  />
                                </td>
                                <td className="p-2.5 text-right font-bold text-slate-700 font-mono">
                                  ${((item.price || 0) * (item.quantity || 0)).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removeQuotedItem(idx)}
                                    className="text-rose-500 hover:text-rose-700 p-1"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>

                  {/* Submission Footer with Totals */}
                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400 uppercase font-bold">Total recalculado:</span>
                      <span className="text-sm font-black text-amber-600 font-mono">${quoteFinalTotal.toLocaleString()}</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderForQuote(null)}
                        className="px-4 py-2 text-xs border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-100 transition-all font-bold"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={actionLoading === "update-quote"}
                        className="px-4 py-2 text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl transition-all flex items-center gap-1.5 uppercase tracking-wider cursor-pointer shadow-3xs"
                      >
                        {actionLoading === "update-quote" ? (
                          <>
                            <span className="w-3 h-3 border-2 border-slate-950/20 border-t-slate-950 rounded-full animate-spin" />
                            <span>Guardando...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle size={13} />
                            <span>Guardar Cotización</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                </form>
              </div>
            </div>
          )}

        </div>
      )}

      {/* SECTION 2: ACCESSES & ANALYTICS MONITOR (Original VIP accesses list) */}
      {activeSection === "accesses" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Overview Card */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-400 font-bold uppercase text-xs tracking-wider">
                  <Shield size={14} />
                  <span>Privacidad & exclusividad VIP</span>
                </div>
                <h3 className="text-xl font-extrabold tracking-tight">Módulo de Accesos Privados VIP</h3>
                <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
                  Genera PINs exclusivos asociados a departamentos del catálogo para clientes especiales. Envía invitaciones personalizadas por WhatsApp. Monitorea su navegación y compras en tiempo real.
                </p>
              </div>
              <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 flex items-center gap-3">
                <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
                  <Users size={20} />
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Enlaces VIP Generados</span>
                  <span className="text-xl font-black text-amber-400 leading-none">{accesses.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Grid: Create Form & Last Created Code */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Creator Form */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs lg:col-span-7">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <Plus size={16} className="text-slate-600" />
                <h4 className="font-bold text-sm text-slate-800">Crear Nueva Credencial VIP</h4>
              </div>

              <form onSubmit={handleCreateAccess} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Nombre del Cliente *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Juan Pérez - WhatsApp"
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">PIN de Seguridad * (3 o 4 dígitos)</label>
                    <input
                      type="text"
                      required
                      maxLength={4}
                      placeholder="Ej. 7890 o 521"
                      value={pin}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, "");
                        setPin(val);
                      }}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                    Departamentos / Categorías Autorizadas * (Selecciona al menos una)
                  </label>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {categories.map(cat => {
                      const isSelected = selectedDepts.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleDept(cat)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                            isSelected 
                              ? "bg-amber-500 text-white border-amber-500 shadow-3xs" 
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Duración de Sesión VIP (Minutos)</label>
                    <select
                      value={sessionDuration}
                      onChange={e => setSessionDuration(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-amber-500"
                    >
                      <option value={15}>15 minutos (Rápido)</option>
                      <option value={30}>30 minutos (Recomendado)</option>
                      <option value={60}>1 hora</option>
                      <option value={120}>2 horas</option>
                      <option value={240}>4 horas</option>
                      <option value={1440}>24 horas (Clientes Mayoristas)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Notas / Bitácora Interna</label>
                    <input
                      type="text"
                      placeholder="Ej. VIP Premium para calzado mayorista"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={actionLoading === "create"}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm mt-2 cursor-pointer"
                >
                  {actionLoading === "create" ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Creando acceso...</span>
                    </>
                  ) : (
                    <>
                      <Shield size={14} className="text-amber-400" />
                      <span>Generar Acceso VIP y Generar Enlace</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Success Info Banner / Share WhatsApp Block */}
            <div className="lg:col-span-5 h-full">
              {createdAccess ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-3xs flex flex-col justify-between h-full animate-fadeIn">
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-700 font-extrabold text-xs uppercase tracking-wider">
                        <ShieldAlert size={14} />
                        <span>Acceso Creado - Enviar PIN</span>
                      </div>
                      <button 
                        onClick={() => setCreatedAccess(null)} 
                        className="p-1 text-amber-500 hover:text-amber-800 hover:bg-amber-100 rounded-lg"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-2.5 text-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Cliente:</span>
                        <span className="text-xs font-bold text-slate-900">{createdAccess.access.clientName}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">PIN ÚNICO:</span>
                        <span className="text-sm font-mono font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 tracking-wider">
                          {createdAccess.rawPin}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Departamentos:</span>
                        <span className="text-xs font-bold text-right text-slate-700 truncate max-w-[200px]">
                          {createdAccess.access.allowedDepartments.join(", ")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Vence en:</span>
                        <span className="text-xs font-semibold text-slate-700">
                          {createdAccess.access.sessionDurationMinutes} Minutos de sesión
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 italic leading-snug">
                      * Por seguridad, el PIN se muestra en texto plano solo en este panel. Una vez cerrado o recargado, se almacenará de manera inalterable y cifrada como Hash en la base de datos de Firestore.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-amber-200 mt-4 flex flex-col gap-2">
                    <button
                      onClick={() => handleCopyWhatsApp(
                        createdAccess.access.clientName,
                        createdAccess.rawPin,
                        createdAccess.access.sessionDurationMinutes,
                        createdAccess.access.allowedDepartments,
                        createdAccess.access.id
                      )}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      {copiedId === createdAccess.access.id ? (
                        <>
                          <Check size={14} />
                          <span>¡Mensaje Copiado al Portapapeles!</span>
                        </>
                      ) : (
                        <>
                          <Phone size={14} />
                          <span>Copiar Mensaje Invitación WhatsApp</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center h-full min-y-[280px]">
                  <div className="p-3 bg-slate-100 text-slate-400 rounded-full mb-3">
                    <Phone size={24} />
                  </div>
                  <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-1">Compartir con WhatsApp</h5>
                  <p className="text-slate-500 text-[11px] max-w-xs leading-normal">
                    Genera una credencial VIP a la izquierda. Obtendrás un mensaje optimizado con el enlace y PIN secreto listo para ser enviado a través de WhatsApp a tu cliente.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Accesses List Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-slate-700" />
                <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">Bitácora de Clientes VIP</h4>
              </div>
              <button 
                onClick={fetchAccesses}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase bg-slate-50/50">
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">PIN</th>
                    <th className="px-4 py-3">Deptos Autorizados</th>
                    <th className="px-4 py-3">Duración</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Dispositivo</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {accesses.map(acc => {
                    const isDeviceBound = !!acc.firstUsedAt;
                    return (
                      <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-800">{acc.clientName}</div>
                          {acc.notes && <div className="text-[10px] text-slate-400 font-normal italic mt-0.5">{acc.notes}</div>}
                          <div className="text-[9px] text-slate-400 font-normal mt-0.5 flex items-center gap-1">
                            <Calendar size={9} />
                            <span>Creado: {new Date(acc.createdAt).toLocaleDateString()}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs font-semibold text-amber-600 bg-amber-50/20 px-2 py-0.5 rounded-lg border border-amber-100">
                          {acc.pinLastDigits || "****"}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {acc.allowedDepartments.map(dept => (
                              <span key={dept} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-semibold rounded-md border border-slate-200">
                                {dept}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-600">
                          {acc.sessionDurationMinutes} min
                          {acc.firstUsedAt && (
                            <span className="block text-[9px] text-emerald-600 font-medium mt-0.5">
                              Ingresó: {new Date(acc.firstUsedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {renderStatusBadge(acc.status)}
                        </td>
                        <td className="px-4 py-3.5 text-slate-500">
                          {isDeviceBound ? (
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-semibold text-slate-700 flex items-center gap-1">
                                <Smartphone size={11} className="text-slate-400" />
                                <span className="capitalize">{acc.deviceInfo?.platform || "Web"}</span>
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] italic text-slate-400">Pendiente de vincular</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right space-x-1.5">
                          <button
                            onClick={() => loadAnalytics(acc)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors inline-flex items-center gap-1 text-[11px] font-bold"
                            title="Ver Comportamiento"
                          >
                            <Activity size={12} className="text-amber-500" />
                            <span>Monitorear</span>
                          </button>

                          {acc.status === "active" && (
                            <button
                              onClick={() => handleRevoke(acc.id)}
                              disabled={actionLoading === acc.id}
                              className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg border border-amber-200 transition-colors inline-flex items-center gap-1 text-[11px] font-semibold"
                              title="Revocar acceso"
                            >
                              <ShieldAlert size={12} />
                              <span>Revocar</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleDelete(acc.id)}
                            disabled={actionLoading === acc.id}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-lg transition-colors inline-flex items-center"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Analytics & Client Events Monitor Modal */}
      {selectedAccessForAnalytics && (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-500/10 text-amber-600 rounded-xl">
                  <Activity size={18} />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm">Monitoreo de Comportamiento VIP en Tiempo Real</h4>
                  <p className="text-[11px] text-slate-400">
                    Cliente: <strong className="text-slate-600">{selectedAccessForAnalytics.clientName}</strong> | PIN: {selectedAccessForAnalytics.pinLastDigits}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedAccessForAnalytics(null)}
                className="p-1 px-2.5 text-xs border border-slate-200 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>

            {/* Active session bar if active */}
            {selectedAccessForAnalytics.status === "active" && selectedAccessForAnalytics.sessionExpiresAt && (
              <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs">
                  <Clock size={13} className="animate-pulse" />
                  <span>{getRemainingTimeText(selectedAccessForAnalytics)}</span>
                </div>
                <div className="w-1/3 bg-amber-200 rounded-full h-1.5">
                  <div 
                    className="bg-amber-500 h-1.5 rounded-full transition-all duration-1000"
                    style={{ width: `${getRemainingTimePercent(selectedAccessForAnalytics)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Content Body */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 min-h-[350px]">
              {/* Left Column: Visual Funnel Analytics */}
              <div className="md:col-span-4 space-y-4">
                <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Embudo de Conversión VIP</h5>
                
                {loadingAnalytics ? (
                  <div className="py-6 text-center">
                    <span className="w-6 h-6 border-2 border-amber-500/10 border-t-amber-500 rounded-full animate-spin inline-block" />
                  </div>
                ) : !analyticsData ? (
                  <p className="text-xs text-slate-400">Sin datos cargados.</p>
                ) : (() => {
                  const events = analyticsData.events;
                  const totalViews = events.filter(e => e.eventType === "product_view").length;
                  const totalPhotoClicks = events.filter(e => e.eventType === "image_click").length;
                  const totalWhatsappClicks = events.filter(e => e.eventType === "whatsapp_click").length;
                  const totalOrders = analyticsData.orders.length;

                  return (
                    <div className="space-y-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase font-bold">Vistas de Producto</span>
                          <span className="block text-lg font-black text-slate-800 leading-tight">{totalViews}</span>
                        </div>
                        <Eye size={16} className="text-blue-500" />
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase font-bold">Clicks en Fotos</span>
                          <span className="block text-lg font-black text-slate-800 leading-tight">{totalPhotoClicks}</span>
                        </div>
                        <Smartphone size={16} className="text-purple-500" />
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase font-bold">Clicks WhatsApp</span>
                          <span className="block text-lg font-black text-slate-800 leading-tight">{totalWhatsappClicks}</span>
                        </div>
                        <Phone size={16} className="text-emerald-500" />
                      </div>
                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] text-amber-600 uppercase font-bold">Pedidos Enviados</span>
                          <span className="block text-lg font-black text-amber-700 leading-tight">{totalOrders}</span>
                        </div>
                        <ShoppingBag size={16} className="text-amber-600" />
                      </div>
                    </div>
                  );
                })()}

                {/* Device summary info */}
                <div className="bg-slate-900 text-slate-300 rounded-2xl p-4 text-[11px] space-y-2 border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-amber-400 tracking-wider block">Huella del Dispositivo</span>
                  {selectedAccessForAnalytics.firstUsedAt ? (
                    <div className="space-y-1.5 leading-normal">
                      <div>
                        <span className="text-slate-400 block font-semibold">Ingreso inicial:</span>
                        <span>{new Date(selectedAccessForAnalytics.firstUsedAt).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-semibold">Sistema / Plataforma:</span>
                        <span className="capitalize">{selectedAccessForAnalytics.deviceInfo?.platform || "Web"}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">Cliente no ha ingresado al enlace todavía.</p>
                  )}
                </div>
              </div>

              {/* Right Column: Live Event logs & order lists */}
              <div className="md:col-span-8 flex flex-col space-y-5">
                {/* Event Logs Timeline */}
                <div className="flex-1 space-y-2.5">
                  <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Línea de Tiempo de Navegación</h5>
                  
                  {loadingAnalytics ? (
                    <div className="py-12 flex items-center justify-center">
                      <span className="w-8 h-8 border-2 border-amber-500/10 border-t-amber-500 rounded-full animate-spin" />
                    </div>
                  ) : !analyticsData || analyticsData.events.length === 0 ? (
                    <div className="py-8 bg-slate-50 border border-slate-200 border-dashed rounded-2xl text-center text-xs text-slate-400 italic">
                      Ningún evento registrado de navegación aún.
                    </div>
                  ) : (
                    <div className="border-l border-slate-100 ml-2.5 pl-4 space-y-3 max-h-[220px] overflow-y-auto">
                      {analyticsData.events.map((event, idx) => {
                        const eventDate = new Date(event.timestamp);
                        const timeStr = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        
                        let label = "";
                        let iconColor = "bg-slate-400";
                        if (event.eventType === "session_start") {
                          label = "Inició sesión VIP";
                          iconColor = "bg-blue-500";
                        } else if (event.eventType === "product_view") {
                          label = `Abrió ficha de: "${event.productName}"`;
                          iconColor = "bg-amber-500";
                        } else if (event.eventType === "image_click") {
                          label = `Expandió imágenes de: "${event.productName}"`;
                          iconColor = "bg-purple-500";
                        } else if (event.eventType === "whatsapp_click") {
                          label = `Hizo click en consulta WhatsApp de: "${event.productName}"`;
                          iconColor = "bg-emerald-500";
                        } else if (event.eventType === "submit_order") {
                          label = `Envió pedido VIP: ${event.productName}`;
                          iconColor = "bg-emerald-600";
                        }

                        return (
                          <div key={event.id || idx} className="relative flex gap-3 text-xs">
                            <span className={`absolute -left-[21.5px] top-1 w-2.5 h-2.5 ${iconColor} rounded-full ring-4 ring-white`} />
                            <span className="font-mono text-[10px] text-slate-400 shrink-0 mt-0.5">{timeStr}</span>
                            <div className="text-slate-700 font-semibold leading-normal">
                              {label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Orders section */}
                <div className="space-y-2.5 pt-4 border-t border-slate-100">
                  <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pedidos Generados desde Portal VIP</h5>
                  
                  {loadingAnalytics ? (
                    <div className="py-6 text-center">
                      <span className="w-6 h-6 border-2 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin inline-block" />
                    </div>
                  ) : !analyticsData || analyticsData.orders.length === 0 ? (
                    <div className="py-6 bg-slate-50 border border-slate-200 border-dashed rounded-2xl text-center text-xs text-slate-400 italic">
                      No se han registrado pedidos cerrados desde este acceso.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[180px] overflow-y-auto">
                      {analyticsData.orders.map(order => (
                        <div key={order.id} className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-800 font-mono">{order.id}</span>
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase rounded-full">
                              Recibido
                            </span>
                          </div>

                          <div className="divide-y divide-slate-100">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="py-1 text-[11px] flex justify-between text-slate-600">
                                <span>{item.quantity}x {item.name} ({item.category})</span>
                                <span className="font-bold text-slate-800">${(item.price * item.quantity).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 text-xs font-bold text-slate-800">
                            <span>Monto Total Pedido:</span>
                            <span className="text-amber-600 text-sm font-extrabold">${order.total.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
