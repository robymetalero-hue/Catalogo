/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Product, StoreConfig } from "../types";
import { 
  Lock, ShoppingBag, Grid, Check, Smartphone, AlertCircle, X, ShieldAlert, 
  Sparkles, Send, ArrowLeft, RefreshCw, Eye, Image as ImageIcon, Search, Trash2, Clock, Plus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ProductCard from "./ProductCard";
import ProductDetailsModal from "./ProductDetailsModal";

interface VipPortalProps {
  products: Product[];
  storeConfig: StoreConfig;
  onBackToPublic: () => void;
}

export default function VipPortal({ products, storeConfig, onBackToPublic }: VipPortalProps) {
  // Session / Auth States
  const [pin, setPin] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [deviceToken, setDeviceToken] = useState(() => localStorage.getItem("vip_device_token") || "");
  const [clientName, setClientName] = useState("");
  const [allowedDepartments, setAllowedDepartments] = useState<string[]>([]);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [accessId, setAccessId] = useState<string | null>(null);

  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [timeRemainingText, setTimeRemainingText] = useState("");

  // Cart States
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  // Auto-verify session on mount if token exists
  useEffect(() => {
    if (deviceToken) {
      verifyExistingSession();
    }
  }, []);

  // Session timer ticker
  useEffect(() => {
    if (!isAuthenticated || !sessionExpiresAt) return;

    const interval = setInterval(() => {
      const expiry = new Date(sessionExpiresAt).getTime();
      const now = Date.now();
      const diff = expiry - now;

      if (diff <= 0) {
        clearInterval(interval);
        handleSessionExpired();
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeRemainingText(`${mins}m ${secs}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated, sessionExpiresAt]);

  const verifyExistingSession = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vip/verify-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceToken })
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setClientName(data.clientName);
        setAllowedDepartments(data.allowedDepartments);
        setSessionExpiresAt(data.sessionExpiresAt);
        setAccessId(data.accessId);
        setIsAuthenticated(true);
        logAnalyticsEvent("session_start");
      } else {
        // Stale or invalid token, clean up
        localStorage.removeItem("vip_device_token");
        setDeviceToken("");
      }
    } catch (e) {
      console.warn("Could not auto-verify session with backend:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/vip/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: pin.trim(),
          deviceToken: deviceToken || null,
          deviceInfo: {
            platform: navigator.platform,
            screenResolution: `${window.screen.width}x${window.screen.height}`
          }
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Código PIN inválido.");
      }

      // Success
      localStorage.setItem("vip_device_token", data.deviceToken);
      setDeviceToken(data.deviceToken);
      setClientName(data.clientName);
      setAllowedDepartments(data.allowedDepartments);
      setSessionExpiresAt(data.sessionExpiresAt);
      setAccessId(data.accessId);
      setIsAuthenticated(true);
      setPin("");
    } catch (err: any) {
      setError(err.message || "Error de conexión con el portal.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logAnalyticsEvent("session_end");
    localStorage.removeItem("vip_device_token");
    setDeviceToken("");
    setIsAuthenticated(false);
    setClientName("");
    setAllowedDepartments([]);
    setSessionExpiresAt(null);
    setAccessId(null);
    setCart([]);
  };

  const handleSessionExpired = () => {
    logAnalyticsEvent("session_expired");
    localStorage.removeItem("vip_device_token");
    setDeviceToken("");
    setIsAuthenticated(false);
    setClientName("");
    setAllowedDepartments([]);
    setSessionExpiresAt(null);
    setAccessId(null);
    setCart([]);
    setError("Tu sesión VIP de dispositivo único ha expirado.");
  };

  // Behavioral Analytics Logging helper
  const logAnalyticsEvent = async (
    eventType: string, 
    productId?: string, 
    productName?: string, 
    departmentId?: string,
    durationSeconds?: number,
    metadata?: any
  ) => {
    const token = deviceToken || localStorage.getItem("vip_device_token");
    if (!token) return;

    try {
      await fetch("/api/vip/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceToken: token,
          eventType,
          productId,
          productName,
          departmentId,
          durationSeconds,
          metadata
        })
      });
    } catch (e) {
      console.warn("Failed to log VIP analytics event:", e);
    }
  };

  // Track product view durations
  const activeProductTimer = useRef<{ productId: string; start: number } | null>(null);
  
  const startProductViewTimer = (product: Product) => {
    activeProductTimer.current = {
      productId: product.id,
      start: Date.now()
    };
    logAnalyticsEvent("product_view", product.id, product.name, product.category);
  };

  const stopProductViewTimer = () => {
    if (activeProductTimer.current) {
      const duration = Math.round((Date.now() - activeProductTimer.current.start) / 1000);
      const prod = products.find(p => p.id === activeProductTimer.current?.productId);
      if (prod && duration > 0) {
        logAnalyticsEvent("product_view_duration", prod.id, prod.name, prod.category, duration);
      }
      activeProductTimer.current = null;
    }
  };

  // Expand image click logging
  const handleImageExpandLog = (product: Product) => {
    logAnalyticsEvent("image_click", product.id, product.name, product.category);
  };

  // Filter products by authorized categories
  const filteredProducts = products.filter(p => {
    // Must belong to allowed department and match search query
    const belongsToVip = allowedDepartments.includes(p.category);
    if (!belongsToVip) return false;

    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Shopping Cart actions
  const addToCart = (product: Product) => {
    const exists = cart.find(item => item.product.id === product.id);
    if (exists) {
      setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
    // Simple visual highlight feedback
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(cart.filter(item => item.product.id !== productId));
    } else {
      setCart(cart.map(item => item.product.id === productId ? { ...item, quantity } : item));
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const cartTotal = cart.reduce((total, item) => total + (item.product.retailPrice * item.quantity), 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    setIsCheckingOut(true);
    try {
      // 1. Build server payload
      const orderItems = cart.map(item => ({
        productId: item.product.id,
        name: item.product.name,
        sku: item.product.sku,
        price: item.product.retailPrice,
        quantity: item.quantity,
        category: item.product.category
      }));

      const departmentSummary = Array.from(new Set(cart.map(item => item.product.category))).join(", ");
      
      // WhatsApp content formatting
      const itemsListStr = cart.map(item => `• ${item.quantity}x ${item.product.name} (SKU: ${item.product.sku}) - $${(item.product.retailPrice * item.quantity).toLocaleString()}`).join("\n");
      const whatsappMessage = `*✨ PEDIDO VIP EXCLUSIVO ✨*
      
*Cliente:* ${clientName} (Acceso VIP)
*Código de Acceso:* ${accessId}
*Departamentos:* ${departmentSummary}

*Productos Solicitados:*
${itemsListStr}

*Monto Total:* $${cartTotal.toLocaleString()}

_Enviado de forma segura a través del Catálogo VIP Privado_ 🛡️`;

      // 2. Submit to backend API
      const res = await fetch("/api/vip/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceToken,
          items: orderItems,
          total: cartTotal,
          whatsappMessage,
          departmentSummary
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al registrar el pedido VIP en el backend.");
      }

      // Success
      setCheckoutSuccess(true);
      setCart([]);
      setIsCartOpen(false);

      // Trigger redirection to WhatsApp
      const cleanPhone = storeConfig.whatsappNumber.replace(/\D/g, "");
      const finalUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappMessage)}`;
      window.open(finalUrl, "_blank");

    } catch (err: any) {
      alert(err.message || "No se pudo cerrar la compra.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-between">
      
      {/* Top Header Bar */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-6 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <button 
          onClick={() => {
            stopProductViewTimer();
            onBackToPublic();
          }} 
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer font-bold uppercase tracking-wider"
        >
          <ArrowLeft size={14} />
          <span>Volver al Catálogo Público</span>
        </button>

        <div className="flex items-center gap-1">
          <Sparkles size={16} className="text-amber-400" />
          <h1 className="text-sm font-black tracking-wider uppercase text-amber-400">Portal VIP Exclusivo</h1>
        </div>

        {isAuthenticated && (
          <button 
            onClick={handleLogout}
            className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors"
          >
            Cerrar VIP
          </button>
        )}
      </header>

      {/* Main Content Stage */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col items-center justify-center">
        
        {!isAuthenticated ? (
          /* AUTH LOGIN PORTAL VIEW */
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl text-center space-y-6 my-12 animate-fadeIn">
            <div className="space-y-2">
              <div className="mx-auto w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center">
                <Lock size={22} />
              </div>
              <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Acceso Privado Exclusivo</h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                Para ingresar, introduce el PIN de seguridad de 3 o 4 dígitos enviado por tu asesor de ventas por WhatsApp.
              </p>
            </div>

            {error && (
              <div className="bg-red-950/40 text-red-400 border border-red-900/40 rounded-2xl p-4 text-xs font-semibold flex items-center gap-2 text-left">
                <ShieldAlert size={16} className="shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input
                  type="password"
                  required
                  placeholder="Introduce tu PIN VIP"
                  maxLength={4}
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-center font-mono text-lg font-black text-amber-400 tracking-widest focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-700"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !pin}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs py-3 rounded-2xl transition-all shadow-lg shadow-amber-500/10 flex items-center justify-center gap-1.5 uppercase tracking-wider cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Verificando PIN...</span>
                  </>
                ) : (
                  <>
                    <Lock size={13} />
                    <span>Desbloquear Catálogo VIP</span>
                  </>
                )}
              </button>
            </form>

            <p className="text-[10px] text-slate-500 leading-normal">
              🛡️ Protección de un solo dispositivo por PIN. La sesión expira de forma automática transcurrido el lapso de tiempo asignado.
            </p>
          </div>
        ) : (
          /* AUTHENTICATED PORTAL EXPANDED VIEW */
          <div className="w-full space-y-6 animate-fadeIn">
            
            {/* VIP Welcoming & Floating Stats Bar */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-850 border border-slate-800 rounded-3xl p-5 md:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase text-[10px] tracking-wider mb-0.5">
                  <Sparkles size={12} />
                  <span>Sección Privada Habilitada</span>
                </div>
                <h3 className="text-lg font-black text-slate-100">¡Bienvenido(a), {clientName}!</h3>
                <p className="text-xs text-slate-400">
                  Visualizas de forma exclusiva los productos de: <strong className="text-slate-300 font-bold">{allowedDepartments.join(", ")}</strong>.
                </p>
              </div>

              <div className="flex items-center gap-3 self-start sm:self-center">
                {/* Countdown timer */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
                  <div>
                    <span className="block text-[9px] uppercase text-slate-500 font-bold leading-none mb-0.5">Vence en:</span>
                    <span className="font-mono text-sm font-black text-amber-400 leading-none">{timeRemainingText}</span>
                  </div>
                </div>

                {/* Shopping Cart button trigger */}
                <button
                  onClick={() => setIsCartOpen(true)}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-2xl p-3 flex items-center justify-center gap-1.5 relative cursor-pointer shadow-md shadow-amber-500/10"
                >
                  <ShoppingBag size={18} />
                  {cart.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-black text-[9px] w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-slate-900">
                      {cart.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Filter Search controls */}
            <div className="relative max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar en el catálogo VIP..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  logAnalyticsEvent("search", undefined, e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-2 px-10 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Products Grid */}
            {filteredProducts.length === 0 ? (
              <div className="py-20 text-center border border-slate-800 border-dashed rounded-3xl space-y-2">
                <ShoppingBag size={32} className="text-slate-600 mx-auto" />
                <h4 className="font-bold text-sm text-slate-400">No se encontraron productos</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  No hay productos disponibles para los departamentos seleccionados en este PIN o que coincidan con tu búsqueda.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filteredProducts.map(product => (
                  <div key={product.id} className="relative group">
                    <ProductCard
                      product={product}
                      showPrices={storeConfig.showPrices}
                      onOpenDetails={() => {
                        startProductViewTimer(product);
                        setSelectedProduct(product);
                      }}
                    />
                    
                    {/* Add to Cart button layout for VIP */}
                    <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(product);
                        }}
                        className="p-2 bg-amber-500 text-slate-950 rounded-xl hover:scale-105 transition-transform shadow-md cursor-pointer flex items-center justify-center font-bold text-xs"
                        title="Agregar al carrito"
                      >
                        <Plus size={14} className="mr-0.5" />
                        <span>Comprar</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Shopping Cart Modal Drawer */}
      <AnimatePresence>
        {isCartOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            
            {/* Drawer */}
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.3 }}
              className="relative w-full max-w-md bg-slate-900 border-l border-slate-800 flex flex-col justify-between h-full shadow-2xl z-10 text-slate-100"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                <div className="flex items-center gap-1.5 text-amber-400 font-extrabold text-xs uppercase tracking-wider">
                  <ShoppingBag size={14} />
                  <span>Mi Carrito VIP ({cart.length})</span>
                </div>
                <button 
                  onClick={() => setIsCartOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {cart.length === 0 ? (
                  <div className="py-20 text-center space-y-2">
                    <ShoppingBag size={28} className="text-slate-700 mx-auto" />
                    <p className="text-xs text-slate-500">Tu carrito VIP está vacío.</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.product.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex gap-3 items-center">
                      <img 
                        src={item.product.images[0] || "https://images.unsplash.com/photo-1542291026-7eec264c27ff"} 
                        alt={item.product.name}
                        className="w-12 h-12 object-cover rounded-xl border border-slate-800"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-200 truncate">{item.product.name}</h4>
                        <span className="text-[10px] text-slate-500 block font-mono">{item.product.sku}</span>
                        <span className="text-xs font-black text-amber-400 block mt-1">${item.product.retailPrice.toLocaleString()}</span>
                      </div>
                      
                      {/* Controls */}
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                          className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-750 flex items-center justify-center text-xs text-slate-400 hover:text-white"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                        <button 
                          onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                          className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-750 flex items-center justify-center text-xs text-slate-400 hover:text-white"
                        >
                          +
                        </button>

                        <button 
                          onClick={() => removeFromCart(item.product.id)}
                          className="p-1.5 text-red-400 hover:text-red-300 ml-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer Checkout */}
              <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-4">
                <div className="flex items-center justify-between font-bold text-sm">
                  <span className="text-slate-400">Monto Total del Pedido:</span>
                  <span className="text-amber-400 text-base font-black">${cartTotal.toLocaleString()}</span>
                </div>

                <button
                  disabled={cart.length === 0 || isCheckingOut}
                  onClick={handleCheckout}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-black text-xs py-3 rounded-2xl transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/5"
                >
                  {isCheckingOut ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Verificando pedido en servidor...</span>
                    </>
                  ) : (
                    <>
                      <Send size={13} />
                      <span>Completar y Enviar Pedido VIP</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Product Details Modal (Hooks view duration analytics) */}
      {selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          showPrices={storeConfig.showPrices}
          whatsappNumber={storeConfig.whatsappNumber}
          whatsappCustomMessage={storeConfig.whatsappCustomMessage}
          onClose={() => {
            stopProductViewTimer();
            setSelectedProduct(null);
          }}
          onWhatsAppInquiry={(product) => {
            logAnalyticsEvent("whatsapp_click", product.id, product.name, product.category);
          }}
        />
      )}

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-6 px-4 text-center text-xs text-slate-500 space-y-1">
        <p className="font-bold text-slate-400">{storeConfig.storeName} - Portal VIP Protegido</p>
        <p className="max-w-md mx-auto text-[11px] leading-relaxed">
          Toda la navegación, clicks y pedidos realizados en esta sesión están protegidos por hardware-binding de dispositivo único y auditoría de comportamiento para garantizar la máxima seguridad y exclusividad.
        </p>
      </footer>

    </div>
  );
}
