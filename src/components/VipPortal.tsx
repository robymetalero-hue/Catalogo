/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Product, StoreConfig } from "../types";
import { 
  Lock, ShoppingBag, Grid, Check, Smartphone, AlertCircle, X, ShieldAlert, 
  Sparkles, Send, ArrowLeft, RefreshCw, Eye, Image as ImageIcon, Search, Trash2, Clock, Plus, Minus, ShieldCheck, FileText, ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ProductCard from "./ProductCard";
import ProductDetailsModal from "./ProductDetailsModal";
import { db } from "../firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";

interface VipPortalProps {
  products: Product[];
  storeConfig: StoreConfig;
  onBackToPublic: () => void;
}

export interface VipCartItem {
  product: Product;
  quantity: number;
  observation: string;
}

export default function VipPortal({ products, storeConfig, onBackToPublic }: VipPortalProps) {
  // Session / Auth States
  const [pin, setPin] = useState("");
  const [clientIdentifier, setClientIdentifier] = useState("");
  const [catalogAccessAllowed, setCatalogAccessAllowed] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [deviceToken, setDeviceToken] = useState(() => localStorage.getItem("vip_device_token") || "");
  const [clientName, setClientName] = useState("");
  const [allowedDepartments, setAllowedDepartments] = useState<string[]>([]);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [accessId, setAccessId] = useState<string | null>(null);

  // UI Navigation States
  const [portalTab, setPortalTab] = useState<"catalog" | "orders">("catalog");

  // Interaction States
  const [activeChatOrderId, setActiveChatOrderId] = useState<string | null>(null);
  const [chatText, setChatText] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [reportingPaymentOrderId, setReportingPaymentOrderId] = useState<string | null>(null);
  const [reportedPaymentMethod, setReportedPaymentMethod] = useState("transferencia");
  const [reportedPaymentRef, setReportedPaymentRef] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [timeRemainingText, setTimeRemainingText] = useState("");

  // Cart States
  const [cart, setCart] = useState<VipCartItem[]>([]);
  const [customerNote, setCustomerNote] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);

  // Client Orders History
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  const previousOrdersRef = useRef<Record<string, any>>({});
  const isFirstLoadRef = useRef(true);

  // Security States
  const [isTabBlurred, setIsTabBlurred] = useState(false);
  const [showConfidentialAlert, setShowConfidentialAlert] = useState(false);

  // Auto-verify session on mount if token exists
  useEffect(() => {
    if (deviceToken) {
      verifyExistingSession();
    }
  }, []);

  // Load and save cart in localStorage isolated by session accessId
  useEffect(() => {
    if (isAuthenticated && accessId) {
      const stored = localStorage.getItem(`vip_cart_${accessId}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setCart(parsed);
          }
        } catch (e) {
          console.warn("Error parsing VIP cart from localStorage:", e);
        }
      }
      const storedNote = localStorage.getItem(`vip_cart_note_${accessId}`);
      if (storedNote) {
        setCustomerNote(storedNote);
      }
    }
  }, [isAuthenticated, accessId]);

  useEffect(() => {
    if (isAuthenticated && accessId) {
      localStorage.setItem(`vip_cart_${accessId}`, JSON.stringify(cart));
    }
  }, [cart, isAuthenticated, accessId]);

  useEffect(() => {
    if (isAuthenticated && accessId) {
      localStorage.setItem(`vip_cart_note_${accessId}`, customerNote);
    }
  }, [customerNote, isAuthenticated, accessId]);

  // Session timer ticker
  useEffect(() => {
    if (!isAuthenticated || !sessionExpiresAt || !catalogAccessAllowed) return;

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
  }, [isAuthenticated, sessionExpiresAt, catalogAccessAllowed]);

  // SECURITY: Tab Blur / Visibility change detection
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsTabBlurred(true);
        logAnalyticsEvent("security_tab_blur");
      }
    };
    const handleBlur = () => {
      setIsTabBlurred(true);
      logAnalyticsEvent("security_window_blur");
    };
    const handleFocus = () => {
      setIsTabBlurred(false);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isAuthenticated]);

  // SECURITY: Disable context menu / right click
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logAnalyticsEvent("security_right_click");
      triggerConfidentialAlert();
    };

    window.addEventListener("contextmenu", handleContextMenu);
    return () => window.removeEventListener("contextmenu", handleContextMenu);
  }, [isAuthenticated]);

  // SECURITY: Disable key combos (PrintScreen, Ctrl+P, Ctrl+S, Ctrl+U)
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const ctrlOrMeta = isMac ? e.metaKey : e.ctrlKey;

      if (
        e.key === "PrintScreen" ||
        (ctrlOrMeta && e.key === "p") ||
        (ctrlOrMeta && e.key === "s") ||
        (ctrlOrMeta && e.key === "u")
      ) {
        e.preventDefault();
        logAnalyticsEvent("security_shortcut_blocked", undefined, undefined, undefined, undefined, { key: e.key });
        triggerConfidentialAlert();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthenticated]);

  const triggerConfidentialAlert = () => {
    setShowConfidentialAlert(true);
    setTimeout(() => {
      setShowConfidentialAlert(false);
    }, 5000);
  };

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
        setCatalogAccessAllowed(data.catalogAccessAllowed !== false);
        if (data.catalogAccessAllowed === false) {
          setPortalTab("orders");
        }
        setIsAuthenticated(true);
        logAnalyticsEvent("session_verify_ok");
        fetchMyOrders();
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

  const fetchMyOrders = async () => {
    const token = deviceToken || localStorage.getItem("vip_device_token");
    if (!token) return;

    setLoadingOrders(true);
    try {
      const res = await fetch(`/api/vip/my-orders?deviceToken=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        setMyOrders(data);
      }
    } catch (err) {
      console.warn("Error fetching personal VIP orders:", err);
    } finally {
      setLoadingOrders(false);
    }
  };

  // Reset refs when auth state or accessId changes
  useEffect(() => {
    isFirstLoadRef.current = true;
    previousOrdersRef.current = {};
  }, [isAuthenticated, accessId]);

  // Real-time listener for VIP orders
  useEffect(() => {
    if (!isAuthenticated || !accessId) return;

    setLoadingOrders(true);
    const q = query(
      collection(db, "vip_orders"),
      where("accessId", "==", accessId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const currentOrders: Record<string, any> = {};
      const ordersList: any[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        currentOrders[doc.id] = data;
        ordersList.push({ id: doc.id, ...data });
      });

      if (isFirstLoadRef.current) {
        previousOrdersRef.current = currentOrders;
        isFirstLoadRef.current = false;
        setMyOrders(ordersList);
        setLoadingOrders(false);
        return;
      }

      const previousOrders = previousOrdersRef.current;

      // Detect updates / changes
      Object.keys(currentOrders).forEach((orderId) => {
        const prevOrder = previousOrders[orderId];
        const currOrder = currentOrders[orderId];

        if (prevOrder) {
          // 1. Status change detection
          if (prevOrder.status !== currOrder.status) {
            const notifId = `${orderId}_status_${Date.now()}`;
            const newNotif = {
              id: notifId,
              orderId,
              type: "status_change",
              message: `¡Tu pedido ${orderId.replace("vip_ord_", "#")} cambió de estado! Ahora está "${currOrder.status.toUpperCase()}".`,
              oldStatus: prevOrder.status,
              newStatus: currOrder.status,
              timestamp: Date.now()
            };
            setNotifications((prev) => [...prev, newNotif]);
            
            // Play notification sound safely
            try {
              const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-600.wav");
              audio.volume = 0.4;
              audio.play().catch(() => {});
            } catch (e) {}

            setTimeout(() => {
              setNotifications((prev) => prev.filter((n) => n.id !== notifId));
            }, 8000);
          }

          // 2. Chat / Admin comments detection
          const prevChat = prevOrder.chat || [];
          const currChat = currOrder.chat || [];
          const prevAdminCount = prevChat.filter((m: any) => m.sender === "admin").length;
          const currAdminCount = currChat.filter((m: any) => m.sender === "admin").length;

          if (currAdminCount > prevAdminCount) {
            const newAdminMsgs = currChat.filter((m: any) => m.sender === "admin").slice(prevAdminCount);
            newAdminMsgs.forEach((msg: any, idx: number) => {
              const notifId = `${orderId}_comment_${Date.now()}_${idx}`;
              const newNotif = {
                id: notifId,
                orderId,
                type: "new_comment",
                message: `Nuevo mensaje del administrador: "${msg.text}"`,
                commentText: msg.text,
                timestamp: Date.now()
              };
              setNotifications((prev) => [...prev, newNotif]);

              // Play notification sound safely
              try {
                const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-600.wav");
                audio.volume = 0.4;
                audio.play().catch(() => {});
              } catch (e) {}

              setTimeout(() => {
                setNotifications((prev) => prev.filter((n) => n.id !== notifId));
              }, 8000);
            });
          }
        }
      });

      previousOrdersRef.current = currentOrders;
      setMyOrders(ordersList);
      setLoadingOrders(false);
    }, (error) => {
      console.error("Error en listener de tiempo real (VipPortal):", error);
      setLoadingOrders(false);
    });

    return () => unsubscribe();
  }, [isAuthenticated, accessId]);

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
          identifier: clientIdentifier.trim() || undefined,
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
        throw new Error(data.error || "Código PIN o datos de cliente inválidos.");
      }

      // Success
      localStorage.setItem("vip_device_token", data.deviceToken);
      setDeviceToken(data.deviceToken);
      setClientName(data.clientName);
      setAllowedDepartments(data.allowedDepartments);
      setSessionExpiresAt(data.sessionExpiresAt);
      setAccessId(data.accessId);
      setCatalogAccessAllowed(data.catalogAccessAllowed !== false);
      if (data.catalogAccessAllowed === false) {
        setPortalTab("orders");
      } else {
        setPortalTab("catalog");
      }
      setIsAuthenticated(true);
      setPin("");
      setError(null);
      
      // Load orders immediately
      setTimeout(() => fetchMyOrders(), 200);
    } catch (err: any) {
      setError(err.message || "Error de conexión con el portal.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logAnalyticsEvent("session_end");
    if (accessId) {
      localStorage.removeItem(`vip_cart_${accessId}`);
      localStorage.removeItem(`vip_cart_note_${accessId}`);
    }
    localStorage.removeItem("vip_device_token");
    setDeviceToken("");
    setIsAuthenticated(false);
    setClientName("");
    setAllowedDepartments([]);
    setSessionExpiresAt(null);
    setAccessId(null);
    setCatalogAccessAllowed(true);
    setCart([]);
    setCustomerNote("");
    setPortalTab("catalog");
  };

  const handleSessionExpired = () => {
    logAnalyticsEvent("session_expired");
    if (accessId) {
      localStorage.removeItem(`vip_cart_${accessId}`);
      localStorage.removeItem(`vip_cart_note_${accessId}`);
    }
    localStorage.removeItem("vip_device_token");
    setDeviceToken("");
    setIsAuthenticated(false);
    setClientName("");
    setAllowedDepartments([]);
    setSessionExpiresAt(null);
    setAccessId(null);
    setCatalogAccessAllowed(true);
    setCart([]);
    setCustomerNote("");
    setPortalTab("catalog");
    setError("Tu sesión VIP de dispositivo único ha expirado. Por seguridad, el catálogo de compras se ha cerrado, pero puedes volver a ingresar con tus datos.");
  };

  const sendChatMessage = async (orderId: string) => {
    if (!chatText.trim()) return;
    setSendingChat(true);
    try {
      const res = await fetch(`/api/vip/orders/${orderId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceToken,
          text: chatText.trim()
        })
      });
      if (res.ok) {
        const data = await res.json();
        // Append message to local state
        setMyOrders(prev => prev.map(o => {
          if (o.id === orderId) {
            return {
              ...o,
              chat: [...(o.chat || []), data.message]
            };
          }
          return o;
        }));
        setChatText("");
      } else {
        const err = await res.json();
        alert(err.error || "No se pudo enviar el mensaje.");
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setSendingChat(false);
    }
  };

  const submitPaymentReport = async (orderId: string) => {
    if (!reportedPaymentRef.trim()) return;
    setSubmittingPayment(true);
    try {
      const res = await fetch(`/api/vip/orders/${orderId}/report-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceToken,
          paymentMethod: reportedPaymentMethod,
          paymentReference: reportedPaymentRef.trim()
        })
      });
      if (res.ok) {
        setMyOrders(prev => prev.map(o => {
          if (o.id === orderId) {
            return {
              ...o,
              paymentStatus: "verificación_pendiente",
              paymentMethod: reportedPaymentMethod,
              paymentReference: reportedPaymentRef.trim()
            };
          }
          return o;
        }));
        setReportingPaymentOrderId(null);
        setReportedPaymentRef("");
      } else {
        const err = await res.json();
        alert(err.error || "No se pudo registrar el reporte de pago.");
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setSubmittingPayment(false);
    }
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
    // Verify department safety
    if (!allowedDepartments.includes(product.category)) {
      alert("Error: No estás autorizado para agregar este producto.");
      return;
    }

    const exists = cart.find(item => item.product.id === product.id);
    if (exists) {
      setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      logAnalyticsEvent("update_quantity", product.id, product.name, product.category, undefined, { newQuantity: exists.quantity + 1 });
    } else {
      setCart([...cart, { product, quantity: 1, observation: "" }]);
      logAnalyticsEvent("add_to_cart", product.id, product.name, product.category);
    }
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    const item = cart.find(i => i.product.id === productId);
    if (!item) return;

    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(cart.map(i => i.product.id === productId ? { ...i, quantity } : i));
      logAnalyticsEvent("update_quantity", productId, item.product.name, item.product.category, undefined, { newQuantity: quantity });
    }
  };

  const updateCartItemObservation = (productId: string, obs: string) => {
    setCart(cart.map(i => i.product.id === productId ? { ...i, observation: obs } : i));
  };

  const removeFromCart = (productId: string) => {
    const item = cart.find(i => i.product.id === productId);
    if (item) {
      setCart(cart.filter(i => i.product.id !== productId));
      logAnalyticsEvent("remove_from_cart", productId, item.product.name, item.product.category);
    }
  };

  const cartTotal = cart.reduce((total, item) => total + (item.product.retailPrice * item.quantity), 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    setIsCheckingOut(true);
    try {
      // 1. Build server payload
      const orderItems = cart.map(item => ({
        productId: item.product.id,
        quantity: item.quantity,
        observation: item.observation || ""
      }));

      const departmentSummary = Array.from(new Set(cart.map(item => item.product.category))).join(", ");

      const itemsListStr = cart.map(item => `• ${item.quantity}x ${item.product.name} (SKU: ${item.product.sku}) ${item.observation ? `[Obs: ${item.observation}]` : ""}`).join("\n");
      const whatsappMessage = `*✨ NUEVO PEDIDO VIP INTERNO ✨*
      
*Cliente:* ${clientName}
*Acceso:* ${accessId}
*Departamentos:* ${departmentSummary}

*Productos Solicitados:*
${itemsListStr}

*Nota general:* ${customerNote || "Ninguna"}

_Enviado de forma segura e interna_ 🛡️`;

      // 2. Submit to backend API
      const res = await fetch("/api/vip/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceToken,
          items: orderItems,
          customerNote: customerNote,
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
      setSubmittedOrderId(data.orderId);
      setCart([]);
      setCustomerNote("");
      setIsCartOpen(false);

      if (accessId) {
        localStorage.removeItem(`vip_cart_${accessId}`);
        localStorage.removeItem(`vip_cart_note_${accessId}`);
      }

      // Refresh orders list
      fetchMyOrders();

    } catch (err: any) {
      alert(err.message || "No se pudo procesar tu pedido. Inténtalo de nuevo.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-between relative overflow-x-hidden">
      
      {/* Dynamic Printing Blocker */}
      <style>{`
        @media print {
          body { display: none !important; }
          #print-block-screen { display: flex !important; }
        }
      `}</style>
      <div id="print-block-screen" className="hidden fixed inset-0 bg-slate-950 text-slate-100 font-sans font-black uppercase tracking-widest text-lg flex-col items-center justify-center text-center p-8 z-9999">
        <ShieldAlert size={64} className="text-red-500 mb-4 animate-bounce" />
        <p>ACCESO PRIVADO CONFIDENCIAL</p>
        <p className="text-xs text-slate-500 mt-2">La impresión y capturado de este catálogo está estrictamente prohibido.</p>
      </div>

      {/* Confidential Security Warning Overlay */}
      <AnimatePresence>
        {showConfidentialAlert && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-11/12 bg-red-950/90 border border-red-500/50 backdrop-blur-md rounded-2xl p-4 shadow-2xl flex items-start gap-3"
          >
            <ShieldAlert className="text-red-400 shrink-0 mt-0.5" size={20} />
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider mb-1">Acción Protegida</h4>
              <p className="text-[11px] text-red-200 leading-normal">
                Este catálogo privado contiene información comercial confidencial. Los intentos de copia, captura de pantalla, impresión o descarga están registrados en auditorías de seguridad.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real-time Order Notifications / Alerts */}
      <div className="fixed top-20 right-4 z-50 pointer-events-none flex flex-col gap-3 max-w-sm w-full px-4 sm:px-0">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              className="pointer-events-auto bg-slate-900/95 border border-amber-500/40 shadow-2xl rounded-2xl p-4 flex items-start gap-3 backdrop-blur-md relative overflow-hidden"
            >
              {/* Highlight bar */}
              <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-amber-500" />
              
              <div className="flex-1 text-left pl-1.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                    {notif.type === "status_change" ? "Actualización de Pedido" : "Nuevo Mensaje"}
                  </span>
                  <button
                    onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                    className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="text-xs text-slate-200 leading-normal font-semibold">
                  {notif.message}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setPortalTab("orders");
                      setActiveChatOrderId(notif.orderId);
                      setNotifications(prev => prev.filter(n => n.id !== notif.id));
                    }}
                    className="text-[10px] font-black text-amber-500 hover:text-amber-400 uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    Ver Detalles <ExternalLink size={10} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Watermark Overlay for Authenticated VIP Catalog */}
      {isAuthenticated && (
        <div className="fixed inset-0 pointer-events-none z-40 select-none overflow-hidden opacity-[0.02] flex flex-wrap gap-x-24 gap-y-24 justify-center items-center rotate-[-25deg] scale-125">
          {Array.from({ length: 100 }).map((_, i) => (
            <div key={i} className="font-mono text-[10px] whitespace-nowrap font-black tracking-widest uppercase text-slate-400 text-center">
              <div>{clientName} • ACCESO PRIVADO</div>
              <div>ID: {accessId} • {new Date().toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Blur Protection when Tab loses focus */}
      <AnimatePresence>
        {isAuthenticated && isTabBlurred && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-50 flex flex-col items-center justify-center text-center p-6"
          >
            <Lock size={44} className="text-amber-400 animate-pulse mb-3" />
            <h3 className="text-lg font-black uppercase tracking-wider text-slate-100">Sesión Protegida</h3>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed mt-1">
              Haz clic o vuelve a esta pestaña para restaurar la vista confidencial de tu catálogo privado.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header Bar */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <button 
          onClick={() => {
            stopProductViewTimer();
            onBackToPublic();
          }} 
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer font-bold uppercase tracking-wider"
        >
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">Catálogo Público</span>
        </button>

        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber-400" />
          <h1 className="text-xs sm:text-sm font-black tracking-wider uppercase text-amber-400">Portal VIP</h1>
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <>
              {catalogAccessAllowed && (
                <button
                  onClick={() => setPortalTab(portalTab === "catalog" ? "orders" : "catalog")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                    portalTab === "orders" 
                      ? "bg-amber-500 text-slate-950" 
                      : "bg-slate-800 hover:bg-slate-750 text-slate-300"
                  }`}
                >
                  <FileText size={13} />
                  <span>{portalTab === "orders" ? "Ver Productos" : `Mis Pedidos (${myOrders.length})`}</span>
                </button>
              )}

              <button 
                onClick={handleLogout}
                className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors bg-red-950/20 px-2.5 py-1.5 rounded-xl border border-red-900/30"
              >
                Cerrar
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col items-center justify-center">
        
        {!isAuthenticated ? (
          /* AUTH LOGIN PORTAL VIEW */
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl text-center space-y-6 my-12 animate-fadeIn relative z-10">
            <div className="space-y-2">
              <div className="mx-auto w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center">
                <Lock size={22} />
              </div>
              <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Acceso Privado Exclusivo</h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                Ingresa tus datos de cliente y PIN VIP asignado para acceder a tu catálogo o ver tus pedidos.
              </p>
            </div>

            {error && (
              <div className="bg-red-950/40 text-red-400 border border-red-900/40 rounded-2xl p-4 text-xs font-semibold flex items-center gap-2 text-left">
                <ShieldAlert size={16} className="shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4 text-left">
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] uppercase font-extrabold text-slate-500 tracking-wider mb-1">Nombre, Celular o Código (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: Juan Pérez, 099123456, CLI-001"
                    value={clientIdentifier}
                    onChange={e => setClientIdentifier(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-2.5 px-4 text-xs text-slate-100 focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-extrabold text-slate-500 tracking-wider mb-1 text-left">PIN VIP de Seguridad *</label>
                  <input
                    type="password"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    required
                    placeholder="••••"
                    maxLength={4}
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-center font-mono text-lg font-black text-amber-400 tracking-widest focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-700"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !pin}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-extrabold text-xs py-3 rounded-2xl transition-all shadow-lg shadow-amber-500/10 flex items-center justify-center gap-1.5 uppercase tracking-wider cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Verificando Acceso...</span>
                  </>
                ) : (
                  <>
                    <Lock size={13} />
                    <span>Acceder al Portal VIP</span>
                  </>
                )}
              </button>
            </form>

            <p className="text-[10px] text-slate-500 leading-normal">
              🛡️ Protección de un solo dispositivo por PIN. Tu sesión expira de forma automática transcurrido el lapso de tiempo asignado por tu asesor.
            </p>
          </div>
        ) : portalTab === "orders" ? (
          /* VIP USER SUBMITTED ORDERS HISTORY TAB */
          <div className="w-full space-y-6 animate-fadeIn relative z-10 max-w-3xl">
            {!catalogAccessAllowed && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5 flex gap-4 items-start text-left">
                <AlertCircle className="text-amber-400 shrink-0 mt-0.5" size={20} />
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-amber-400 uppercase tracking-wider">Período de Navegación del Catálogo Finalizado</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Tu tiempo autorizado para visualizar y realizar compras en el Catálogo VIP ha expirado. Conservas acceso exclusivo a este portal de seguimiento para consultar tu historial, realizar pagos y chatear directamente con soporte.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 text-left">
              <h3 className="text-lg font-black flex items-center gap-1.5 text-slate-100">
                <FileText className="text-amber-400" size={18} />
                <span>Historial de Pedidos VIP de esta Sesión</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Aquí puedes realizar un seguimiento en tiempo real de los pedidos enviados de forma interna y las respuestas/cotizaciones del administrador.
              </p>
            </div>

            {loadingOrders ? (
              <div className="py-20 text-center">
                <RefreshCw size={24} className="animate-spin text-slate-500 mx-auto" />
                <p className="text-xs text-slate-500 mt-2">Cargando pedidos...</p>
              </div>
            ) : myOrders.length === 0 ? (
              <div className="py-20 text-center border border-slate-800 border-dashed rounded-3xl space-y-2 bg-slate-900/20">
                <FileText size={32} className="text-slate-700 mx-auto" />
                <h4 className="font-bold text-sm text-slate-400">No has enviado pedidos todavía</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Agrega productos autorizados del catálogo a tu carrito y presiona "Enviar Pedido" para verlo registrado aquí.
                </p>
              </div>
            ) : (
              <div className="space-y-4 text-left">
                {myOrders.map((order: any) => (
                  <div key={order.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/60 pb-3">
                      <div>
                        <span className="text-[10px] font-mono font-black text-amber-500 block">{order.id}</span>
                        <span className="text-xs text-slate-400 block mt-0.5">Enviado: {new Date(order.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 block font-bold">Estado:</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          order.status === "pendiente" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" :
                          order.status === "en revisión" ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" :
                          order.status === "cotizado" ? "bg-purple-500/15 text-purple-400 border border-purple-500/30" :
                          order.status === "confirmado" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                          order.status === "preparado" ? "bg-teal-500/15 text-teal-400 border border-teal-500/30" :
                          order.status === "entregado" ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30" :
                          "bg-red-500/15 text-red-400 border border-red-500/30"
                        }`}>
                          {order.status}
                        </span>
                      </div>
                    </div>

                    {/* Order Items list */}
                    <div className="space-y-2">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Productos Solicitados:</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {order.items?.map((item: any, idx: number) => (
                          <div key={idx} className="bg-slate-950 border border-slate-800/40 rounded-xl p-2.5 flex gap-2.5 items-center">
                            {item.image && (
                              <img src={item.image} alt={item.name} className="w-10 h-10 object-cover rounded-lg border border-slate-800" />
                            )}
                            <div className="min-w-0 flex-1">
                              <h5 className="text-[11px] font-bold text-slate-200 truncate">{item.name}</h5>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                                <span>Cant: {item.quantity}</span>
                                <span>•</span>
                                <span>Precio: ${(item.price || 0).toLocaleString()}</span>
                              </div>
                              {item.observation && (
                                <p className="text-[9px] text-amber-400/80 bg-amber-500/5 px-1.5 py-0.5 rounded-md mt-1 truncate">
                                  Nota: {item.observation}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Customer generic note */}
                    {order.customerNote && (
                      <div className="bg-slate-950 border border-slate-800/40 rounded-xl p-3">
                        <span className="text-[9px] text-slate-500 font-bold uppercase block mb-1">Tu Nota de Pedido:</span>
                        <p className="text-xs text-slate-300 italic">"{order.customerNote}"</p>
                      </div>
                    )}

                    {/* ADMIN QUOTE / RESPONSE LAYER */}
                    {order.status === "cotizado" || order.finalTotal !== null || order.adminNotes ? (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center gap-1.5 text-amber-400 font-black uppercase text-[10px] tracking-wider">
                          <ShieldCheck size={14} />
                          <span>Respuesta del Administrador / Cotización</span>
                        </div>

                        {order.adminNotes && (
                          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                            {order.adminNotes}
                          </p>
                        )}

                        {/* Quoted Items Snapshot if exists */}
                        {order.quotedItems && (
                          <div className="space-y-1.5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Artículos Confirmados:</span>
                            <div className="space-y-1">
                              {order.quotedItems.map((q: any, i: number) => (
                                <div key={i} className="flex justify-between items-center text-xs bg-slate-950/40 px-3 py-1.5 rounded-lg border border-slate-800/50">
                                  <span className="text-slate-300">{q.name} (x{q.quantity})</span>
                                  <span className="font-bold text-slate-200">${(q.price || 0).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                          <span className="text-slate-400 font-bold">Total Final Cotizado:</span>
                          <span className="text-amber-400 font-black text-sm">
                            ${(order.finalTotal !== null ? order.finalTotal : order.total)?.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-950/50 rounded-xl p-3 text-center border border-slate-800 border-dashed">
                        <p className="text-[10px] text-slate-500 italic">Esperando cotización o confirmación del administrador...</p>
                      </div>
                    )}

                    {/* INTERACTIVE DELIVERY TRACKING SECTION */}
                    <div className="bg-slate-950 border border-slate-850/60 rounded-xl p-3.5 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Estado del Envío / Entrega:</span>
                        <span className={`px-2.5 py-0.5 rounded text-[9px] font-black uppercase ${
                          order.deliveryStatus === "entregado" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          order.deliveryStatus === "despachado" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse" :
                          "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        }`}>
                          {order.deliveryStatus || "En preparación"}
                        </span>
                      </div>

                      {order.deliveryTrackingUrl && (
                        <a
                          href={order.deliveryTrackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-colors bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800"
                        >
                          <ExternalLink size={12} />
                          <span>Seguir Envío Online 🚚</span>
                        </a>
                      )}

                      {order.deliveryNotes && (
                        <div className="text-xs text-slate-400 bg-slate-900/50 p-2.5 rounded-lg border border-slate-900/60 leading-relaxed">
                          {order.deliveryNotes}
                        </div>
                      )}
                    </div>

                    {/* INTERACTIVE PAYMENT REPORTING SECTION */}
                    <div className="bg-slate-950 border border-slate-850/60 rounded-xl p-3.5 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Estado del Pago:</span>
                        <span className={`px-2.5 py-0.5 rounded text-[9px] font-black uppercase ${
                          order.paymentStatus === "pagado" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          order.paymentStatus === "verificación_pendiente" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                          order.paymentStatus === "parcial" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                          "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}>
                          {order.paymentStatus === "verificación_pendiente" ? "Verificación Pendiente" : (order.paymentStatus || "pendiente")}
                        </span>
                      </div>

                      {order.paymentMethod && (
                        <div className="text-xs text-slate-400 bg-slate-900/40 p-2.5 rounded-lg flex justify-between items-center border border-slate-900/50">
                          <span>Método: <strong className="text-slate-200 capitalize">{order.paymentMethod}</strong></span>
                          {order.paymentReference && <span className="font-mono text-[11px] text-slate-400">Ref: {order.paymentReference}</span>}
                        </div>
                      )}

                      {storeConfig.paymentInstructions && (!order.paymentStatus || order.paymentStatus === "pendiente" || order.paymentStatus === "parcial" || order.paymentStatus === "verificación_pendiente") && (
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5 mt-2">
                          <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider block">🏦 Datos de Cuenta para Pago / Transferencia:</span>
                          <p className="text-slate-300 font-mono text-[10px] whitespace-pre-wrap leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/40">
                            {storeConfig.paymentInstructions}
                          </p>
                        </div>
                      )}

                      {/* Client payment input triggers */}
                      {(!order.paymentStatus || order.paymentStatus === "pendiente") && (
                        <div>
                          {reportingPaymentOrderId === order.id ? (
                            <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl mt-2 space-y-2.5">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Método de Pago</label>
                                  <select
                                    value={reportedPaymentMethod}
                                    onChange={e => setReportedPaymentMethod(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
                                  >
                                    <option value="transferencia">Transferencia Bancaria</option>
                                    <option value="deposito">Depósito Banco</option>
                                    <option value="efectivo">Efectivo contra entrega</option>
                                    <option value="otro">Otro</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Ref / Transacción *</label>
                                  <input
                                    type="text"
                                    required
                                    placeholder="Nº Referencia o Código de Pago"
                                    value={reportedPaymentRef}
                                    onChange={e => setReportedPaymentRef(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end pt-1">
                                <button
                                  type="button"
                                  onClick={() => setReportingPaymentOrderId(null)}
                                  className="text-[10px] text-slate-400 hover:text-white px-2 py-1 rounded font-bold"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  disabled={submittingPayment || !reportedPaymentRef.trim()}
                                  onClick={() => submitPaymentReport(order.id)}
                                  className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 text-[10px] font-black px-3 py-1.5 rounded-xl uppercase tracking-wider transition-colors"
                                >
                                  {submittingPayment ? "Registrando..." : "Registrar Reporte"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setReportingPaymentOrderId(order.id);
                                setReportedPaymentRef("");
                              }}
                              className="w-full bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700/50 text-[10px] font-extrabold py-2 rounded-xl transition-all uppercase tracking-wider"
                            >
                              💳 Reportar Pago / Transferencia Realizada
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* INTERACTIVE CHAT SUPPORT SYSTEM */}
                    <div className="bg-slate-950 border border-slate-850/60 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setActiveChatOrderId(activeChatOrderId === order.id ? null : order.id)}
                        className="w-full flex justify-between items-center p-3 text-[11px] font-extrabold text-slate-300 hover:bg-slate-900 transition-colors border-b border-slate-900"
                      >
                        <span className="flex items-center gap-1.5">
                          <Send size={12} className="text-amber-500" />
                          <span>Chat y Mensajería de Soporte ({(order.chat || []).length})</span>
                        </span>
                        <span>{activeChatOrderId === order.id ? "Ocultar ▲" : "Escribir o Ver ▼"}</span>
                      </button>

                      {activeChatOrderId === order.id && (
                        <div className="p-3 space-y-3 bg-slate-950/40">
                          {/* Messages Bubbles list */}
                          <div className="max-h-52 overflow-y-auto space-y-2.5 p-1">
                            {(!order.chat || order.chat.length === 0) ? (
                              <p className="text-[10px] text-slate-600 text-center py-4 italic">No hay mensajes. Envía una consulta de soporte o aclaración sobre este pedido.</p>
                            ) : (
                              order.chat.map((msg: any, mIdx: number) => {
                                const isAdmin = msg.sender === "admin";
                                return (
                                  <div key={mIdx} className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}>
                                    <div className={`max-w-[85%] rounded-2xl p-2.5 text-xs ${
                                      isAdmin 
                                        ? "bg-slate-800 text-slate-200 rounded-tl-none" 
                                        : "bg-amber-500/10 border border-amber-500/20 text-slate-100 rounded-tr-none"
                                    }`}>
                                      <span className="block text-[8px] font-extrabold uppercase tracking-wider mb-0.5 text-slate-500">
                                        {isAdmin ? "Asesor VIP" : "Cliente (Tú)"}
                                      </span>
                                      <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                      <span className="block text-[8px] text-slate-600 text-right mt-1 font-mono">
                                        {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Message inputs form */}
                          <div className="flex gap-2.5 pt-1.5 border-t border-slate-900/60">
                            <input
                              type="text"
                              placeholder="Escribe tu consulta para el asesor..."
                              value={chatText}
                              onChange={e => setChatText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") {
                                  sendChatMessage(order.id);
                                }
                              }}
                              className="flex-1 bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                            />
                            <button
                              disabled={sendingChat || !chatText.trim()}
                              onClick={() => sendChatMessage(order.id)}
                              className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-black px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors"
                            >
                              Enviar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* AUTHENTICATED PORTAL EXPANDED VIEW */
          <div className="w-full space-y-6 animate-fadeIn relative z-10">
            
            {/* VIP Welcoming & Floating Stats Bar */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-850 border border-slate-800 rounded-3xl p-5 md:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase text-[10px] tracking-wider mb-0.5">
                  <Sparkles size={12} />
                  <span>Sección Privada Confidencial</span>
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
                  onClick={() => {
                    setIsCartOpen(true);
                    logAnalyticsEvent("open_cart");
                  }}
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

            {/* Checkout order success layout */}
            <AnimatePresence>
              {checkoutSuccess && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-emerald-950/40 border border-emerald-500/30 rounded-3xl p-6 text-center space-y-3 relative overflow-hidden"
                >
                  <div className="mx-auto w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center">
                    <Check size={24} />
                  </div>
                  <h4 className="text-base font-black text-white">¡Pedido VIP Enviado Correctamente!</h4>
                  <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                    Hemos recibido tu solicitud interna de forma segura (Orden ID: <span className="font-mono font-bold text-amber-400">{submittedOrderId}</span>). El administrador revisará las cantidades, disponibilidad y te responderá con una cotización final aquí mismo.
                  </p>
                  <div className="flex justify-center gap-3 pt-2">
                    <button
                      onClick={() => setPortalTab("orders")}
                      className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs px-4 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Seguir mi Pedido
                    </button>
                    <button
                      onClick={() => setCheckoutSuccess(false)}
                      className="bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer"
                    >
                      Seguir Navegando
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                {filteredProducts.map(product => {
                  const isInCart = cart.some(item => item.product.id === product.id);
                  const cartItem = cart.find(item => item.product.id === product.id);

                  return (
                    <div key={product.id} className="relative group bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-amber-500/40 transition-colors">
                      <div className="cursor-pointer" onClick={() => {
                        startProductViewTimer(product);
                        setSelectedProduct(product);
                      }}>
                        <img
                          src={product.images[0] || "https://images.unsplash.com/photo-1542291026-7eec264c27ff"}
                          alt={product.name}
                          className="w-full h-44 object-cover select-none pointer-events-none"
                          onDragStart={e => e.preventDefault()}
                        />
                        <div className="p-4 space-y-1.5">
                          <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">{product.category}</span>
                          <h4 className="text-xs font-bold text-slate-100 truncate">{product.name}</h4>
                          <span className="text-[10px] text-slate-500 font-mono block">SKU: {product.sku}</span>
                          {storeConfig.showPrices && (
                            <span className="text-sm font-black text-amber-400 block pt-1">${product.retailPrice.toLocaleString()}</span>
                          )}
                        </div>
                      </div>

                      {/* Mobile friendly Shopping Actions */}
                      <div className="p-4 pt-0">
                        {isInCart ? (
                          <div className="flex items-center justify-between bg-slate-950 border border-slate-800 p-1.5 rounded-xl">
                            <button
                              onClick={() => updateCartQuantity(product.id, (cartItem?.quantity || 1) - 1)}
                              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-750 flex items-center justify-center text-xs text-slate-400 hover:text-white shrink-0"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="text-xs font-bold font-mono text-slate-200">{cartItem?.quantity}</span>
                            <button
                              onClick={() => updateCartQuantity(product.id, (cartItem?.quantity || 1) + 1)}
                              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-750 flex items-center justify-center text-xs text-slate-400 hover:text-white shrink-0"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(product)}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[10px] py-2 rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Plus size={12} />
                            <span>Agregar al Pedido</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                  <span>Mi Pedido VIP ({cart.length} ítems)</span>
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
                    <p className="text-xs text-slate-500">Tu pedido interno está vacío.</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.product.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex flex-col gap-2">
                      <div className="flex gap-3 items-center">
                        <img 
                          src={item.product.images[0] || "https://images.unsplash.com/photo-1542291026-7eec264c27ff"} 
                          alt={item.product.name}
                          className="w-12 h-12 object-cover rounded-xl border border-slate-800 select-none pointer-events-none"
                          onDragStart={e => e.preventDefault()}
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

                      {/* Observations input per product */}
                      <div className="mt-1">
                        <input
                          type="text"
                          placeholder="Nota (ej. Talla, Color, Observaciones adicionales...)"
                          value={item.observation}
                          onChange={e => updateCartItemObservation(item.product.id, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800/80 rounded-xl px-3 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer Checkout */}
              <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-4">
                
                {/* General Note of the Order */}
                {cart.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Nota General del Pedido:</label>
                    <textarea
                      placeholder="Instrucciones especiales de entrega, notas para el vendedor..."
                      rows={2}
                      value={customerNote}
                      onChange={e => setCustomerNote(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-850 rounded-xl p-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between font-bold text-sm pt-2 border-t border-slate-800/60">
                  <span className="text-slate-400">Total Estimado del Pedido:</span>
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
                      <span>Procesando Pedido Seguro...</span>
                    </>
                  ) : (
                    <>
                      <Send size={13} />
                      <span>Enviar Pedido Interno Seguro</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Product Details Modal */}
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
          Toda la navegación, clics y pedidos realizados en esta sesión están protegidos por hardware-binding de dispositivo único y auditoría de comportamiento para garantizar la máxima seguridad y exclusividad.
        </p>
      </footer>

    </div>
  );
}
