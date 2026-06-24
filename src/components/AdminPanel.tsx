/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Product, StoreConfig } from "../types";
import { db } from "../firebase";
import { doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { 
  Store, Plus, Edit2, Trash2, Save, X, Eye, EyeOff, Video, Link, Check, Image as ImageIcon, Sparkles, FolderPlus, Phone, TrendingUp, ThumbsUp, BarChart2, Upload, CloudUpload, RefreshCw,
  Database, HardDrive, AlertTriangle, CheckCircle, Shield, HelpCircle, Terminal
} from "lucide-react";
import { validateImageFile } from "../utils/imageUtils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

interface AdminPanelProps {
  products: Product[];
  storeConfig: StoreConfig;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setStoreConfig: React.Dispatch<React.SetStateAction<StoreConfig>>;
  onRefreshProducts: (silent?: boolean) => void;
  onRefreshConfig: (silent?: boolean) => void;
  currentUser?: any | null;
}

export interface UploadQueueItem {
  id: string;
  file: File | null;
  name: string;
  previewUrl: string;
  progress: number;
  status: "pending" | "compressing" | "uploading" | "success" | "error";
  url: string | null;
  errorMsg: string | null;
  backupBase64?: string;
}

const CATEGORY_PRESETS = ["Calzado", "Ropa", "Accesorios", "Hogar", "Tecnología", "Salud y Belleza", "Deportes", "Otros"];

export default function AdminPanel({
  products,
  storeConfig,
  setProducts,
  setStoreConfig,
  onRefreshProducts,
  onRefreshConfig,
  currentUser,
}: AdminPanelProps) {
  // Generic helper for resilient, zero-friction optimistic UI updates with automatic recovery (rollback) on failure
  const executeProductsOptimistically = async (
    getOptimisticNewState: (currentProducts: Product[]) => Product[],
    asyncOperation: () => Promise<void>,
    errorMessage: string
  ) => {
    // 1. Back up current state and cache
    const previousProducts = [...products];
    let previousCache: string | null = null;
    try {
      previousCache = localStorage.getItem("local_products_cache");
    } catch (e) {}

    // 2. Compute and immediately render the optimistic state
    const optimisticProducts = getOptimisticNewState(products);
    setProducts(optimisticProducts);
    try {
      localStorage.setItem("local_products_cache", JSON.stringify(optimisticProducts));
    } catch (e) {}

    try {
      // 3. Execute the actual dynamic storage task (Firestore/API)
      await asyncOperation();
      
      // 4. If successful, refresh the states in the background (silently) to align details
      onRefreshProducts(true);
    } catch (error: any) {
      console.error(`[Optimistic Rollback] ${errorMessage}:`, error);
      showToast(`${errorMessage}: ${error.message || error}`, "error");
      // Integrar logger de diagnóstico inteligente en tiempo real
      if (typeof addErrorLog === "function") {
        addErrorLog(errorMessage, error);
      }

      // 5. ROLLBACK immediately to the previous state to maintain perfect safety
      setProducts(previousProducts);
      try {
        if (previousCache !== null) {
          localStorage.setItem("local_products_cache", previousCache);
        } else {
          localStorage.removeItem("local_products_cache");
        }
      } catch (e) {}
    }
  };

  const executeStoreConfigOptimistically = async (
    getOptimisticNewState: (currentStoreConfig: StoreConfig) => StoreConfig,
    asyncOperation: () => Promise<void>,
    errorMessage: string
  ) => {
    // 1. Back up current state and cache
    const previousStoreConfig = { ...storeConfig };
    let previousCache: string | null = null;
    try {
      previousCache = localStorage.getItem("local_store_config_cache");
    } catch (e) {}

    // 2. Compute and immediately render the optimistic state
    const optimisticStoreConfig = getOptimisticNewState(storeConfig);
    setStoreConfig(optimisticStoreConfig);
    try {
      localStorage.setItem("local_store_config_cache", JSON.stringify(optimisticStoreConfig));
    } catch (e) {}

    try {
      // 3. Execute actual write task
      await asyncOperation();

      // 4. Perform background refresh
      onRefreshConfig(true);
    } catch (error: any) {
      console.error(`[Optimistic Rollback] ${errorMessage}:`, error);
      showToast(`${errorMessage}: ${error.message || error}`, "error");
      // Integrar logger de diagnóstico inteligente en tiempo real
      if (typeof addErrorLog === "function") {
        addErrorLog(errorMessage, error);
      }

      // 5. ROLLBACK
      setStoreConfig(previousStoreConfig);
      try {
        if (previousCache !== null) {
          localStorage.setItem("local_store_config_cache", previousCache);
        } else {
          localStorage.removeItem("local_store_config_cache");
        }
      } catch (e) {}
    }
  };

  // Calculated engagement metrics for User Feedback & Interest Dashboard
  const totalViews = products.reduce((acc, p) => acc + (p.views || 0), 0);
  const totalClicks = products.reduce((acc, p) => acc + (p.whatsappClicks || 0), 0);

  // Find product with max views
  const mostViewedProduct = products.length > 0 
    ? [...products].sort((a, b) => (b.views || 0) - (a.views || 0))[0] 
    : null;

  // Find product with max clicks
  const mostClickedProduct = products.length > 0 
    ? [...products].sort((a, b) => (b.whatsappClicks || 0) - (a.whatsappClicks || 0))[0] 
    : null;

  // Pre-process data for upgraded Recharts Dashboard
  const hasAnalyticsData = products.some(p => (p.views || 0) > 0 || (p.whatsappClicks || 0) > 0);

  // 1. Top Products by Views & WhatsApp Clicks (sorted by views + clicks)
  const topProductsChartData = [...products]
    .sort((a, b) => ((b.views || 0) + (b.whatsappClicks || 0)) - ((a.views || 0) + (a.whatsappClicks || 0)))
    .slice(0, 8)
    .map(p => ({
      name: p.name.length > 15 ? p.name.substring(0, 13) + "..." : p.name,
      fullName: p.name,
      vistas: p.views || 0,
      consultas: p.whatsappClicks || 0,
    }));

  // 2. Category Performance (views, clicks, total)
  const categoryChartData = (() => {
    const categoryDataMap: Record<string, { views: number; clicks: number; count: number }> = {};
    products.forEach(p => {
      const cat = p.category || "Otros";
      if (!categoryDataMap[cat]) {
        categoryDataMap[cat] = { views: 0, clicks: 0, count: 0 };
      }
      categoryDataMap[cat].views += p.views || 0;
      categoryDataMap[cat].clicks += p.whatsappClicks || 0;
      categoryDataMap[cat].count += 1;
    });

    return Object.keys(categoryDataMap).map(cat => ({
      name: cat,
      vistas: categoryDataMap[cat].views,
      consultas: categoryDataMap[cat].clicks,
      productos: categoryDataMap[cat].count,
      total: categoryDataMap[cat].views + categoryDataMap[cat].clicks
    })).sort((a, b) => b.total - a.total).slice(0, 8);
  })();

  // 3. Products with Best Conversion Rates (Clicks / Views * 100)
  const topConversionProducts = [...products]
    .filter(p => (p.views || 0) >= 2)
    .map(p => {
      const rate = p.views && p.views > 0 ? ((p.whatsappClicks || 0) / p.views) * 100 : 0;
      return {
        name: p.name.length > 15 ? p.name.substring(0, 13) + "..." : p.name,
        fullName: p.name,
        vistas: p.views || 0,
        consultas: p.whatsappClicks || 0,
        tasaConversion: Number(rate.toFixed(1)),
      };
    })
    .sort((a, b) => b.tasaConversion - a.tasaConversion)
    .slice(0, 8);

  // Top 3 high-converting products list for the insight sidebar
  const top3ConversionInsights = [...products]
    .filter(p => (p.views || 0) >= 2 && (p.whatsappClicks || 0) > 0)
    .map(p => {
      const rate = p.views && p.views > 0 ? ((p.whatsappClicks || 0) / p.views) * 100 : 0;
      return {
        id: p.id,
        name: p.name,
        vistas: p.views || 0,
        consultas: p.whatsappClicks || 0,
        rate: Number(rate.toFixed(1)),
      };
    })
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3);

  // Global conversion rate
  const globalConversionRate = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : "0.0";

  // Colors for Category cells
  const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#06B6D4', '#64748B'];

  // Global States
  const [activeTab, setActiveTab] = useState<"products" | "store" | "diagnostics" | "users" | "categories">("products");
  const [analyticsTab, setAnalyticsTab] = useState<"products" | "categories" | "conversion">("products");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "warning" } | null>(null);
  const [loading, setLoading] = useState(false);

  // Cloud diagnostics states
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  
  // Real-Time Intelligent Logging and Local Diagnostics
  interface DiagnosticErrorLog {
    id: string;
    timestamp: string;
    action: string;
    message: string;
    code?: string;
    status?: number;
    details?: string;
    diagnosis: string;
    solution: string;
  }
  const [errorLogs, setErrorLogs] = useState<DiagnosticErrorLog[]>([]);
  const [localDiagnosticResults, setLocalDiagnosticResults] = useState<{
    running: boolean;
    firebaseClientRead: { status: "success" | "error" | null; details: string };
    firebaseClientWrite: { status: "success" | "error" | null; details: string };
    serverApiGet: { status: "success" | "error" | null; details: string };
    serverApiPost: { status: "success" | "error" | null; details: string };
  }>({
    running: false,
    firebaseClientRead: { status: null, details: "" },
    firebaseClientWrite: { status: null, details: "" },
    serverApiGet: { status: null, details: "" },
    serverApiPost: { status: null, details: "" },
  });

  const addErrorLog = (action: string, error: any) => {
    console.error(`[Intelligent Diagnostic Monitor] Error capturado en: ${action} =>`, error);
    
    let errMsg = error.message || String(error);
    let errCode = error.code || "";
    let status = error.status || undefined;
    let diagnosis = "Error general o de red desconocido. Puede deberse a fluctuaciones temporales en tu Wi-Fi, cortes de conexión móvil, o carga pesada en el host.";
    let solution = "1. Recarga la página y vuelve a intentar la operación.\n2. Verifica el estado de tu conexión de red local y que puedas acceder a otras páginas web.";

    // Analizador de Reglas de Firestore
    if (errCode === "permission-denied" || errMsg.includes("permission-denied") || errMsg.includes("Missing or insufficient permissions")) {
      diagnosis = "❌ RESTRICCIÓN DE REGLAS DE FIRESTORE: El navegador intentó escribir o modificar un documento directamente en Firestore usando la base de datos de cliente, pero las reglas de seguridad denegaron el acceso.";
      solution = "¡No te preocupes! El sistema cuenta con redundancia en el servidor Express que pasa a través de las API Admin SDK seguras. Para solucionarlo, fíjate si el producto de todos modos fue creado tras unos segundos de sincronización automática por el backend. Hemos configurado firestore.rules para admitir lecturas y escrituras sin restricciones.";
    } 
    // Analizador de Red del Cliente
    else if (errMsg.includes("Failed to fetch") || errMsg.includes("TypeError: Fetch failed") || errMsg.includes("NetworkError")) {
      diagnosis = "❌ FALLO DE RED / SERVIDOR APAGADO: Tu navegador no pudo realizar la petición HTTP porque perdió la conexión a Internet o el servidor de backend experimentó un reinicio inesperado o saturación.";
      solution = "1. Recomensamos verificar que tu conexión sea estable.\n2. Si estás en modo de desarrollo, el servidor de Express podría estar reiniciándose, por lo que responderá correctamente en pocos segundos. Intenta refrescar de nuevo.";
    }
    // Analizador de Errores de API REST de Express
    else if (status === 400 || status === 401 || status === 403 || status === 404 || status === 500) {
      if (status === 403 || status === 401) {
        diagnosis = `❌ ERROR DE SEGURIDAD DEL SERVIDOR (HTTP ${status}): El servidor backend denegó la operación por falta de comprobación de identidad válida de tu cuenta administrativa.`;
        solution = "1. Es posible que tu token de sesión de administrador haya vencido.\n2. Cierra tu sesión en el panel y vuelve a iniciar sesión con tu cuenta de administrador principal para renovar tus permisos de forma segura.";
      } else if (status === 400) {
        diagnosis = `❌ ERROR DE DATOS EN SERVIDOR (HTTP ${status}): El servidor recibió parámetros que no reconoce o que están mal estructurados o campos faltantes obligatorios.`;
        solution = "Revisa detalladamente la información del producto. Asegúrate de proporcionar un SKU único, un nombre válido y que los campos de precios sean números correctos superiores o iguales a cero.";
      } else if (status === 404) {
        diagnosis = `❌ RUTA NO ENCONTRADA (HTTP ${status}): La API del servidor backend no localizó el recurso solicitado o la dirección de la ruta web cambió.`;
        solution = "Verifica que el servidor de NodeJS se encuentre activo y compilado de la última versión sin errores. Ejecuta el autodiagnóstico en la sección de conexiones.";
      } else {
        diagnosis = `❌ FALLO INTERNO DE BACKEND (HTTP ${status}): Ocurrió una excepción imprevista en el código interno de NodeJS en el servidor al intentar procesar esta solicitud.`;
        solution = "1. Revisa la consola o los logs del servidor para identificar el error de backend.\n2. Comúnmente se debe a bases de datos ocupadas, cuellos de botella temporales o un valor nulo inesperado en Firestore. Intenta de nuevo.";
      }
    }

    const newLog: DiagnosticErrorLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString() + " " + new Date().toLocaleDateString(),
      action,
      message: errMsg,
      code: errCode,
      status,
      diagnosis,
      solution
    };

    setErrorLogs(prev => [newLog, ...prev].slice(0, 50)); // Mantener últimos 50 logs
  };

  const runLocalDiagnosticTest = async () => {
    if (localDiagnosticResults.running) return;
    setLocalDiagnosticResults({
      running: true,
      firebaseClientRead: { status: null, details: "Iniciando lectura..." },
      firebaseClientWrite: { status: null, details: "Esperando..." },
      serverApiGet: { status: null, details: "Esperando..." },
      serverApiPost: { status: null, details: "Esperando..." },
    });

    console.log("[Diagnostic Test] Iniciando Diagnóstico de Lectura/Escritura en directo...");

    // 1. Firebase Client Read Test
    let readOk = false;
    try {
      const startTime = performance.now();
      const testRef = doc(db, "storeConfig", "default");
      // Importamos getDoc dinámicamente si no está arriba
      const { getDoc } = await import("firebase/firestore");
      const docSnap = await getDoc(testRef);
      const latency = Math.round(performance.now() - startTime);
      
      setLocalDiagnosticResults(prev => ({
        ...prev,
        firebaseClientRead: { 
          status: "success", 
          details: `Lectura exitosa. Acceso directo de cliente activo. Latencia: ${latency}ms. Documento localizado: ${docSnap.exists() ? "Sí ✅" : "No (Usa valores por defecto)"}` 
        }
      }));
      readOk = true;
    } catch (err: any) {
      console.warn("[Diagnostic Test] Falló prueba cliente lectura Firestore:", err);
      setLocalDiagnosticResults(prev => ({
        ...prev,
        firebaseClientRead: { 
          status: "error", 
          details: `Fallo directo: ${err.code || ""} - ${err.message || String(err)}. Posible restricción de seguridad o de conexión local.` 
        }
      }));
    }

    // 2. Firebase Client Write Test
    try {
      const startTime = performance.now();
      const testWriteRef = doc(db, "diagnostics", currentUser?.uid || "test_anonymous");
      await setDoc(testWriteRef, { 
        testValue: "dstores_diagnostic_ping", 
        timestamp: new Date().toISOString() 
      }, { merge: true });
      const latency = Math.round(performance.now() - startTime);
      
      setLocalDiagnosticResults(prev => ({
        ...prev,
        firebaseClientWrite: { 
          status: "success", 
          details: `Escritura exitosa directo a Firestore. Las reglas de seguridad de cliente permiten grabaciones remotas. Latencia: ${latency}ms.` 
        }
      }));
    } catch (err: any) {
      console.warn("[Diagnostic Test] Falló prueba cliente escritura Firestore:", err);
      setLocalDiagnosticResults(prev => ({
        ...prev,
        firebaseClientWrite: { 
          status: "error", 
          details: `Fallo directo: ${err.code || ""} - ${err.message || String(err)}. Si da Error de Permisos, las Reglas de Firestore del cliente restringen accesos directos de escritura no autenticada, lo cual es normal si no estás logueado en Firebase Client directamente.` 
        }
      }));
    }

    // 3. Server API GET Test
    let apiGetOk = false;
    try {
      const startTime = performance.now();
      const res = await fetch("/api/products");
      const latency = Math.round(performance.now() - startTime);
      if (res.ok) {
        setLocalDiagnosticResults(prev => ({
          ...prev,
          serverApiGet: { 
            status: "success", 
            details: `Servidor Express respondió perfectamente. HTTP ${res.status} OK. Tiempo de respuesta: ${latency}ms.` 
          }
        }));
        apiGetOk = true;
      } else {
        setLocalDiagnosticResults(prev => ({
          ...prev,
          serverApiGet: { 
            status: "error", 
            details: `El servidor devolvió un error HTTP ${res.status}. No se pudo consultar la API del catálogo de forma correcta.` 
          }
        }));
      }
    } catch (err: any) {
      setLocalDiagnosticResults(prev => ({
        ...prev,
        serverApiGet: { 
          status: "error", 
          details: `Error al realizar fetch hacia el servidor: ${err.message || String(err)}` 
        }
      }));
    }

    // 4. Server API POST (Admin permissions validation)
    try {
      const startTime = performance.now();
      // Hacemos una llamada ficticia al config para ver si requireAdmin nos deja pasar
      const res = await fetch("/api/store-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": currentUser?.uid || "usr_roby_fallback"
        },
        body: JSON.stringify({ 
          storeName: storeConfig.storeName || "Mi Tienda",
          updatedAt: new Date().toISOString()
        })
      });
      const latency = Math.round(performance.now() - startTime);
      if (res.ok) {
        setLocalDiagnosticResults(prev => ({
          ...prev,
          serverApiPost: { 
            status: "success", 
            details: `Autorización administrativa aprobada en backend! HTTP ${res.status} OK. Latencia: ${latency}ms. Tienes permisos totales de bypass administrativo en el backend actual.` 
          }
        }));
      } else {
        const errText = await res.text();
        setLocalDiagnosticResults(prev => ({
          ...prev,
          serverApiPost: { 
            status: "error", 
            details: `Servidor denegó la escritura: HTTP ${res.status}. Respuesta: ${errText || "Acceso restringido por middleware admin."}` 
          }
        }));
      }
    } catch (err: any) {
      setLocalDiagnosticResults(prev => ({
        ...prev,
        serverApiPost: { 
          status: "error", 
          details: `Error de conexión en POST: ${err.message || String(err)}` 
        }
      }));
    }

    setLocalDiagnosticResults(prev => ({ ...prev, running: false }));
    console.log("[Diagnostic Test] Pruebas completadas.");
  };

  // User Management States
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null); // null = new user
  
  // User Form fields
  const [userFormName, setUserFormName] = useState("");
  const [userFormUsername, setUserFormUsername] = useState("");
  const [userFormPassword, setUserFormPassword] = useState("");
  const [userFormRole, setUserFormRole] = useState("Vendedor");
  const [userFormPregunta, setUserFormPregunta] = useState("");
  const [userFormRespuesta, setUserFormRespuesta] = useState("");

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/users", {
        headers: { "Authorization": currentUser?.uid || "" }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        showToast("Error al cargar lista de usuarios del catálogo", "error");
      }
    } catch (err: any) {
      showToast("Fallo al conectar con el servidor: " + err.message, "error");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users" && currentUser?.role === "Administrador") {
      fetchUsers();
    }
  }, [activeTab, currentUser]);

  const handleOpenNewUserForm = () => {
    setEditingUserId(null);
    setUserFormName("");
    setUserFormUsername("");
    setUserFormPassword("");
    setUserFormRole("Vendedor");
    setUserFormPregunta("");
    setUserFormRespuesta("");
    setIsEditingUser(true);
  };

  const handleOpenEditUserForm = (u: any) => {
    setEditingUserId(u.id);
    setUserFormName(u.name);
    setUserFormUsername(u.username);
    setUserFormPassword(u.password || "");
    setUserFormRole(u.role || "Vendedor");
    setUserFormPregunta(u.preguntaSeguridad || "");
    setUserFormRespuesta(u.respuestaSeguridad || "");
    setIsEditingUser(true);
  };

  const handleSubmitUserForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormName || !userFormUsername || !userFormPassword) {
      showToast("Por favor completa todos los campos obligatorios.", "error");
      return;
    }

    setLoading(true);
    const previousUsers = [...users];
    const tempId = editingUserId || `user_${Date.now()}`;
    const payload = {
      id: tempId,
      name: userFormName,
      username: userFormUsername,
      password: userFormPassword,
      role: userFormRole,
      preguntaSeguridad: userFormPregunta,
      respuestaSeguridad: userFormRespuesta
    };

    let optimisticUsers = [...users];
    if (editingUserId) {
      optimisticUsers = users.map(u => u.id === editingUserId ? { ...u, ...payload } : u);
    } else {
      optimisticUsers = [...users, payload];
    }
    setUsers(optimisticUsers);
    setIsEditingUser(false);

    try {
      let res;
      if (editingUserId) {
        res = await fetch(`/api/users/${editingUserId}`, {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": currentUser?.uid || ""
          },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`/api/users`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": currentUser?.uid || ""
          },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        showToast(editingUserId ? "Usuario actualizado con éxito." : "Usuario creado con éxito.", "success");
        fetchUsers();
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Error al guardar el usuario.");
      }
    } catch (err: any) {
      console.error("[Optimistic Rollback] Error saving user:", err);
      showToast("Error de conexión: " + err.message, "error");
      setUsers(previousUsers);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (id === currentUser?.uid) {
      showToast("No puedes eliminar tu propio usuario activo.", "error");
      return;
    }
    if (!confirm(`¿Estás seguro de que deseas eliminar al usuario "${name}"?`)) {
      return;
    }

    setLoading(true);
    const previousUsers = [...users];
    setUsers(users.filter(u => u.id !== id));

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": currentUser?.uid || ""
        }
      });

      if (res.ok) {
        showToast("Usuario eliminado con éxito.", "success");
        fetchUsers();
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Fallo al eliminar usuario.");
      }
    } catch (err: any) {
      console.error("[Optimistic Rollback] Error deleting user:", err);
      showToast("Error al eliminar usuario: " + err.message, "error");
      setUsers(previousUsers);
    } finally {
      setLoading(false);
    }
  };

  const fetchDiagnostics = async () => {
    setLoadingDiagnostics(true);
    try {
      const res = await fetch("/api/diagnostics");
      if (res.ok) {
        const data = await res.json();
        setDiagnostics(data);
      } else {
        setDiagnostics({ error: `Servidor devolvió estado ${res.status}` });
      }
    } catch (err: any) {
      setDiagnostics({ error: err.message || String(err) });
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  const [cloudErrors, setCloudErrors] = useState<any[]>([]);
  const [loadingCloudErrors, setLoadingCloudErrors] = useState(false);

  const fetchCloudErrors = async () => {
    setLoadingCloudErrors(true);
    try {
      const res = await fetch("/api/errors", {
        headers: { "Authorization": currentUser?.uid || "" }
      });
      if (res.ok) {
        const data = await res.json();
        setCloudErrors(data);
      }
    } catch (err) {
      console.error("Error al obtener errores de la nube:", err);
    } finally {
      setLoadingCloudErrors(false);
    }
  };

  const handleResolveError = async (id: string) => {
    try {
      const res = await fetch("/api/errors/resolve", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": currentUser?.uid || ""
        },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        showToast("Falla técnica marcada como resuelta.", "success");
        fetchCloudErrors();
      } else {
        showToast("No se pudo actualizar el estado de la falla.", "error");
      }
    } catch (err: any) {
      showToast("Error de conexión: " + err.message, "error");
    }
  };

  const handleResolveAllErrors = async () => {
    if (!confirm("¿Deseas marcar todos los errores pendientes como resueltos?")) return;
    try {
      const res = await fetch("/api/errors/resolve", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": currentUser?.uid || ""
        },
        body: JSON.stringify({ resolveAll: true })
      });
      if (res.ok) {
        showToast("Todos los errores marcados como resueltos.", "success");
        fetchCloudErrors();
      }
    } catch (err: any) {
      showToast("Error de conexión: " + err.message, "error");
    }
  };

  const handleClearAllErrors = async () => {
    if (!confirm("¿Estás seguro de que deseas vaciar por completo el historial técnico? Esta acción borrará todos los registros permanentemente.")) return;
    try {
      const res = await fetch("/api/errors/clear", {
        method: "DELETE",
        headers: { "Authorization": currentUser?.uid || "" }
      });
      if (res.ok) {
        showToast("Historial técnico vaciado permanentemente.", "success");
        setCloudErrors([]);
      }
    } catch (err: any) {
      showToast("Error de conexión: " + err.message, "error");
    }
  };

  useEffect(() => {
    if (activeTab === "diagnostics") {
      fetchDiagnostics();
      fetchCloudErrors();
    }
  }, [activeTab]);

  // Store Configuration state
  const [storeName, setStoreName] = useState(storeConfig.storeName || "Mi Tienda Virtual");
  const [address, setAddress] = useState(storeConfig.address || "");
  const [phone, setPhone] = useState(storeConfig.phone || "");
  const [whatsappNumber, setWhatsappNumber] = useState(storeConfig.whatsappNumber || "");
  const [whatsappCustomMessage, setWhatsappCustomMessage] = useState(
    storeConfig.whatsappCustomMessage || "Hola! Estoy interesado en el producto: {productName} (SKU: {productSku})"
  );
  const [locationUrl, setLocationUrl] = useState(storeConfig.locationUrl || "");
  const [showPrices, setShowPrices] = useState(storeConfig.showPrices);
  const [hideOutOfStock, setHideOutOfStock] = useState(storeConfig.hideOutOfStock ?? false);
  const [showLocation, setShowLocation] = useState(storeConfig.showLocation ?? true);
  const [bannerStyle, setBannerStyle] = useState<"classic" | "compact">(storeConfig.bannerStyle || "classic");
  const [promoBannerText, setPromoBannerText] = useState(storeConfig.promoBannerText || "");
  const [storeImagesList, setStoreImagesList] = useState<string[]>([""]);
  const [errorNotificationEmail, setErrorNotificationEmail] = useState(storeConfig.errorNotificationEmail || "robymetalero@gmail.com");

  // Categories management states
  const [categoriesList, setCategoriesList] = useState<string[]>(() => {
    return (storeConfig as any).customCategories && (storeConfig as any).customCategories.length > 0
      ? [...(storeConfig as any).customCategories]
      : ["Calzado", "Ropa", "Accesorios", "Hogar", "Tecnología", "Salud y Belleza", "Deportes", "Otros"];
  });
  const [newCategoryName, setNewCategoryName] = useState("");

  // Product edits states
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null); // null = new product
  
  // Product Form states
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Otros");
  const [newCustomCategory, setNewCustomCategory] = useState("");
  const [retailPrice, setRetailPrice] = useState(0);
  const[wholesalePrice, setWholesalePrice] = useState(0);
  const [isAvailable, setIsAvailable] = useState(true);
  const [formHidePrice, setFormHidePrice] = useState(false);
  const [formIsHidden, setFormIsHidden] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [imagesList, setImagesList] = useState<string[]>([""]);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadProgressMsg, setUploadProgressMsg] = useState("");
  const [uploadPercent, setUploadPercent] = useState<number>(0);

  // Sync state with incoming props
  useEffect(() => {
    if (storeConfig) {
      setStoreName(storeConfig.storeName || "");
      setAddress(storeConfig.address || "");
      setPhone(storeConfig.phone || "");
      setWhatsappNumber(storeConfig.whatsappNumber || "");
      setWhatsappCustomMessage(storeConfig.whatsappCustomMessage || "");
      setLocationUrl(storeConfig.locationUrl || "");
      setShowPrices(storeConfig.showPrices);
      setHideOutOfStock(storeConfig.hideOutOfStock ?? false);
      setShowLocation(storeConfig.showLocation ?? true);
      setBannerStyle(storeConfig.bannerStyle || "classic");
      setPromoBannerText(storeConfig.promoBannerText || "");
      setStoreImagesList(storeConfig.storeImages && storeConfig.storeImages.length > 0 ? [...storeConfig.storeImages] : [""]);
      setErrorNotificationEmail(storeConfig.errorNotificationEmail || "robymetalero@gmail.com");
      if ((storeConfig as any).customCategories && (storeConfig as any).customCategories.length > 0) {
        setCategoriesList([...(storeConfig as any).customCategories]);
      }
    }
  }, [storeConfig]);

  // Show status toasts
  const showToast = (text: string, type: "success" | "error" | "warning" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const [syncingCloud, setSyncingCloud] = useState(false);

  const handleSyncLocalWithCloud = async () => {
    if (products.length === 0) {
      showToast("No hay productos en el catálogo para sincronizar", "error");
      return;
    }
    setSyncingCloud(true);
    let syncedCount = 0;
    try {
      showToast("Sincronizando catálogo con Google Cloud Firestore...");
      
      // 1. Sync with Server API (using Firebase Admin SDK securely)
      const res = await fetch("/api/products/seed", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": currentUser?.uid || ""
        },
        body: JSON.stringify(products)
      });

      if (res.ok) {
        const syncedProdData = await res.json();
        syncedCount = Array.isArray(syncedProdData) ? syncedProdData.length : products.length;
      } else {
        const errJson = await res.json();
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      // 2. Sync store configuration to Firestore as well
      let configSaved = false;
      try {
        const configRes = await fetch("/api/store-config", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": currentUser?.uid || ""
          },
          body: JSON.stringify(storeConfig)
        });
        if (configRes.ok) {
          configSaved = true;
        }
      } catch (err) {
        console.warn("Fallo sincronizando config en la nube Firestore:", err);
      }

      if (syncedCount > 0) {
        let msg = `¡Sincronización finalizada! Se guardaron ${syncedCount} artículos de forma segura en Google Cloud Firestore.`;
        if (configSaved) {
          msg += " Se actualizó la configuración de la tienda.";
        }
        showToast(msg);
      } else {
        showToast("No se pudieron guardar los artículos en Google Cloud Firestore.", "error");
      }
      onRefreshProducts();
    } catch (error: any) {
      console.error("Error al sincronizar con Firestore:", error);
      showToast(`Error al sincronizar con Firestore: ${error.message || error}`, "error");
    } finally {
      setSyncingCloud(false);
    }
  };

  // Utility to format sizes beautifully for saving storage feedback to the user
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Helper to generate a highly-optimized base64 representation to act as persistent fallback directly inside Firestore documents
  const createSmallBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      // If not an image, resolve empty
      if (!file.type.startsWith("image/")) {
        resolve("");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const MAX_SIZE = 280; // Compact but perfectly legible on cards/modals
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) {
              height = Math.round((height * MAX_SIZE) / width);
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width = Math.round((width * MAX_SIZE) / height);
              height = MAX_SIZE;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve("");
            return;
          }
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.5); // high compression, low footprint (~5-9KB)
          resolve(dataUrl);
        };
        img.onerror = () => resolve("");
        img.src = event.target?.result as string;
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  };

  // Highly professional client-side image compression to support massive mega-pixel files
  const compressImage = (file: File): Promise<File> => {
    return new Promise<File>((resolve) => {
      // If it is not an image, resolve immediately without modification
      if (!file.type.startsWith("image/")) {
        resolve(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Max dimension for web catalog optimization (balanced size and crispness)
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          // Calculate aspect ratio scale
          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(file);
            return;
          }

          // Use high quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          // Intelligently configure quality factor based on original image weight
          // Massive DSLR / high-res smartphone pictures get compressed more to save host quotas
          let compressionQuality = 0.83;
          if (file.size > 8 * 1024 * 1024) {
            compressionQuality = 0.74; // High compression for mega files
          } else if (file.size > 3 * 1024 * 1024) {
            compressionQuality = 0.79; // Balanced compression for big photos
          } else if (file.size > 1 * 1024 * 1024) {
            compressionQuality = 0.83; // Normal compression
          } else {
            compressionQuality = 0.86; // Light compression to keep visual crispness of smaller shots
          }

          const hasAlphaChannel = 
            file.type === "image/png" || 
            file.type.includes("webp") || 
            file.name.toLowerCase().endsWith(".png") || 
            file.name.toLowerCase().endsWith(".gif");

          // WebP modern fallback routine
          const tryWebPAndFallback = () => {
            canvas.toBlob(
              (webpBlob) => {
                // If WebP export successfully compressed the image smaller than original file
                if (webpBlob && webpBlob.size < file.size) {
                  const cleanedName = file.name.replace(/\.[^/.]+$/, "");
                  const compressedFile = new File([webpBlob], cleanedName + ".webp", {
                    type: "image/webp",
                    lastModified: Date.now(),
                  });
                  console.log(`[Optimización WebP] ${file.name}: ${formatBytes(file.size)} -> ${formatBytes(webpBlob.size)} (Ahorro del ${Math.round(100 - (webpBlob.size/file.size)*100)}%)`);
                  resolve(compressedFile);
                } else {
                  // Fall back if webp failed or is larger (fallback to JPEG)
                  exportJPEG();
                }
              },
              "image/webp",
              compressionQuality
            );
          };

          const exportJPEG = () => {
            // Fill background with neutral classic white for JPEG exports to prevent transparent elements turning solid black
            if (hasAlphaChannel) {
              ctx.fillStyle = "#FFFFFF";
              ctx.fillRect(0, 0, width, height);
            }
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
              (jpegBlob) => {
                if (jpegBlob) {
                  // If JPEG actually didn't reduce content weight, retain original file to protect crisp detail
                  if (jpegBlob.size >= file.size) {
                    console.log(`[Optimización] Imagen ya ultra optimizada (${formatBytes(file.size)}), respetando archivo original.`);
                    resolve(file);
                    return;
                  }

                  const cleanedName = file.name.replace(/\.[^/.]+$/, "");
                  const compressedFile = new File([jpegBlob], cleanedName + ".jpg", {
                    type: "image/jpeg",
                    lastModified: Date.now(),
                  });
                  console.log(`[Optimización JPEG] ${file.name}: ${formatBytes(file.size)} -> ${formatBytes(jpegBlob.size)} (Ahorro del ${Math.round(100 - (jpegBlob.size/file.size)*100)}%)`);
                  resolve(compressedFile);
                } else {
                  resolve(file);
                }
              },
              "image/jpeg",
              compressionQuality
            );
          };

          // Render the initial image onto canvas
          ctx.drawImage(img, 0, 0, width, height);

          // Try using WebP first which is exceptionally efficient for web catalogues, handles alpha transparency beautifully, and is supported natively.
          try {
            tryWebPAndFallback();
          } catch (err) {
            exportJPEG();
          }
        };
        img.onerror = () => {
          resolve(file);
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        resolve(file);
      };
      reader.readAsDataURL(file);
    });
  };

  // Core Helper: Direct Multi-file Upload to client-side Firebase Storage (primary) with backend fallback
  const uploadMultipleWithProgress = async (
    files: File[], 
    onProgress: (percent: number) => void
  ): Promise<string[]> => {
    // 1. We prioritize client-side Firebase Storage upload to obtain 100% durable, permanent, public, global URLs
    try {
      console.log(`[Firebase Client Storage] Iniciando subida de ${files.length} archivo(s)...`);
      const { ref, uploadBytesResumable, getDownloadURL } = await import("firebase/storage");
      const { storage } = await import("../firebase");

      const fileProgresses = new Array(files.length).fill(0);

      const uploadPromises = files.map((file, idx) => {
        return new Promise<string>((resolveFile, rejectFile) => {
          // Normalize and clean file name to prevent accents or special characters from failing in Firebase path URIs
          const cleanName = file.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-zA-Z0-9.]/g, "_"); // replace special characters with underscores

          const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
          const extIndex = cleanName.lastIndexOf(".");
          const ext = extIndex !== -1 ? cleanName.substring(extIndex) : "";
          const baseName = extIndex !== -1 ? cleanName.substring(0, extIndex) : cleanName;
          
          const storagePath = `products/${baseName}-${uniqueSuffix}${ext || ".jpg"}`;
          const fileRef = ref(storage, storagePath);

          const metadata = {
            contentType: file.type || "image/jpeg"
          };

          const uploadTask = uploadBytesResumable(fileRef, file, metadata);

          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = snapshot.totalBytes > 0 
                ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100 
                : 0;
              fileProgresses[idx] = progress;
              
              // Calculate overall aggregate percentage progress
              const totalProgress = fileProgresses.reduce((acc, curr) => acc + curr, 0) / files.length;
              onProgress(Math.round(totalProgress));
            },
            (error) => {
              console.warn(`[Firebase Client Storage] Error en archivo "${file.name}":`, error);
              rejectFile(error);
            },
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                console.log(`[Firebase Client Storage] Subido con éxito: ${file.name} ➔ ${downloadURL}`);
                resolveFile(downloadURL);
              } catch (urlErr) {
                rejectFile(urlErr);
              }
            }
          );
        });
      });

      return await Promise.all(uploadPromises);
    } catch (fbStorageErr: any) {
      console.warn("[Firebase Client Storage] Falló carga a Storage. Intentando backend como fallback:", fbStorageErr);
      
      // 2. Fallback: Upload to Express Backend
      try {
        console.log(`[Backend Upload] Iniciando subida de ${files.length} archivo(s) al servidor...`);
        return await new Promise<string[]>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/upload");
          
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              onProgress(percent);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                if (data.urls && data.urls.length > 0) {
                  console.log("[Backend Upload] Completado con éxito:", data.urls);
                  resolve(data.urls);
                } else {
                  reject(new Error("No se devolvió la lista de URLs de archivo desde el servidor."));
                }
              } catch (e) {
                reject(new Error("Respuesta inválida del servidor."));
              }
            } else {
              try {
                const data = JSON.parse(xhr.responseText);
                reject(new Error(data.error || `Error del servidor: Código ${xhr.status}`));
              } catch (e) {
                reject(new Error(`Error del servidor: Código de estado HTTP ${xhr.status}`));
              }
            }
          };

          xhr.onerror = () => reject(new Error("Error de red cargando el archivo al servidor."));
          xhr.ontimeout = () => reject(new Error("Tiempo de espera agotado en la red."));

          const formData = new FormData();
          files.forEach((file) => {
            formData.append("files", file);
          });
          xhr.send(formData);
        });
      } catch (backendErr: any) {
        throw new Error("No fue posible subir los archivos. Al parecer la conexión falló: " + (backendErr?.message || backendErr));
      }
    }
  };

  // Media upload handler with actual progress, size checks, and clear errors
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingMedia(true);
    setUploadError("");
    setUploadProgressMsg("Iniciando carga de medios...");

    try {
      const filesArray = Array.from(files) as File[];

      // 1. Explicit Client-side Validation (File type and max sizes)
      for (const file of filesArray) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");

        if (!isImage && !isVideo) {
          throw new Error(`El archivo "${file.name}" no es un formato de imagen o video compatible.`);
        }

        if (isImage && file.size > 15 * 1024 * 1024) {
          throw new Error(`La imagen "${file.name}" supera el tamaño máximo permitido de 15MB.`);
        }

        if (isVideo && file.size > 60 * 1024 * 1024) {
          throw new Error(`El video "${file.name}" supera el tamaño máximo permitido de 60MB.`);
        }
      }

      setUploadProgressMsg("Procesando y optimizando imágenes para la web...");
      
      const originalTotalSize = filesArray.reduce((acc, f) => acc + f.size, 0);

      // Parallel image compression (optimized for fluid experience)
      const processedFiles: File[] = await Promise.all(
        filesArray.map(async (file) => {
          try {
            if (file.type.startsWith("image/")) {
              return await compressImage(file);
            }
            return file;
          } catch (compressErr) {
            console.warn(`[Optimización] Falló compresión de ${file.name}, usando original:`, compressErr);
            return file;
          }
        })
      );

      const compressedTotalSize = processedFiles.reduce((acc, f) => acc + f.size, 0);
      const savingsPercent = originalTotalSize > 0 
        ? Math.round(100 - (compressedTotalSize / originalTotalSize) * 100) 
        : 0;

      setUploadProgressMsg(`Subiendo ${processedFiles.length} archivo(s)...`);
      setUploadPercent(0);

      const uploadedUrls = await uploadMultipleWithProgress(processedFiles, (percent) => {
        setUploadPercent(percent);
        setUploadProgressMsg(`Subiendo archivos... (${percent}%)`);
      });

      // 3. Update state fields in form
      const newImages: string[] = [];
      let lastVideo = "";

      uploadedUrls.forEach((url) => {
        const lowerUrl = url.toLowerCase();
        if (
          lowerUrl.includes(".mp4") ||
          lowerUrl.includes(".webm") ||
          lowerUrl.includes(".mov") ||
          lowerUrl.includes(".avi") ||
          lowerUrl.includes("video")
        ) {
          lastVideo = url;
        } else {
          newImages.push(url);
        }
      });

      setImagesList((prev) => {
        const cleaned = prev.filter((img) => img.trim() !== "");
        const combined = [...cleaned, ...newImages];
        return combined.length === 0 ? [""] : combined;
      });

      if (lastVideo) {
        setVideoUrl(lastVideo);
      }

      // Display smart completion feedbacks
      const totalUploaded = uploadedUrls.length;
      if (savingsPercent > 5) {
        showToast(`¡Carga completada! Ahorraste ${savingsPercent}% de espacio (${formatBytes(originalTotalSize)} ➔ ${formatBytes(compressedTotalSize)})`);
      } else {
        showToast(`¡Carga completada! Subidos ${totalUploaded} archivo(s) optimizado(s) de forma segura.`);
      }
    } catch (err: any) {
      console.error("Carga de archivos fallida: ", err);
      setUploadError(err.message || String(err));
      showToast("Error al subir los medios: " + (err.message || "Error desconocido"), "error");
    } finally {
      setUploadingMedia(false);
      setUploadPercent(0);
      setUploadProgressMsg("");
      e.target.value = "";
    }
  };

  // Modern Multi-file Interactive Queue Handlers (adds previews, progress and retry capabilities)
  const handleSelectMediaFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files) as File[];
    const newItems: UploadQueueItem[] = [];

    for (const file of filesArray) {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");

      if (isImage) {
        // Validación rigurosa de imagen según requerimientos
        const validationError = await validateImageFile(file);
        if (validationError) {
          showToast(`Error en "${file.name}": ${validationError}`, "error");
          continue; // Bloquear inclusión en la cola
        }
      } else if (isVideo) {
        if (file.size > 60 * 1024 * 1024) {
          showToast(`El video "${file.name}" supera el tamaño de 60MB.`, "error");
          continue;
        }
      } else {
        showToast(`El archivo "${file.name}" no es una imagen o video compatible.`, "error");
        continue;
      }

      const id = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const previewUrl = URL.createObjectURL(file);

      newItems.push({
        id,
        file,
        name: file.name,
        previewUrl,
        progress: 0,
        status: "pending",
        url: null,
        errorMsg: null
      });
    }

    if (newItems.length > 0) {
      setUploadQueue((prev) => [...prev, ...newItems]);
    }

    // Reset input target value so selection of same file is always allowed
    e.target.value = "";
  };

  const uploadSingleItem = async (itemId: string) => {
    // Locate target queue element
    const item = uploadQueue.find((q) => q.id === itemId);
    if (!item || !item.file) return;

    // Transition status to compressing
    setUploadQueue((prev) =>
      prev.map((q) => (q.id === itemId ? { ...q, status: "compressing", progress: 0 } : q))
    );

    try {
      let processedFile = item.file;
      if (item.file.type.startsWith("image/")) {
        try {
          processedFile = await compressImage(item.file);
        } catch (compressErr) {
          console.warn(`[Queue Optimización] Falló la compresión para ${item.name}, usando original:`, compressErr);
        }
      }

      // Transition status to uploading
      setUploadQueue((prev) =>
        prev.map((q) => (q.id === itemId ? { ...q, status: "uploading" } : q))
      );

      let uploadedUrl = "";

      // Try client-side Firebase Storage
      try {
        console.log(`[Queue Upload] Subiendo a Firebase Storage: ${processedFile.name}...`);
        const { ref, uploadBytesResumable, getDownloadURL } = await import("firebase/storage");
        const { storage } = await import("../firebase");

        // Clean names
        const cleanName = processedFile.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9.]/g, "_");

        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const extIndex = cleanName.lastIndexOf(".");
        const ext = extIndex !== -1 ? cleanName.substring(extIndex) : "";
        const baseName = extIndex !== -1 ? cleanName.substring(0, extIndex) : cleanName;

        const storagePath = `products/${baseName}-${uniqueSuffix}${ext || ".jpg"}`;
        const fileRef = ref(storage, storagePath);

        const metadata = {
          contentType: processedFile.type || "image/jpeg"
        };

        const uploadTask = uploadBytesResumable(fileRef, processedFile, metadata);

        uploadedUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = snapshot.totalBytes > 0 
                ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100 
                : 0;
              setUploadQueue((prev) =>
                prev.map((q) => (q.id === itemId ? { ...q, progress: Math.min(Math.round(progress), 99) } : q))
              );
            },
            (error) => {
              reject(error);
            },
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadURL);
              } catch (urlErr) {
                reject(urlErr);
              }
            }
          );
        });
      } catch (fbErr: any) {
        console.warn("[Queue Upload] Falló Firebase Storage. Intentando backend fallback de cortesía:", fbErr);
        
        // Secondary Fallback: Backend Express /api/upload
        uploadedUrl = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/upload");

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              setUploadQueue((prev) =>
                prev.map((q) => (q.id === itemId ? { ...q, progress: Math.min(percent, 99) } : q))
              );
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                if (data.urls && data.urls.length > 0) {
                  resolve(data.urls[0]);
                } else {
                  reject(new Error("No se recibió la URL de subida del servidor backend."));
                }
              } catch (e) {
                reject(new Error("Respuesta de subida corrupta del servidor backend."));
              }
            } else {
              reject(new Error(`Fallo del servidor (Código ${xhr.status})`));
            }
          };

          xhr.onerror = () => reject(new Error("Error de conexión con el host de subida."));
          xhr.ontimeout = () => reject(new Error("Límite de tiempo excedido en la red."));

          const formData = new FormData();
          formData.append("files", processedFile);
          xhr.send(formData);
        });
      }

      // Generate compact base64 backup for resilient client-side zero-loss recovery
      let backupBase64: string | undefined = undefined;
      if (processedFile && processedFile.type.startsWith("image/")) {
        try {
          backupBase64 = await createSmallBase64(processedFile);
        } catch (base64Err) {
          console.warn("[Backup Creator] Error generating resilient base64 fallback:", base64Err);
        }
      }

      // Successful completion of item
      setUploadQueue((prev) =>
        prev.map((q) =>
          q.id === itemId
            ? { ...q, status: "success", progress: 100, url: uploadedUrl, backupBase64 }
            : q
        )
      );

      // Check if it's a video to assign to video fields in parallel
      const lowerUrl = uploadedUrl.toLowerCase();
      if (
        lowerUrl.includes(".mp4") ||
        lowerUrl.includes(".webm") ||
        lowerUrl.includes(".mov") ||
        lowerUrl.includes(".avi") ||
        lowerUrl.includes("video")
      ) {
        setVideoUrl(uploadedUrl);
      }

      showToast(`Medio "${item.name}" cargado de forma duradera.`);
    } catch (error: any) {
      console.error(`[Queue Upload] Error subiendo ${item.name}:`, error);
      setUploadQueue((prev) =>
        prev.map((q) =>
          q.id === itemId
            ? { ...q, status: "error", errorMsg: error.message || "Error al subir" }
            : q
        )
      );
      showToast(`Error al subir ${item.name}: ${error.message || error}`, "error");
    }
  };

  // Reactive Queue processor loop (triggers sequentially for perfect thread flow)
  useEffect(() => {
    const pendingItem = uploadQueue.find((q) => q.status === "pending");
    if (pendingItem) {
      uploadSingleItem(pendingItem.id);
    }
  }, [uploadQueue]);

  // Sync uploadQueue successful urls into imagesList (ensures backwards compatibility and catalog updates)
  useEffect(() => {
    const successfulUrls = uploadQueue
      .filter((q) => q.status === "success" && q.url)
      .map((q) => q.url as string);
    setImagesList(successfulUrls.length > 0 ? successfulUrls : [""]);
  }, [uploadQueue]);

  // Remove element from queue and revoke object url
  const handleRemoveQueueItem = (itemId: string) => {
    setUploadQueue((prev) => {
      const itemToRemove = prev.find((q) => q.id === itemId);
      if (itemToRemove && itemToRemove.previewUrl && !itemToRemove.previewUrl.startsWith("http")) {
        try {
          URL.revokeObjectURL(itemToRemove.previewUrl);
        } catch (e) {
          console.warn("Could not revoke ObjectURL:", e);
        }
      }
      return prev.filter((q) => q.id !== itemId);
    });
  };

  // Retry upload of specific failed queue items
  const handleRetryQueueItem = (itemId: string) => {
    setUploadQueue((prev) =>
      prev.map((q) =>
        q.id === itemId
          ? { ...q, status: "pending", progress: 0, errorMsg: null }
          : q
      )
    );
  };

  const handleStoreMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;

    setUploadingMedia(true);
    setUploadError("");
    setLoading(true);

    try {
      const filesArray = Array.from(rawFiles) as File[];
      for (const file of filesArray) {
        const isImage = file.type.startsWith("image/");
        if (!isImage) {
          throw new Error(`El archivo "${file.name}" no es una imagen compatible.`);
        }
        if (file.size > 15 * 1024 * 1024) {
          throw new Error(`La imagen "${file.name}" supera el tamaño máximo de 15MB.`);
        }
      }

      setUploadProgressMsg("Procesando fotos de la tienda...");
      const originalTotalSize = filesArray.reduce((acc, f) => acc + f.size, 0);

      const processedFiles: File[] = await Promise.all(
        filesArray.map(async (file) => {
          try {
            return await compressImage(file);
          } catch (err) {
            return file;
          }
        })
      );

      const compressedTotalSize = processedFiles.reduce((acc, f) => acc + f.size, 0);
      const savingsPercent = originalTotalSize > 0 
        ? Math.round(100 - (compressedTotalSize / originalTotalSize) * 100) 
        : 0;

      setUploadProgressMsg(`Subiendo ${processedFiles.length} foto(s)...`);
      setUploadPercent(0);

      const uploadedUrls = await uploadMultipleWithProgress(processedFiles, (percent) => {
        setUploadPercent(percent);
        setUploadProgressMsg(`Subiendo fotos de sucursal... (${percent}%)`);
      });

      setStoreImagesList((prev) => {
        const cleaned = prev.filter((img) => img.trim() !== "");
        const combined = [...cleaned, ...uploadedUrls];
        return combined.length === 0 ? [""] : combined;
      });

      if (savingsPercent > 5) {
        showToast(`¡Fotos cargadas! Optimización redujo almacenamiento en ${savingsPercent}% (${formatBytes(originalTotalSize)} ➔ ${formatBytes(compressedTotalSize)})`);
      } else {
        showToast(`¡Se cargaron exitosamente ${uploadedUrls.length} fotos de la tienda!`);
      }
    } catch (err: any) {
      console.error(err);
      showToast(`Error al subir fotos de la tienda: ${err.message}`, "error");
    } finally {
      setUploadingMedia(false);
      setLoading(false);
      setUploadPercent(0);
      setUploadProgressMsg("");
      e.target.value = "";
    }
  };

  const handleAddStoreImageField = () => {
    setStoreImagesList([...storeImagesList, ""]);
  };

  const handleStoreImageFieldChange = (index: number, val: string) => {
    const updated = [...storeImagesList];
    updated[index] = val;
    setStoreImagesList(updated);
  };

  const handleRemoveStoreImageField = (index: number) => {
    if (storeImagesList.length === 1) {
      setStoreImagesList([""]);
    } else {
      setStoreImagesList(storeImagesList.filter((_, idx) => idx !== index));
    }
  };

  // Action: Save general config to Google Cloud SQL (PostgreSQL)
  const handleSaveStoreConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const updatedData: StoreConfig = {
      storeName: storeName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      whatsappNumber: whatsappNumber.trim().replace(/[^0-9]/g, ""), // clean number
      whatsappCustomMessage: whatsappCustomMessage.trim(),
      locationUrl: locationUrl.trim(),
      showPrices: !!showPrices,
      hideOutOfStock: !!hideOutOfStock,
      showLocation: !!showLocation,
      bannerStyle: bannerStyle,
      promoBannerText: promoBannerText.trim(),
      storeImages: storeImagesList.filter(url => url.trim() !== ""),
      errorNotificationEmail: errorNotificationEmail.trim(),
      updatedAt: new Date()
    };

    // UPDATE LOCAL STATE / CACHE INSTANTLY (IMMEDIATE REACTION)
    setStoreConfig(updatedData);
    try {
      localStorage.setItem("local_store_config_cache", JSON.stringify(updatedData));
    } catch (err) {}

    // Save directly to Google Cloud Firestore first (Client SDK with user login representation)
    try {
      const fsPayload = {
        ...updatedData,
        updatedAt: updatedData.updatedAt ? updatedData.updatedAt.toISOString() : new Date().toISOString()
      };
      await setDoc(doc(db, "storeConfig", "default"), fsPayload);
      console.log("[Firebase Client] Configuración de tienda guardada directamente en Firestore!");
    } catch (fsErr: any) {
      console.warn("[Firebase Client] Error escribiendo storeConfig directamente a Firestore:", fsErr.message);
      if (typeof addErrorLog === "function") {
        addErrorLog("Guardo Configuración Tienda (Cliente SDK)", fsErr);
      }
    }

    try {
      // Save directly to Google Cloud Firestore through secure Server API (as fallback and sync)
      const res = await fetch("/api/store-config", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": currentUser?.uid || ""
        },
        body: JSON.stringify(updatedData)
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      console.log("Configuración de tienda guardada exitosamente en Firestore!");
      showToast("Configuración general guardada exitosamente en Firestore");
      onRefreshConfig(); // Synchronize the real config from DB
    } catch (error: any) {
      console.error("Could not write config to Firestore:", error);
      showToast(`Error al guardar configuración en Firestore: ${error.message || error}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Open Form to create Product
  const handleOpenCreateProduct = () => {
    setEditingProductId(null);
    setSku(`PROD-${Math.floor(1000 + Math.random() * 9000)}`);
    setName("");
    setDescription("");
    setCategory("Otros");
    setNewCustomCategory("");
    setRetailPrice(0);
    setWholesalePrice(0);
    setIsAvailable(true);
    setFormHidePrice(false);
    setFormIsHidden(false);
    setVideoUrl("");
    setImagesList([""]); // initialize with one empty field
    setUploadQueue([]); // Clear upload queue
    setIsEditingProduct(true);
  };

  // Open Form to edit specific Product
  const handleOpenEditProduct = (product: Product) => {
    setEditingProductId(product.id);
    setSku(product.sku);
    setName(product.name);
    setDescription(product.description || "");
    if (categoriesList.includes(product.category)) {
      setCategory(product.category);
      setNewCustomCategory("");
    } else {
      setCategory("Custom");
      setNewCustomCategory(product.category);
    }
    setRetailPrice(product.retailPrice || 0);
    setWholesalePrice(product.wholesalePrice || 0);
    setIsAvailable(product.isAvailable !== false);
    setFormHidePrice(product.hidePrice ?? false);
    setFormIsHidden(product.isHidden ?? false);
    setVideoUrl(product.videoUrl || "");
    
    const existingImages = product.images && product.images.length > 0
      ? product.images.filter(x => x && x.trim() !== "")
      : [];
    setImagesList(existingImages.length > 0 ? [...existingImages] : [""]);
    
    // Unify existing product images into the uploadQueue as pre-uploaded success items
    const initialQueue: UploadQueueItem[] = existingImages.map((url, i) => ({
      id: `existing_${i}_${Date.now()}`,
      file: null,
      name: url.substring(url.lastIndexOf("/") + 1).split("?")[0] || `Imagen ${i + 1}`,
      previewUrl: url,
      progress: 100,
      status: "success",
      url: url,
      errorMsg: null,
      backupBase64: product.backupImages && product.backupImages[i] ? product.backupImages[i] : undefined
    }));
    setUploadQueue(initialQueue);
    
    setIsEditingProduct(true);
  };

  // Handle Dynamic List for multiple images
  const handleAddImageField = () => {
    setImagesList([...imagesList, ""]);
    setUploadQueue((prev) => [
      ...prev,
      {
        id: `manual_new_${Date.now()}`,
        file: null,
        name: "Enlace Manual",
        previewUrl: "",
        progress: 100,
        status: "pending", // mark as pending until text is filled so it matches visual queue
        url: null,
        errorMsg: null
      }
    ]);
  };

  const handleImageFieldChange = (index: number, val: string) => {
    const updated = [...imagesList];
    updated[index] = val;
    setImagesList(updated);

    setUploadQueue((prev) => {
      const nextQueue = [...prev];
      if (index < nextQueue.length) {
        nextQueue[index] = {
          ...nextQueue[index],
          url: val || null,
          previewUrl: val,
          status: val ? "success" : "pending"
        };
      } else {
        nextQueue.push({
          id: `manual_${index}_${Date.now()}`,
          file: null,
          name: val ? (val.substring(val.lastIndexOf("/") + 1).split("?")[0] || `Manual ${index + 1}`) : `Manual ${index + 1}`,
          previewUrl: val,
          progress: 100,
          status: val ? "success" : "pending",
          url: val || null,
          errorMsg: null
        });
      }
      return nextQueue;
    });
  };

  const handleRemoveImageField = (index: number) => {
    const nextImages = imagesList.filter((_, idx) => idx !== index);
    setImagesList(nextImages.length === 0 ? [""] : nextImages);
    setUploadQueue((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Action: Submit Product Form (Create / Edit)
  const handleSubmitProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) {
      showToast("Nombre y SKU son campos obligatorios", "error");
      return;
    }

    setLoading(true);
    const id = editingProductId || `prod_${Date.now()}`;

    // Filter valid URLs (discard empty ones and support both absolute links and local /uploads/ uploads)
    const filteredImages = imagesList
      .map((url) => url.trim())
      .filter((url) => 
        url.startsWith("http://") || 
        url.startsWith("https://") || 
        url.startsWith("/uploads/")
      );

    const finalCategory = category === "Custom" ? newCustomCategory.trim() : category;
    const currentTime = new Date();

    // Compile backupImages array in exact matching alignment with filteredImages list
    const finalBackupImages: string[] = [];
    filteredImages.forEach((imgUrl) => {
      const qItem = uploadQueue.find((q) => q.url === imgUrl);
      if (qItem && qItem.backupBase64) {
        finalBackupImages.push(qItem.backupBase64);
      } else {
        if (editingProductId) {
          const matchedProd = products.find((p) => p.id === editingProductId);
          if (matchedProd && matchedProd.images && matchedProd.backupImages) {
            const idx = matchedProd.images.indexOf(imgUrl);
            if (idx !== -1 && matchedProd.backupImages[idx]) {
              finalBackupImages.push(matchedProd.backupImages[idx]);
              return;
            }
          }
        }
        finalBackupImages.push("");
      }
    });

    let updatedProductsList: Product[] = [];
    let savedMsg = "";

    const reqObj: any = {
      id,
      sku: sku.trim(),
      name: name.trim(),
      description: description.trim(),
      category: finalCategory || "Otros",
      retailPrice: Number(retailPrice) || 0,
      wholesalePrice: Number(wholesalePrice) || 0,
      images: filteredImages,
      backupImages: finalBackupImages,
      videoUrl: videoUrl.trim(),
      isAvailable: !!isAvailable,
      hidePrice: !!formHidePrice,
      isHidden: !!formIsHidden,
      updatedAt: currentTime
    };

    if (editingProductId) {
      // Edit flow
      reqObj.id = editingProductId;
      updatedProductsList = products.map((p) => 
        p.id === editingProductId ? { ...p, ...reqObj } : p
      );
      savedMsg = "Producto actualizado con éxito";
    } else {
      // Create flow
      reqObj.createdAt = currentTime;
      reqObj.views = 0;
      reqObj.whatsappClicks = 0;
      updatedProductsList = [reqObj, ...products];
      savedMsg = "Producto agregado al catálogo";
    }

    setIsEditingProduct(false);

    await executeProductsOptimistically(
      () => updatedProductsList,
      async () => {
        // Save directly to Google Cloud Firestore first (Client SDK)
        try {
          const fsPayload = {
            ...reqObj,
            createdAt: reqObj.createdAt ? (reqObj.createdAt instanceof Date ? reqObj.createdAt.toISOString() : reqObj.createdAt) : undefined,
            updatedAt: reqObj.updatedAt ? (reqObj.updatedAt instanceof Date ? reqObj.updatedAt.toISOString() : reqObj.updatedAt) : undefined,
          };
          if (!editingProductId) {
            fsPayload.id = id;
          }
          await setDoc(doc(db, "products", editingProductId || id), fsPayload, { merge: true });
          console.log("[Firebase Client] Producto guardado directamente en Firestore!");
        } catch (fsErr: any) {
          console.warn("[Firebase Client Warning] No se pudo guardar producto directamente en Firestore (usando fallback de servidor):", fsErr.message || fsErr);
          if (typeof addErrorLog === "function") {
            addErrorLog("Guardar Producto (Cliente SDK)", fsErr);
          }
        }

        // Save product directly to Google Cloud Firestore through Server API (as fallback/sync)
        let res;
        if (editingProductId) {
          res = await fetch(`/api/products/${editingProductId}`, {
            method: "PUT",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": currentUser?.uid || ""
            },
            body: JSON.stringify(reqObj)
          });
        } else {
          const createObj = {
            id,
            ...reqObj
          };
          res = await fetch("/api/products", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": currentUser?.uid || ""
            },
            body: JSON.stringify(createObj)
          });
        }

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        console.log("Producto guardado exitosamente en Firestore!");
        showToast(savedMsg);
      },
      "Error al guardar producto en Firestore"
    );

    setLoading(false);
  };

  // Toggle individual product price visibility
  const handleToggleProductPrice = async (product: Product) => {
    const updatedVal = !product.hidePrice;
    
    await executeProductsOptimistically(
      (curr) => curr.map(p => p.id === product.id ? { ...p, hidePrice: updatedVal } : p),
      async () => {
        try {
          const productRef = doc(db, "products", product.id);
          await updateDoc(productRef, {
            hidePrice: updatedVal,
            updatedAt: new Date().toISOString()
          });
        } catch (fsErr: any) {
          console.warn("[Firebase Client Warning] No se pudo cambiar visibilidad de precios directamente en Firestore (usando fallback de servidor):", fsErr.message);
          if (typeof addErrorLog === "function") {
            addErrorLog("Toggle Visibilidad Precios (Cliente SDK)", fsErr);
          }
        }
        showToast(`Precios para "${product.name}" ahora están ${updatedVal ? "ocultos" : "visibles"}`);
        
        // Fallback update on server too
        await fetch(`/api/products/${product.id}`, {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": currentUser?.uid || ""
          },
          body: JSON.stringify({ hidePrice: updatedVal })
        });
      },
      `Error al cambiar visibilidad de precios para "${product.name}"`
    );
  };

  // Toggle individual product structural visibility in the catalog
  const handleToggleProductVisibility = async (product: Product) => {
    const updatedVal = !product.isHidden;
    
    await executeProductsOptimistically(
      (curr) => curr.map(p => p.id === product.id ? { ...p, isHidden: updatedVal } : p),
      async () => {
        try {
          const productRef = doc(db, "products", product.id);
          await updateDoc(productRef, {
            isHidden: updatedVal,
            updatedAt: new Date().toISOString()
          });
        } catch (fsErr: any) {
          console.warn("[Firebase Client Warning] No se pudo cambiar visibilidad del producto directamente en Firestore (usando fallback de servidor):", fsErr.message);
          if (typeof addErrorLog === "function") {
            addErrorLog("Toggle Visibilidad Producto (Cliente SDK)", fsErr);
          }
        }
        showToast(`"${product.name}" ahora está ${updatedVal ? "oculto" : "visible"}`);
        
        // Fallback update on server too
        await fetch(`/api/products/${product.id}`, {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": currentUser?.uid || ""
          },
          body: JSON.stringify({ isHidden: updatedVal })
        });
      },
      `Error al cambiar visibilidad de "${product.name}"`
    );
  };

  // Update dynamic store categories
  const handleUpdateCategories = async (newCats: string[]) => {
    const originalCats = [...categoriesList];
    setCategoriesList(newCats);

    const updatedData: StoreConfig = {
      ...storeConfig,
      customCategories: newCats,
    } as any;

    await executeStoreConfigOptimistically(
      () => updatedData,
      async () => {
        const fsPayload = {
          ...updatedData,
          updatedAt: new Date().toISOString()
        };
        try {
          await setDoc(doc(db, "storeConfig", "default"), fsPayload);
          console.log("[Firebase Client] Categorías actualizadas en Firestore!");
        } catch (fsErr: any) {
          console.warn("[Firebase Client Warning] No se pudo guardar categorías directamente en Firestore (usando fallback de servidor):", fsErr.message);
          if (typeof addErrorLog === "function") {
            addErrorLog("Actualizar Categorías (Cliente SDK)", fsErr);
          }
        }

        // Post custom categories update to backend server to save securely with Admin SDK
        const res = await fetch("/api/store-config", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": currentUser?.uid || ""
          },
          body: JSON.stringify(updatedData)
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        console.log("[Server Fallback] Categorías actualizadas exitosamente vía servidor!");
      },
      "Error escribiendo categorías a Firestore"
    );
  };

  // Delete category and reassign items to "Otros"
  const handleRemoveCategory = async (catToRemove: string) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar la categoría "${catToRemove}"? Todos los productos en esta categoría se reasignarán automáticamente a la categoría "Otros".`)) {
      setLoading(true);
      const filteredCats = categoriesList.filter(c => c !== catToRemove);
      if (!filteredCats.includes("Otros")) {
        filteredCats.push("Otros");
      }

      const previousProducts = [...products];
      const previousStoreConfig = { ...storeConfig };
      const previousCategories = [...categoriesList];
      let previousProductsCache: string | null = null;
      let previousConfigCache: string | null = null;
      try {
        previousProductsCache = localStorage.getItem("local_products_cache");
        previousConfigCache = localStorage.getItem("local_store_config_cache");
      } catch (e) {}

      // Apply optimistic update immediately
      const updatedProducts = products.map(p => p.category === catToRemove ? { ...p, category: "Otros" } : p);
      setProducts(updatedProducts);
      setCategoriesList(filteredCats);

      const updatedConfig: StoreConfig = {
        ...storeConfig,
        customCategories: filteredCats,
      } as any;
      setStoreConfig(updatedConfig);

      try {
        localStorage.setItem("local_products_cache", JSON.stringify(updatedProducts));
        localStorage.setItem("local_store_config_cache", JSON.stringify(updatedConfig));
      } catch (e) {}

      try {
        const productsToUpdate = products.filter(p => p.category === catToRemove);
        await Promise.all(
          productsToUpdate.map(async (prodToUpdate) => {
            try {
              const productRef = doc(db, "products", prodToUpdate.id);
              await updateDoc(productRef, {
                category: "Otros",
                updatedAt: new Date().toISOString()
              });
            } catch (fsErr: any) {
              console.warn("[Firebase Client Warning] No se pudo reasignar producto directamente en Firestore (usando fallback de servidor):", fsErr);
              if (typeof addErrorLog === "function") {
                addErrorLog("Remover Categoría - Reasignación Producto (Cliente SDK)", fsErr);
              }
            }
            // Fallback update on server too
            await fetch(`/api/products/${prodToUpdate.id}`, {
              method: "PUT",
              headers: { 
                "Content-Type": "application/json",
                "Authorization": currentUser?.uid || ""
              },
              body: JSON.stringify({ category: "Otros" })
            });
          })
        );

        const fsPayload = {
          ...updatedConfig,
          updatedAt: new Date().toISOString()
        };
        try {
          await setDoc(doc(db, "storeConfig", "default"), fsPayload);
          console.log("[Firebase Client] Categorías actualizadas en Firestore!");
        } catch (fsErr: any) {
          console.warn("[Firebase Client Warning] No se pudo guardar configuración de categorías directamente en Firestore (usando fallback de servidor):", fsErr);
          if (typeof addErrorLog === "function") {
            addErrorLog("Remover Categoría - Guardar Config (Cliente SDK)", fsErr);
          }
        }

        // Post config to backend server
        const resConf = await fetch("/api/store-config", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": currentUser?.uid || ""
          },
          body: JSON.stringify(updatedConfig)
        });
        if (!resConf.ok) {
          throw new Error("Fallo al actualizar categoría en backend.");
        }

        showToast(`Categoría "${catToRemove}" eliminada con éxito de la base de datos.`);
        onRefreshProducts(true);
        onRefreshConfig(true);
      } catch (err: any) {
        console.error("[Optimistic Rollback] Error removing category:", err);
        showToast(`Error al remover categoría: ${err.message}`, "error");

        // Rollback
        setProducts(previousProducts);
        setStoreConfig(previousStoreConfig);
        setCategoriesList(previousCategories);
        try {
          if (previousProductsCache !== null) {
            localStorage.setItem("local_products_cache", previousProductsCache);
          } else {
            localStorage.removeItem("local_products_cache");
          }
          if (previousConfigCache !== null) {
            localStorage.setItem("local_store_config_cache", previousConfigCache);
          } else {
            localStorage.removeItem("local_store_config_cache");
          }
        } catch (e) {}
      } finally {
        setLoading(false);
      }
    }
  };

  // Create/Add a new category
  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      showToast("La categoría no puede estar vacía", "error");
      return;
    }
    
    if (categoriesList.map(c => c.toLowerCase()).includes(trimmed.toLowerCase())) {
      showToast("Esta categoría ya existe en la lista", "error");
      return;
    }
    
    const updatedCats = [...categoriesList, trimmed];
    await handleUpdateCategories(updatedCats);
    setNewCategoryName("");
    showToast(`Categoría "${trimmed}" creada con éxito.`);
  };

  // Action: Delete product
  const handleDeleteProduct = async (id: string) => {
    if (!confirm("¿Está seguro que desea eliminar este producto del catálogo?")) return;
    
    setLoading(true);
    const updatedProductsList = products.filter(p => p.id !== id);

    await executeProductsOptimistically(
      () => updatedProductsList,
      async () => {
        // Delete directly from Firestore first (Client SDK)
        try {
          await deleteDoc(doc(db, "products", id));
          console.log("[Firebase Client] Producto eliminado directamente de Firestore!");
        } catch (fsErr: any) {
          console.warn("[Firebase Client Warning] No se pudo eliminar producto directamente en Firestore (usando fallback de servidor):", fsErr.message);
          if (typeof addErrorLog === "function") {
            addErrorLog("Eliminar Producto (Cliente SDK)", fsErr);
          }
        }

        // Delete from Firestore directly through Server API (as fallback)
        const res = await fetch(`/api/products/${id}`, {
          method: "DELETE",
          headers: { 
            "Authorization": currentUser?.uid || ""
          }
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        console.log("Producto eliminado de Firestore!");
        showToast("Producto eliminado del catálogo");
      },
      "Error al eliminar producto"
    );

    setLoading(false);
  };

  return (
    <div id="admin-panel-container" className="bg-slate-50 rounded-3xl border border-slate-100 p-6 md:p-8">
      
      {/* Toast state notifications */}
      {message && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border animate-slideUp ${
            message.type === "success" 
              ? "bg-slate-900 border-slate-800 text-teal-400" 
              : message.type === "warning"
              ? "bg-amber-950 border-amber-800 text-amber-500"
              : "bg-rose-950 border-rose-800 text-rose-300"
          }`}
        >
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
            message.type === "success" 
              ? "bg-teal-400" 
              : message.type === "warning"
              ? "bg-amber-500"
              : "bg-rose-500"
          }`}></div>
          <span className="text-sm font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-2 hover:opacity-80">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Admin Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-6 mb-6">
        <div>
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <Sparkles size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">Panel Administrativo</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Gestión de Catálogo Virtual</h2>
        </div>

        {/* Tab Selector */}
        <div className="flex flex-wrap gap-2 bg-slate-100 p-1 rounded-xl self-start">
          <button
            onClick={() => { setActiveTab("products"); setIsEditingProduct(false); setIsEditingUser(false); }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "products"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Productos
          </button>
          <button
            onClick={() => { setActiveTab("store"); setIsEditingProduct(false); setIsEditingUser(false); }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "store"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Ajustes de Tienda
          </button>
          <button
            onClick={() => { setActiveTab("categories"); setIsEditingProduct(false); setIsEditingUser(false); }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "categories"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Categorías
          </button>

          {currentUser?.role === "Administrador" && (
            <>
              <button
                onClick={() => { setActiveTab("diagnostics"); setIsEditingProduct(false); setIsEditingUser(false); }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                  activeTab === "diagnostics"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Database size={12} className={activeTab === "diagnostics" ? "text-amber-500" : "text-slate-400"} />
                <span>Estado de la Nube</span>
              </button>

              <button
                onClick={() => { setActiveTab("users"); setIsEditingProduct(false); setIsEditingUser(false); }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                  activeTab === "users"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Shield size={12} className={activeTab === "users" ? "text-amber-500" : "text-slate-400"} />
                <span>Usuarios y Roles</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* RENDER FORM: PRODUCT DETAILS (CREATE / EDIT) */}
      {isEditingProduct ? (
        <form onSubmit={handleSubmitProductForm} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
            <h3 className="font-sans font-semibold text-lg text-slate-800">
              {editingProductId ? "Editar Ficha de Producto" : "Agregar Nuevo Producto"}
            </h3>
            <button
              type="button"
              onClick={() => setIsEditingProduct(false)}
              className="p-1 px-3 text-xs border border-slate-200 rounded-lg text-slate-400 hover:text-slate-700 bg-slate-50"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left inputs column */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">SKUúnico *</label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  placeholder="Ej: CAL-ZAP-01"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nombre del Producto *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  placeholder="Ej: Botas de Cuero Elegante"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4 animate-fadeIn">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Categoría</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="Custom">+ Agregar otra categoría</option>
                  </select>
                </div>

                {category === "Custom" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nueva Categoría</label>
                    <input
                      type="text"
                      value={newCustomCategory}
                      onChange={(e) => setNewCustomCategory(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Ej: Cinturones"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Precio Unitario ($)</label>
                  <input
                    type="number"
                    value={retailPrice || ""}
                    onChange={(e) => setRetailPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    placeholder="0"
                    min="0"
                    step="any"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Precio por Mayor ($)</label>
                  <input
                    type="number"
                    value={wholesalePrice || ""}
                    onChange={(e) => setWholesalePrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    placeholder="0"
                    min="0"
                    step="any"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Descripción del Producto</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 h-28"
                  placeholder="Detalla todas las especificaciones, tallas, colores o procedencia del producto..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2 bg-slate-50 px-3.5 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isAvailable"
                    checked={isAvailable}
                    onChange={(e) => setIsAvailable(e.target.checked)}
                    className="w-4 h-4 text-amber-500 border-slate-300 rounded-sm focus:ring-amber-500 cursor-pointer"
                  />
                  <label htmlFor="isAvailable" className="text-[11px] font-bold text-slate-700 cursor-pointer select-none">
                    En Stock / Disponible
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="formHidePrice"
                    checked={formHidePrice}
                    onChange={(e) => setFormHidePrice(e.target.checked)}
                    className="w-4 h-4 text-amber-500 border-slate-300 rounded-sm focus:ring-amber-500 cursor-pointer"
                  />
                  <label htmlFor="formHidePrice" className="text-[11px] font-bold text-slate-700 cursor-pointer select-none">
                    Ocultar Precio (Public)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="formIsHidden"
                    checked={formIsHidden}
                    onChange={(e) => setFormIsHidden(e.target.checked)}
                    className="w-4 h-4 text-amber-500 border-slate-300 rounded-sm focus:ring-amber-500 cursor-pointer"
                  />
                  <label htmlFor="formIsHidden" className="text-[11px] font-bold text-slate-700 cursor-pointer select-none">
                    Ocultar de Catálogo
                  </label>
                </div>
              </div>
            </div>

            {/* Right media elements column */}
            <div className="space-y-4">
              
              {/* PC / Android Upload Zone */}
              <div className="border border-dashed border-slate-200 hover:border-amber-450 bg-amber-50/5 hover:bg-amber-50/10 p-5 rounded-2xl transition-all relative flex flex-col items-center justify-center text-center">
                <input
                  id="media-file-picker"
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleSelectMediaFiles}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                
                <div className="flex flex-col items-center pointer-events-none">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-2">
                    <Upload size={18} />
                  </div>
                  <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Subir Fotos y Videos
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 max-w-[280px]">
                    Selecciona varias fotos y videos a la vez. Admite MP4, PNG, JPG, WEBP, etc.
                  </span>
                </div>
              </div>

              {/* Modern Interactive Upload Queue (Individual progress, previews, delete and retries) */}
              {uploadQueue.length > 0 && (
                <div className="space-y-2.5">
                  <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Cola de Medios Seleccionados ({uploadQueue.length})
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    {uploadQueue.map((item) => {
                      const isUploading = item.status === "uploading" || item.status === "compressing";
                      const isSuccess = item.status === "success";
                      const isError = item.status === "error";

                      return (
                        <div key={item.id} className="relative bg-white border border-slate-200 rounded-xl p-2 flex flex-col justify-between shadow-2xs overflow-hidden group">
                          
                          {/* Photo aspect ratio container */}
                          <div className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 mb-1.5 border border-slate-150">
                            {item.previewUrl ? (
                              <img
                                src={item.previewUrl}
                                alt={item.name}
                                referrerPolicy="no-referrer"
                                className={`w-full h-full object-cover transition-all duration-300 ${isUploading ? "brightness-50 blur-[1px]" : ""}`}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <ImageIcon size={20} className="opacity-30" />
                              </div>
                            )}

                            {/* Upload progress circular overlay */}
                            {isUploading && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white p-1">
                                <div className="relative flex items-center justify-center">
                                  <span className="w-8 h-8 rounded-full border-2 border-white/20 border-t-amber-400 animate-spin" />
                                  <span className="absolute text-[9px] font-bold">{item.progress}%</span>
                                </div>
                                <span className="text-[8px] font-semibold tracking-wider uppercase mt-1">
                                  {item.status === "compressing" ? "Ajustando..." : "Subiendo..."}
                                </span>
                              </div>
                            )}

                            {/* Success item indicator */}
                            {isSuccess && (
                              <div className="absolute top-1 right-1 p-1 bg-emerald-500 text-white rounded-full shadow-sm">
                                <Check size={8} className="stroke-[3]" />
                              </div>
                            )}

                            {/* Error item indicator */}
                            {isError && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-500/90 text-white p-1">
                                <AlertTriangle size={14} className="text-white mb-0.5 animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-wide">Fallo</span>
                              </div>
                            )}
                          </div>

                          {/* Footer details per item */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-700 block truncate max-w-full leading-tight" title={item.name}>
                              {item.name}
                            </span>

                            {/* Linear sub bar indicator */}
                            {isUploading && (
                              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden border border-slate-200">
                                <div
                                  className="h-full bg-linear-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-300"
                                  style={{ width: `${item.progress}%` }}
                                />
                              </div>
                            )}

                            {/* Error text feedback */}
                            {isError && item.errorMsg && (
                              <span className="text-[8px] font-semibold text-rose-500 block leading-tight truncate" title={item.errorMsg}>
                                {item.errorMsg}
                              </span>
                            )}

                            {/* Action links */}
                            <div className="flex gap-1.5 justify-between pt-1 border-t border-slate-50 mt-1">
                              {/* Remove item target */}
                              <button
                                type="button"
                                onClick={() => handleRemoveQueueItem(item.id)}
                                disabled={isUploading}
                                className="text-[9px] font-bold uppercase text-rose-500 hover:text-rose-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Eliminar de la cola"
                              >
                                Eliminar
                              </button>

                              {/* Retry action */}
                              {isError && (
                                <button
                                  type="button"
                                  onClick={() => handleRetryQueueItem(item.id)}
                                  className="text-[9px] font-bold uppercase text-amber-600 hover:text-amber-700 transition-colors flex items-center gap-0.5"
                                  title="Volver a intentar"
                                >
                                  <RefreshCw size={8} className="animate-spin-reverse" />
                                  Reintentar
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Photos & Galleries Roster */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Galería de Fotos ({imagesList.filter(url => url.trim() !== "").length})</label>
                  <button
                    type="button"
                    onClick={handleAddImageField}
                    className="text-[10px] font-bold uppercase tracking-wider text-amber-600 hover:text-amber-700 underline"
                  >
                    + Enlace Manual
                  </button>
                </div>

                {/* Grid of uploaded images previews and custom list inputs */}
                <div className="space-y-3">
                  {imagesList.filter(url => url.trim() !== "").length > 0 && (
                    <div className="grid grid-cols-4 gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100/80">
                      {imagesList.map((url, index) => {
                        if (!url.trim()) return null;
                        return (
                          <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group bg-white shadow-2xs">
                            <img 
                              src={url} 
                              alt="Thumbnail" 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover" 
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveImageField(index)}
                              className="absolute top-1 right-1 p-1 bg-rose-500 hover:bg-rose-600 text-white rounded-full transition-colors shadow-sm"
                              title="Remover imagen"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Manual input list collapsible to avoid visual clutter */}
                  <details className="text-left border border-slate-100 rounded-xl bg-slate-50/50">
                    <summary className="px-3.5 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:bg-slate-50 rounded-xl">
                      Editar Enlaces de Fotos ({imagesList.length})
                    </summary>
                    <div className="p-3 space-y-2 max-h-56 overflow-y-auto pr-1 border-t border-slate-100">
                      {imagesList.map((url, index) => (
                        <div key={index} id={`img-field-${index}`} className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={url}
                            onChange={(e) => handleImageFieldChange(index, e.target.value)}
                            className="flex-grow px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden bg-white text-slate-700 font-medium"
                            placeholder="Enlace o ruta del archivo: /uploads/..."
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveImageField(index)}
                            className="text-rose-500 hover:text-rose-700 text-xs font-medium px-2 py-1.5 border border-slate-200 bg-white hover:bg-slate-100 rounded-lg shrink-0 transition-colors"
                          >
                            Eliminar
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </div>

              {/* Video URL Controller */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Video del Producto (YouTube o subido localmente)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <Video size={14} />
                  </span>
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className="w-full pl-8 pr-16 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden text-slate-700 font-medium"
                    placeholder="Enlace de YouTube/Vimeo o ruta local: /uploads/..."
                  />
                  {videoUrl && (
                    <button
                      type="button"
                      onClick={() => setVideoUrl("")}
                      className="absolute right-2 top-1.5 px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                {videoUrl && (
                  <div className="mt-2 text-[10px] bg-slate-50/50 p-2 border border-slate-100 rounded-lg flex items-center justify-between animate-fadeIn">
                    <span className="text-slate-500 font-mono truncate max-w-[200px]">Video: {videoUrl}</span>
                    <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wide">Listo para reproducir</span>
                  </div>
                )}
              </div>

              {/* Dynamic Video Preview Box */}
              {videoUrl && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 animate-fadeIn">
                  <span className="text-[11px] font-semibold text-slate-400 block mb-2 uppercase">Previsualización de Video Reproducible</span>
                  {(() => {
                    const cleanUrl = videoUrl.trim();
                    const ytReg = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
                    const ytMatch = cleanUrl.match(ytReg);
                    const vimeoReg = /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)([0-9]+)/;
                    const vimeoMatch = cleanUrl.match(vimeoReg);

                    if (ytMatch && ytMatch[1]) {
                      return (
                        <div className="aspect-video w-full rounded-lg overflow-hidden relative border bg-black shadow-inner">
                          <iframe
                            src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                            className="absolute top-0 left-0 w-full h-full"
                            allowFullScreen
                            allow="autoplay; encrypted-media"
                          />
                        </div>
                      );
                    } else if (vimeoMatch && vimeoMatch[1]) {
                      return (
                        <div className="aspect-video w-full rounded-lg overflow-hidden relative border bg-black shadow-inner">
                          <iframe
                            src={`https://player.vimeo.com/video/${vimeoMatch[1]}`}
                            className="absolute top-0 left-0 w-full h-full"
                            allowFullScreen
                            allow="autoplay; encrypted-media"
                          />
                        </div>
                      );
                    } else if (
                      cleanUrl.startsWith("/uploads/") ||
                      cleanUrl.endsWith(".mp4") ||
                      cleanUrl.endsWith(".webm") ||
                      cleanUrl.endsWith(".ogg") ||
                      cleanUrl.includes("drive.google.com")
                    ) {
                      return (
                        <div className="aspect-video w-full rounded-lg overflow-hidden relative border bg-black shadow-inner">
                          <video
                            src={cleanUrl}
                            controls
                            className="absolute top-0 left-0 w-full h-full object-contain"
                          />
                        </div>
                      );
                    } else {
                      return (
                        <div className="aspect-video w-full rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 bg-white p-3 text-center">
                          <Video size={20} className="text-slate-300 mb-1" />
                          <span className="text-[10px] font-semibold text-slate-500">¿Formato/Enlace no soportado directamente?</span>
                          <span className="text-[9px] text-slate-400 mt-1">Se mostrará como enlace externo. No se puede previsualizar en el catálogo.</span>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}

              {/* Preview Box */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-400 block mb-2 uppercase">Previsualización de Foto Principal</span>
                {imagesList[0] && (
                  imagesList[0].startsWith("http://") || 
                  imagesList[0].startsWith("https://") || 
                  imagesList[0].startsWith("/uploads/")
                ) ? (
                  <div className="aspect-video w-full rounded-lg overflow-hidden relative border bg-white">
                    <img src={imagesList[0]} alt="Preview" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="aspect-video w-full rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 bg-white">
                    <ImageIcon size={24} />
                    <span className="text-xs font-medium mt-1">No hay link de foto válido listo</span>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Action Row */}
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-6 mt-6">
            <button
              type="button"
              onClick={() => setIsEditingProduct(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            {(() => {
              const isUploadingActive = uploadQueue.some(
                (q) => q.status === "uploading" || q.status === "compressing" || q.status === "pending"
              );
              return (
                <button
                  type="submit"
                  disabled={loading || isUploadingActive}
                  className="px-6 py-2 bg-slate-900 border border-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-850 flex items-center gap-1.5 transition-all shadow-xs shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploadingActive ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin inline-block" />
                      <span>Subiendo fotos...</span>
                    </>
                  ) : (
                    <>
                      <Save size={13} />
                      <span>{loading ? "Guardando..." : "Guardar Producto"}</span>
                    </>
                  )}
                </button>
              );
            })()}
          </div>
        </form>
      ) : activeTab === "products" ? (
        
        /* RENDER PRODUCTS DICTIONARY/LIST SECTION */
        <div className="space-y-4 animate-fadeIn">
          {/* USER FEEDBACK & ENGAGEMENT DASHBOARD */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Stat 1: Views */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-3xs flex items-center gap-3.5">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Eye size={18} />
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Vistas Totales</span>
                <span className="text-lg font-extrabold text-slate-800 leading-none">{totalViews}</span>
                <span className="text-[9px] text-slate-400 block font-medium mt-0.5">Fichas de producto abiertas</span>
              </div>
            </div>

            {/* Stat 2: WhatsApp Contacts */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-3xs flex items-center gap-3.5">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <Phone size={18} />
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Consultas WA</span>
                <span className="text-lg font-extrabold text-slate-800 leading-none">{totalClicks}</span>
                <span className="text-[9px] text-slate-400 block font-medium mt-0.5">Clicks en redirección WhatsApp</span>
              </div>
            </div>

            {/* Stat 3: Hot Product */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-3xs flex items-center gap-3.5">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                <TrendingUp size={18} />
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Más Visto</span>
                <span className="text-xs font-bold text-slate-800 truncate block mt-0.5" title={mostViewedProduct ? mostViewedProduct.name : ""}>
                  {mostViewedProduct ? mostViewedProduct.name : "Ninguno"}
                </span>
                <span className="text-[9px] text-amber-600 block font-semibold mt-0.5">
                  {mostViewedProduct ? `${mostViewedProduct.views || 0} vistas` : "Sin visitas registradas"}
                </span>
              </div>
            </div>

            {/* Stat 4: Most Inquired */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-3xs flex items-center gap-3.5">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                <ThumbsUp size={18} />
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Más Consultado</span>
                <span className="text-xs font-bold text-slate-800 truncate block mt-0.5" title={mostClickedProduct ? mostClickedProduct.name : ""}>
                  {mostClickedProduct ? mostClickedProduct.name : "Ninguno"}
                </span>
                <span className="text-[9px] text-rose-600 block font-semibold mt-0.5">
                  {mostClickedProduct ? `${mostClickedProduct.whatsappClicks || 0} consultas` : "Sin clicks registrados"}
                </span>
              </div>
            </div>
          </div>

          {/* UPGRADED VISUAL ANALYTICS DASHBOARD */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5 animate-fadeIn">
            {/* Dashboard Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-100 text-slate-800 rounded-lg">
                  <BarChart2 size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    Análisis de Interés y Popularidad
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 text-emerald-600 animate-pulse border border-emerald-100">
                      En Tiempo Real
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Datos interactivos de visualizaciones y conversiones de tus artículos</p>
                </div>
              </div>

              {/* Toggle Buttons */}
              <div className="flex items-center p-0.5 bg-slate-100 rounded-xl self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => setAnalyticsTab("products")}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    analyticsTab === "products"
                      ? "bg-white text-slate-800 shadow-3xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Top Productos
                </button>
                <button
                  type="button"
                  onClick={() => setAnalyticsTab("categories")}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    analyticsTab === "categories"
                      ? "bg-white text-slate-800 shadow-3xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Categorías
                </button>
                <button
                  type="button"
                  onClick={() => setAnalyticsTab("conversion")}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    analyticsTab === "conversion"
                      ? "bg-white text-slate-800 shadow-3xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Tasa de Conversión
                </button>
              </div>
            </div>

            {!hasAnalyticsData ? (
              /* Informative Empty State */
              <div className="py-8 text-center flex flex-col items-center justify-center gap-3">
                <div className="p-3 bg-slate-50 text-slate-400 rounded-full animate-pulse">
                  <BarChart2 size={24} />
                </div>
                <h4 className="text-xs font-bold text-slate-700">Esperando primeras interacciones</h4>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Las visualizaciones de fichas y los clics de WhatsApp se graficarán automáticamente en tiempo real a medida que tus clientes interactúen con el catálogo.
                </p>
              </div>
            ) : (
              /* Two Column Dashboard Layout */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Graph Column */}
                <div className="lg:col-span-2 h-[260px] sm:h-[280px] bg-slate-50/50 rounded-xl p-3 border border-slate-100 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 px-2 pb-2">
                    <span>
                      {analyticsTab === "products" && "Vistas vs Consultas por Producto"}
                      {analyticsTab === "categories" && "Rendimiento Total por Categoría"}
                      {analyticsTab === "conversion" && "% Clics WA / Vistas (Mínimo 2 visitas)"}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400 font-mono">Top 8 Artículos</span>
                  </div>

                  <div className="w-full h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      {analyticsTab === "products" ? (
                        <BarChart
                          data={topProductsChartData}
                          margin={{ top: 5, right: 5, left: -25, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 9, fill: "#64748B", fontWeight: 500 }}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 9, fill: "#64748B" }}
                          />
                          <Tooltip
                            content={({ active, payload }: any) => {
                              if (active && payload && payload.length) {
                                const p = payload[0].payload;
                                return (
                                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl shadow-xl text-[11px] space-y-1 text-white">
                                    <p className="font-bold text-slate-200 border-b border-slate-800 pb-1 mb-1 max-w-[180px] truncate">{p.fullName}</p>
                                    <p className="flex items-center gap-1.5 text-blue-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                      <span>Vistas:</span>
                                      <strong className="text-white">{p.vistas}</strong>
                                    </p>
                                    <p className="flex items-center gap-1.5 text-emerald-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                      <span>Consultas WA:</span>
                                      <strong className="text-white">{p.consultas}</strong>
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="vistas" name="Vistas" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={22} />
                          <Bar dataKey="consultas" name="Consultas" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={22} />
                        </BarChart>
                      ) : analyticsTab === "categories" ? (
                        <BarChart
                          data={categoryChartData}
                          margin={{ top: 5, right: 5, left: -25, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 9, fill: "#64748B", fontWeight: 500 }}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 9, fill: "#64748B" }}
                          />
                          <Tooltip
                            content={({ active, payload }: any) => {
                              if (active && payload && payload.length) {
                                const p = payload[0].payload;
                                return (
                                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl shadow-xl text-[11px] space-y-1 text-white">
                                    <p className="font-bold text-slate-200 border-b border-slate-800 pb-1 mb-1">{p.name}</p>
                                    <p className="flex items-center gap-1.5 text-blue-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                      <span>Vistas:</span>
                                      <strong className="text-white">{p.vistas}</strong>
                                    </p>
                                    <p className="flex items-center gap-1.5 text-emerald-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                      <span>Consultas WA:</span>
                                      <strong className="text-white">{p.consultas}</strong>
                                    </p>
                                    <p className="text-slate-400 text-[9px] pt-1 border-t border-slate-800/60 mt-1">
                                      {p.productos} {p.productos === 1 ? 'producto' : 'productos'} en catálogo
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="vistas" name="Vistas" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={22} />
                          <Bar dataKey="consultas" name="Consultas" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={22} />
                        </BarChart>
                      ) : (
                        <BarChart
                          data={topConversionProducts}
                          margin={{ top: 5, right: 5, left: -25, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 9, fill: "#64748B", fontWeight: 500 }}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 9, fill: "#64748B" }}
                            unit="%"
                          />
                          <Tooltip
                            content={({ active, payload }: any) => {
                              if (active && payload && payload.length) {
                                const p = payload[0].payload;
                                return (
                                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl shadow-xl text-[11px] space-y-1 text-white">
                                    <p className="font-bold text-slate-200 border-b border-slate-800 pb-1 mb-1 max-w-[180px] truncate">{p.fullName}</p>
                                    <p className="flex items-center gap-1.5 text-amber-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                      <span>Tasa Conversión:</span>
                                      <strong className="text-white">{p.tasaConversion}%</strong>
                                    </p>
                                    <div className="text-[9px] text-slate-400 pt-1 border-t border-slate-800 mt-1 flex justify-between gap-3">
                                      <span>Vistas: {p.vistas}</span>
                                      <span>Clics: {p.consultas}</span>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="tasaConversion" name="Conversión" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={26} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Intelligent Insights Column */}
                <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/30 flex flex-col justify-between space-y-4">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2.5">
                      Insights & Conversión
                    </span>

                    {/* Funnel Widget */}
                    <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-3xs mb-3 flex items-center justify-between">
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400">Conversión Global</span>
                        <span className="text-xl font-black text-slate-800 mt-0.5">{globalConversionRate}%</span>
                        <span className="block text-[9px] text-slate-400 leading-none mt-1">De visitas a clics de WhatsApp</span>
                      </div>
                      <div className="w-10 h-10 rounded-full border-4 border-slate-100 border-t-emerald-500 flex items-center justify-center text-[10px] font-bold text-slate-700">
                        {globalConversionRate}%
                      </div>
                    </div>

                    {/* High Converting Products List */}
                    <div className="space-y-2">
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                        Líderes de Conversión (Mín. 2 vistas)
                      </span>
                      {top3ConversionInsights.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic">No hay clics registrados aún.</p>
                      ) : (
                        top3ConversionInsights.map((item, idx) => (
                          <div key={item.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                            <div className="min-w-0 pr-2">
                              <span className="font-semibold text-slate-700 text-[11px] block truncate">{item.name}</span>
                              <span className="text-[9px] text-slate-400">{item.vistas} vistas • {item.consultas} clics</span>
                            </div>
                            <span className="shrink-0 px-1.5 py-0.5 bg-amber-50 text-amber-700 font-bold text-[10px] rounded-md">
                              {item.rate}%
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Contextual Actionable Tip */}
                  <div className="bg-blue-50/50 border border-blue-100/50 rounded-xl p-2.5 text-[10px] text-blue-800 leading-normal">
                    {top3ConversionInsights.length > 0 ? (
                      <p>
                        💡 <strong>Tip Comercial:</strong> El artículo <strong>{top3ConversionInsights[0].name}</strong> tiene una excelente conversión del <strong>{top3ConversionInsights[0].rate}%</strong>. Considera darle más protagonismo en redes o colocarlo en la cabecera del catálogo.
                      </p>
                    ) : (
                      <p>
                        💡 <strong>Consejo:</strong> Monitorea este panel para identificar qué productos generan un interés real de compra antes de realizar tus pedidos de stock.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-3xs gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-slate-700">Tienes {products.length} productos en el catálogo</span>
              <span className="text-xs text-slate-400">Si tus clientes no pueden ver tus artículos desde otros dispositivos, usa "Sincronizar" para subirlos a la base de datos de la nube.</span>
            </div>
            
            <div className="flex items-center gap-2">
              {products.length > 0 && (
                <button
                  type="button"
                  onClick={handleSyncLocalWithCloud}
                  disabled={syncingCloud}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-emerald-500/15 flex items-center gap-1.5 shrink-0 cursor-pointer"
                  title="Sincroniza y fuerza la subida de todos tus productos hacia Google Cloud para que estén accesibles desde cualquier dispositivo."
                >
                  <CloudUpload size={14} className={syncingCloud ? "animate-bounce" : ""} />
                  <span>{syncingCloud ? "Sincronizando..." : "Sincronizar con la Nube"}</span>
                </button>
              )}

              <button
                onClick={handleOpenCreateProduct}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-amber-500/15 flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Plus size={14} />
                <span>Agregar Producto</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            {products.length === 0 ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-4">
                <Store size={40} className="text-slate-300 mb-2" />
                <span className="text-sm font-medium text-slate-600">No se han registrado productos en la base de datos de la nube.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table id="products-admin-table" className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Foto / Producto</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">SKU</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Categoría</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Precios (Unidad / Mayor)</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Interés / Feedback</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((prod) => (
                      <tr key={prod.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg bg-slate-50 border overflow-hidden shrink-0">
                              <img
                                src={prod.images && prod.images.length > 0 ? prod.images[0] : "https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=600&auto=format&fit=crop"}
                                alt={prod.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <span className="font-semibold text-slate-900 text-sm block leading-snug">{prod.name}</span>
                              <span className="text-slate-400 text-xs font-medium line-clamp-1">{prod.description || "Sin descripción."}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-sm font-mono text-slate-600">{prod.sku}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 text-xs font-semibold text-sky-700 bg-sky-50 rounded-md">
                            {prod.category}
                          </span>
                        </td>
                        <td className="p-4 text-sm font-medium">
                          <div className="flex flex-col">
                            <span className="text-slate-900 font-semibold">${prod.retailPrice.toLocaleString()}</span>
                            {prod.wholesalePrice > 0 ? (
                              <span className="text-amber-600 text-xs">${prod.wholesalePrice.toLocaleString()} por mayor</span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">No mayorista</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-sm uppercase ${
                              prod.isAvailable
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {prod.isAvailable ? "Disponible" : "Sin Stock"}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col text-xs space-y-0.5">
                            <span className="text-slate-600 font-medium flex items-center gap-1">
                              <Eye size={12} className="text-blue-500 shrink-0" />
                              <strong className="text-slate-800">{prod.views || 0}</strong> vistas
                            </span>
                            <span className="text-emerald-600 font-medium flex items-center gap-1" title="Preguntas enviadas por WhatsApp">
                              <Phone size={11} className="text-emerald-500 shrink-0" />
                              <strong className="text-emerald-800">{prod.whatsappClicks || 0}</strong> consultas
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {/* Ocultar/Mostrar Precio */}
                            <button
                              onClick={() => handleToggleProductPrice(prod)}
                              className={`p-1 px-2 text-[10px] border rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                prod.hidePrice
                                  ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                                  : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                              }`}
                              title={prod.hidePrice ? "Mostrar precio al público" : "Ocultar precio al público"}
                            >
                              {prod.hidePrice ? <EyeOff size={11} className="text-amber-500" /> : <Eye size={11} />}
                              <span>{prod.hidePrice ? "Pr. Oculto" : "Ocultar Pr."}</span>
                            </button>

                            {/* Ocultar/Mostrar Producto Entero */}
                            <button
                              onClick={() => handleToggleProductVisibility(prod)}
                              className={`p-1 px-2 text-[10px] border rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                prod.isHidden
                                  ? "bg-rose-50 border-rose-250 text-rose-700 hover:bg-rose-100"
                                  : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                              }`}
                              title={prod.isHidden ? "Hacer visible en catálogo público" : "Ocultar del catálogo público"}
                            >
                              {prod.isHidden ? <EyeOff size={11} className="text-rose-500 animate-pulse" /> : <Eye size={11} />}
                              <span>{prod.isHidden ? "Oculto" : "Visible"}</span>
                            </button>

                            <button
                              onClick={() => handleOpenEditProduct(prod)}
                              className="p-1 px-2 text-xs border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg text-slate-600 font-semibold flex items-center gap-1 cursor-pointer"
                              title="Editar producto"
                            >
                              <Edit2 size={12} />
                              <span>Editar</span>
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(prod.id)}
                              className="p-1 px-2 text-xs border border-rose-100 hover:bg-rose-50 rounded-lg text-rose-500 font-semibold flex items-center gap-1 cursor-pointer"
                              title="Eliminar producto"
                            >
                              <Trash2 size={12} />
                              <span>Quitar</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "store" ? (
        
        /* ADJUSTS STORE GENERALS FORM */
        <form onSubmit={handleSaveStoreConfig} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs animate-fadeIn space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-sans font-semibold text-lg text-slate-800">Parámetros de Ubicación y Contactos</h3>
            <p className="text-xs text-slate-400">Edita la información pública mostrada en las tarjetas, accesos rápidos y barra de pie de página.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nombre Comercial de Tienda *</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                  placeholder="Ej: Calzados Roby"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Dirección Física de la Tienda</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden"
                  placeholder="Ej: Calle Principal #123, Frente a la Plaza Central"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Teléfono Fijo / Celular para llamadas</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden"
                  placeholder="Ej: 591 7654321"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Número de WhatsApp Oficial (Incluir código de área)</label>
                <input
                  type="text"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden"
                  placeholder="Ej: 5917654321"
                />
                <span className="text-[10px] text-slate-400 block mt-1">Escribe solo dígitos, omitiendo espacios o signos más (Por ejemplo: 59176543210 para Bolivia).</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Enlace de Ubicación Maps (Google Maps URL)</label>
                <input
                  type="text"
                  value={locationUrl}
                  onChange={(e) => setLocationUrl(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden"
                  placeholder="https://maps.google.com/..."
                />
                <span className="text-[10px] text-slate-400 block mt-1 font-medium">Permite a los usuarios tocar sobre la dirección física y ser derivados directamente a la app de Google Maps para saber cómo llegar.</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Mensaje prediseñado para WhatsApp</label>
              <textarea
                value={whatsappCustomMessage}
                onChange={(e) => setWhatsappCustomMessage(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden h-20 bg-white"
                placeholder="Hola! Estoy interesado en el producto: {productName} (SKU: {productSku})"
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                Puedes usar variables como **{"{productName}"}** y **{"{productSku}"}**. Al apretar en una tarjeta, se pre-llenará con esa información de forma dinámica.
              </span>
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Opciones Visuales y de Exposición</span>

              <div className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-lg">
                <div className="flex items-center gap-2">
                  {showPrices ? <Eye size={16} className="text-emerald-500" /> : <EyeOff size={16} className="text-slate-400" />}
                  <div>
                    <span className="text-xs font-semibold text-slate-700 block">Exponer Precios al Público</span>
                    <span className="text-[10px] text-slate-400">Si está inactivo, los visitantes verán "Consultar precios por privado".</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={showPrices}
                  onChange={(e) => setShowPrices(e.target.checked)}
                  className="w-9 h-5 text-amber-500 bg-slate-100 border-slate-300 rounded-full focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-lg">
                <div className="flex items-center gap-2">
                  {hideOutOfStock ? <EyeOff size={16} className="text-rose-500" /> : <Eye size={16} className="text-slate-400" />}
                  <div>
                    <span className="text-xs font-semibold text-slate-700 block">Ocultar Productos sin Stock</span>
                    <span className="text-[10px] text-slate-400">Si está activo, los productos marcados como "Fuera de Stock" no se mostrarán al público.</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={hideOutOfStock}
                  onChange={(e) => setHideOutOfStock(e.target.checked)}
                  className="w-9 h-5 text-amber-500 bg-slate-100 border-slate-300 rounded-full focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-lg">
                <div className="flex items-center gap-2">
                  {showLocation ? <Eye size={16} className="text-emerald-500" /> : <EyeOff size={16} className="text-slate-400" />}
                  <div>
                    <span className="text-xs font-semibold text-slate-700 block">Exponer Pestaña de Ubicación y Sucursal</span>
                    <span className="text-[10px] text-slate-400">Activa o desactiva la vista del mapa e imágenes de tu sucursal física en el catálogo.</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={showLocation}
                  onChange={(e) => setShowLocation(e.target.checked)}
                  className="w-9 h-5 text-amber-500 bg-slate-100 border-slate-300 rounded-full focus:ring-amber-500"
                />
              </div>

              <div className="p-3 bg-white border border-slate-100 rounded-lg space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Diseño de Banner de Inicio</label>
                  <select
                    value={bannerStyle}
                    onChange={(e) => setBannerStyle(e.target.value as "classic" | "compact")}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden bg-slate-50 cursor-pointer"
                  >
                    <option value="classic">Clásico (Banner expansivo detallado)</option>
                    <option value="compact">Compacto (Cabecera moderna minimalista)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Anuncio o Cinta Promocional Superior (Marquesina)</label>
                  <input
                    type="text"
                    value={promoBannerText}
                    onChange={(e) => setPromoBannerText(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden"
                    placeholder="Ej: 🔥 ¡Envíos gratis este fin de semana en compras mayores a $50! 🔥"
                  />
                  <span className="text-[9px] text-slate-400 block mt-0.5">Deja este campo vacío si no deseas mostrar una cinta de aviso promocional.</span>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-rose-600 mb-1.5">
                    <Shield size={14} className="shrink-0" />
                    <label className="block text-xs font-bold font-sans">Canal de Alertas y Errores del Sistema</label>
                  </div>
                  <input
                    type="email"
                    value={errorNotificationEmail}
                    onChange={(e) => setErrorNotificationEmail(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden"
                    placeholder="Ej: tu-correo@ejemplo.com"
                    required
                  />
                  <span className="text-[9px] text-slate-400 block mt-0.5">
                    Designa una cuenta de correo electrónico para centralizar el envío de alertas de fallas y diagnósticos reportados por clientes y usuarios.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Store Location Photos & Galleries Roster */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="border-b border-slate-200 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-800 block uppercase tracking-wider">Fotografías de la Sucursal / Tienda ({storeImagesList.filter(url => url.trim() !== "").length})</span>
                <span className="text-[10px] text-slate-400 block font-medium">Sube fotos o añade enlaces de tu showroom, frontis o estanterías de venta para que los clientes reconozcan tu ubicación física.</span>
              </div>
              <button
                type="button"
                onClick={handleAddStoreImageField}
                className="text-[10px] font-bold uppercase tracking-wider text-amber-600 hover:text-amber-700 underline self-start sm:self-auto"
              >
                + Enlace Manual
              </button>
            </div>

            {/* Upload Zone for Store Photos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <div className="border border-dashed border-slate-300 hover:border-amber-400 bg-amber-50/5 hover:bg-amber-50/15 p-4 rounded-xl transition-all relative flex flex-col items-center justify-center text-center h-[140px] overflow-hidden">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleStoreMediaUpload}
                  disabled={uploadingMedia}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                
                <div className="flex flex-col items-center pointer-events-none">
                  <Upload size={16} className={`mb-1.5 ${uploadingMedia ? "animate-bounce text-amber-600" : "text-amber-500"}`} />
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                    {uploadingMedia ? "Subiendo fotos..." : "Subir Fotos de Tienda"}
                  </span>
                  <span className="text-[9px] text-slate-400 mt-1 max-w-[180px]">
                    PNG, JPG o JPEG (Hasta 15MB)
                  </span>
                </div>

                {uploadingMedia && uploadProgressMsg.includes("foto") && (
                  <div className="absolute inset-0 bg-white/98 flex flex-col items-center justify-center z-20 p-3 text-center">
                    {/* circular spinner with percent */}
                    <div className="relative flex items-center justify-center mb-1.5">
                      <span className="w-10 h-10 rounded-full border-3 border-amber-100 border-t-amber-500 animate-spin inline-block" />
                      <span className="absolute text-[9px] font-black text-amber-800">{uploadPercent}%</span>
                    </div>
                    {/* progress text messages */}
                    <span className="text-[9px] font-bold text-slate-800 uppercase tracking-wide max-w-full truncate px-1">
                      {uploadProgressMsg || "Cargando..."}
                    </span>
                  </div>
                )}
              </div>

              {/* Grid of uploaded store images previews */}
              <div className="md:col-span-2">
                {storeImagesList.filter(url => url.trim() !== "").length > 0 ? (
                  <div className="grid grid-cols-4 gap-2.5 bg-white p-3 rounded-xl border border-slate-200">
                    {storeImagesList.map((url, index) => {
                      if (!url.trim()) return null;
                      return (
                        <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group bg-slate-50 shadow-3xs">
                          <img 
                            src={url} 
                            alt={`Store Thumbnail ${index + 1}`} 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover" 
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveStoreImageField(index)}
                            className="absolute top-1 right-1 p-1 bg-rose-500 hover:bg-rose-600 text-white rounded-full transition-colors shadow-xs"
                            title="Remover imagen"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-[140px] border border-slate-200 border-dashed rounded-xl bg-white flex flex-col items-center justify-center text-center text-slate-400">
                    <Store size={22} className="text-slate-200 mb-1" />
                    <span className="text-[10px] font-bold uppercase tracking-wide">Sin imágenes cargadas</span>
                  </div>
                )}
              </div>
            </div>

            {/* Manual input list for store image URLs */}
            <details className="text-left border border-slate-200 rounded-xl bg-white">
              <summary className="px-3.5 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:bg-slate-50 rounded-xl">
                Editar Enlaces de Fotos de Tienda ({storeImagesList.length})
              </summary>
              <div className="p-3 space-y-2 max-h-48 overflow-y-auto pr-1 border-t border-slate-200">
                {storeImagesList.map((url, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => handleStoreImageFieldChange(index, e.target.value)}
                      className="flex-grow px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden bg-white text-slate-700 font-medium"
                      placeholder="Enlace o ruta del archivo: /uploads/..."
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveStoreImageField(index)}
                      className="text-rose-500 hover:text-rose-700 text-xs font-medium px-2 py-1.5 border border-slate-250 bg-white hover:bg-slate-100 rounded-lg shrink-0 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            </details>
          </div>

          {/* Save Button Row */}
          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-slate-900 border border-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-850 flex items-center gap-1.5 transition-all shadow-xs"
            >
              <Save size={13} />
              <span>{loading ? "Guardando..." : "Guardar Cambios generales"}</span>
            </button>
          </div>
        </form>
      ) : activeTab === "categories" ? (
        /* CATEGORY MANAGEMENT PANEL */
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs animate-fadeIn space-y-6 text-left">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-sans font-bold text-lg text-slate-800">Clasificación y Gestión de Categorías</h3>
            <p className="text-xs text-slate-400">Agrega o remueve las categorías comerciales que tus clientes usarán para buscar productos.</p>
          </div>

          {/* Form to Add New Category */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Crear nueva categoría</h4>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Ej: Calzado Deportivo, Abrigos, Joyas..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-amber-500/15 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FolderPlus size={14} />
                <span>Agregar categoría</span>
              </button>
            </div>
          </div>

          {/* List of categories */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Categorías comerciales actuales</h4>
            
            {categoriesList.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No hay categorías configuradas. Se usarán valores predeterminados.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {categoriesList.map((cat) => {
                  const productsCount = products.filter(p => p.category === cat).length;
                  const isSystemDefault = cat === "Otros";

                  return (
                    <div 
                      key={cat} 
                      className="flex items-center justify-between p-3.5 bg-white border border-slate-200/80 rounded-xl hover:shadow-2xs transition-shadow"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-slate-900">{cat}</span>
                        <span className="text-[11px] text-slate-400">{productsCount} productos asignados</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isSystemDefault ? (
                          <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-1 rounded-md uppercase">Por Defecto</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRemoveCategory(cat)}
                            className="p-1.5 border border-rose-100 hover:bg-rose-50 text-rose-500 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Eliminar esta categoría y reasignar sus productos"
                          >
                            <Trash2 size={12} />
                            <span>Eliminar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "diagnostics" ? (
        /* CLOUD AND CLIENT UNIFIED DIAGNOSTIC PANEL */
        <div className="space-y-6 text-left">
          {/* Quick Real-Time Warning Alert if there are active errors */}
          {errorLogs.length > 0 && (
            <div className="bg-rose-50 border border-rose-150 rounded-2xl p-4 flex gap-3 text-rose-800 animate-slideUp">
              <AlertTriangle className="text-rose-500 shrink-0" size={20} />
              <div className="space-y-1">
                <p className="text-xs font-bold font-sans">Se detectaron fallos en tus operaciones recientes ({errorLogs.length})</p>
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  El detector inteligente ha capturado errores en vivo. Revisa el historial de diagnósticos al final de esta pestaña para ver la causa exacta y cómo resolverlos rápidamente.
                </p>
              </div>
            </div>
          )}

          {/* Interactive Live Connections Diagnostic Tool */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs animate-fadeIn space-y-5">
            <div className="border-b border-slate-100 pb-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="font-sans font-semibold text-base text-slate-800 flex items-center gap-2">
                  <Terminal className="text-indigo-500" size={18} />
                  <span>Consola de Autodiagnóstico en Vivo</span>
                </h3>
                <p className="text-xs text-slate-400">Ejecuta una simulación interactiva de lectura y escritura directa para comprobar los permisos de Firebase y Servidor.</p>
              </div>
              <button
                onClick={runLocalDiagnosticTest}
                disabled={localDiagnosticResults.running}
                className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 font-semibold text-indigo-700 hover:text-indigo-800 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={13} className={localDiagnosticResults.running ? "animate-spin" : ""} />
                <span>{localDiagnosticResults.running ? "Diagnosticando..." : "Ejecutar Autodiagnóstico Completo"}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Firebase Client Read Test */}
              <div className="p-4 border border-slate-150 rounded-xl bg-slate-50/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">A) Cliente Firestore: Lectura Directa</span>
                  {localDiagnosticResults.firebaseClientRead.status === "success" && <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-sm">EXITOSO ✅</span>}
                  {localDiagnosticResults.firebaseClientRead.status === "error" && <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded-sm">RESTRINGIDO ❌</span>}
                  {localDiagnosticResults.firebaseClientRead.status === null && <span className="text-[10px] bg-slate-100 text-slate-500 font-medium px-1.5 py-0.5 rounded-sm">Sin probar</span>}
                </div>
                <p className="text-[11px] text-slate-450 leading-normal">
                  {localDiagnosticResults.firebaseClientRead.details || "Prueba si el navegador puede obtener la información del catálogo directamente de Google Firestore."}
                </p>
              </div>

              {/* Firebase Client Write Test */}
              <div className="p-4 border border-slate-150 rounded-xl bg-slate-50/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">B) Cliente Firestore: Escritura Directa</span>
                  {localDiagnosticResults.firebaseClientWrite.status === "success" && <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-sm">COMPLETO ✅</span>}
                  {localDiagnosticResults.firebaseClientWrite.status === "error" && <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-sm">RESTRINGIDO LADO CLIENTE ⚠️</span>}
                  {localDiagnosticResults.firebaseClientWrite.status === null && <span className="text-[10px] bg-slate-100 text-slate-500 font-medium px-1.5 py-0.5 rounded-sm">Sin probar</span>}
                </div>
                <p className="text-[11px] text-slate-450 leading-normal">
                  {localDiagnosticResults.firebaseClientWrite.details || "Prueba si las Reglas de Firebase de cliente permiten escrituras. Un bloqueo aquí es normal si no estás logueado y el backend sirve como puente seguro."}
                </p>
              </div>

              {/* Server GET Test */}
              <div className="p-4 border border-slate-150 rounded-xl bg-slate-50/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">C) Servidor API REST: Consultas GET</span>
                  {localDiagnosticResults.serverApiGet.status === "success" && <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-sm">ACTIVO ✅</span>}
                  {localDiagnosticResults.serverApiGet.status === "error" && <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded-sm">FALLIDO ❌</span>}
                  {localDiagnosticResults.serverApiGet.status === null && <span className="text-[10px] bg-slate-100 text-slate-500 font-medium px-1.5 py-0.5 rounded-sm">Sin probar</span>}
                </div>
                <p className="text-[11px] text-slate-450 leading-normal">
                  {localDiagnosticResults.serverApiGet.details || "Prueba si la API de tu servidor NodeJS responde correctamente a las peticiones del navegador web."}
                </p>
              </div>

              {/* Server POST Admin authorization Test */}
              <div className="p-4 border border-slate-150 rounded-xl bg-slate-50/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">D) Servidor API: Bypass de Redundancia</span>
                  {localDiagnosticResults.serverApiPost.status === "success" && <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-sm">AUTORIZADO ✅</span>}
                  {localDiagnosticResults.serverApiPost.status === "error" && <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded-sm">DENEGADO ❌</span>}
                  {localDiagnosticResults.serverApiPost.status === null && <span className="text-[10px] bg-slate-100 text-slate-500 font-medium px-1.5 py-0.5 rounded-sm">Sin probar</span>}
                </div>
                <p className="text-[11px] text-slate-450 leading-normal">
                  {localDiagnosticResults.serverApiPost.details || "Prueba si los encabezados de bypass administrativo permiten guardar cambios de forma duradera a través del servidor Express."}
                </p>
              </div>
            </div>
          </div>

          {/* Intelligent Diagnostics Log History */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs animate-fadeIn space-y-4">
            <div>
              <h3 className="font-sans font-semibold text-base text-slate-800 flex items-center gap-2">
                <AlertTriangle className="text-amber-500" size={18} />
                <span>Historial Técnico y Diagnóstico de Errores en Vivo</span>
              </h3>
              <p className="text-xs text-slate-400">Captura errores del sistema al instante, analizando la causa raíz para ofrecerte la solución adecuada sin rodeos.</p>
            </div>

            {errorLogs.length === 0 ? (
              <div className="p-6 border border-emerald-100 rounded-xl bg-emerald-50/40 text-center space-y-2">
                <CheckCircle className="text-emerald-500 mx-auto" size={28} />
                <div className="space-y-0.5">
                  <span className="font-bold text-xs text-emerald-950 font-sans block">¡Sistema Operando de Forma Excelente!</span>
                  <span className="text-[11px] text-emerald-800/90 max-w-md mx-auto block leading-normal">
                    No se han registrado fallos ni errores durante las acciones recientes de este panel de administración. Tu base de datos y tus operaciones están estables.
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {errorLogs.map((log) => (
                  <div key={log.id} className="border border-slate-150 rounded-xl p-4 space-y-3 bg-slate-50/55 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-150/70 pb-2">
                      <div className="flex items-center gap-1.5 font-sans">
                        <span className="font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100 text-[10px]">Error en {log.action}</span>
                        {log.code && <span className="font-mono text-slate-400 text-[10px]">Código: {log.code}</span>}
                        {log.status && <span className="font-mono text-slate-400 text-[10px]">Código HTTP: {log.status}</span>}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{log.timestamp}</span>
                    </div>

                    <div className="space-y-2">
                      {/* Mensaje original técnico */}
                      <div>
                        <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider block">Mensaje original de la Consola:</span>
                        <p className="font-mono font-medium text-slate-700 bg-slate-100/70 p-2 rounded border border-slate-150 text-[10px] whitespace-pre-wrap overflow-x-auto">
                          {log.message}
                        </p>
                      </div>

                      {/* Análisis de Diagnóstico amigable */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-amber-950 font-bold uppercase tracking-wider block">Análisis de Diagnóstico dstores:</span>
                        <p className="text-slate-700 leading-relaxed font-sans font-medium text-[11px] bg-amber-50/20 p-2.5 border border-amber-100 rounded-lg">
                          {log.diagnosis}
                        </p>
                      </div>

                      {/* Solución a mano */}
                      <div className="space-y-1 bg-emerald-50/20 p-2.5 border border-emerald-150/70 rounded-lg">
                        <span className="text-[10px] text-emerald-950 font-bold uppercase tracking-wider block">Solución Sugerida:</span>
                        <div className="text-emerald-900 leading-relaxed font-sans text-[11px] whitespace-pre-line font-medium">
                          {log.solution}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Persistent Database Log History for Clients & Users */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs animate-fadeIn space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3.5">
              <div>
                <h3 className="font-sans font-semibold text-base text-slate-800 flex items-center gap-2">
                  <Shield className="text-rose-500" size={18} />
                  <span>Bitácora de Errores de Clientes y Usuarios (En la Nube)</span>
                </h3>
                <p className="text-xs text-slate-400">Recopila y consolida todas las fallas que experimentan tus clientes y usuarios en vivo, para que puedas identificarlas y resolverlas de inmediato.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={fetchCloudErrors}
                  disabled={loadingCloudErrors}
                  className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RefreshCw size={12} className={loadingCloudErrors ? "animate-spin" : ""} />
                  <span>Actualizar</span>
                </button>
                {cloudErrors.some(e => !e.isResolved) && (
                  <button
                    type="button"
                    onClick={handleResolveAllErrors}
                    className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 border border-emerald-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <CheckCircle size={12} />
                    <span>Resolver Todos</span>
                  </button>
                )}
                {cloudErrors.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllErrors}
                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-150 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Trash2 size={12} />
                    <span>Vaciar Historial</span>
                  </button>
                )}
              </div>
            </div>

            {loadingCloudErrors ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2">
                <RefreshCw size={24} className="animate-spin text-indigo-500" />
                <p className="text-xs text-slate-400 font-medium">Cargando bitácora de la nube...</p>
              </div>
            ) : cloudErrors.length === 0 ? (
              <div className="p-6 border border-slate-150 rounded-xl bg-slate-50/50 text-center space-y-1.5">
                <CheckCircle className="text-emerald-500 mx-auto" size={24} />
                <div className="space-y-0.5">
                  <span className="font-bold text-xs text-slate-700 block">¡Sin Errores Registrados!</span>
                  <span className="text-[11px] text-slate-400 max-w-md mx-auto block leading-normal">
                    La base de datos no registra ninguna falla reportada por clientes o usuarios. Tu aplicación está operando al 100% de efectividad.
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {cloudErrors.map((log) => (
                  <div key={log.id} className={`border rounded-xl p-4 space-y-3 bg-slate-50/55 text-xs transition-all ${
                    log.isResolved ? "border-slate-200 opacity-60" : "border-rose-150 bg-rose-50/5"
                  }`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-150/70 pb-2">
                      <div className="flex flex-wrap items-center gap-1.5 font-sans">
                        <span className={`font-bold px-1.5 py-0.5 rounded border text-[10px] ${
                          log.isResolved 
                            ? "bg-slate-100 text-slate-500 border-slate-200"
                            : "bg-rose-50 text-rose-600 border-rose-100"
                        }`}>
                          Falla en: {log.action}
                        </span>
                        <span className="font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                          {log.userRole || "Cliente"}: {log.userEmail || "Anónimo"}
                        </span>
                        {log.code && <span className="font-mono text-slate-400 text-[10px]">Cód: {log.code}</span>}
                        {log.status && <span className="font-mono text-slate-400 text-[10px]">HTTP: {log.status}</span>}
                        {log.isResolved && (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                            <CheckCircle size={10} />
                            <span>Resuelto</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString("es-ES") : "Desconocido"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div>
                          <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider block">Detalle de la Falla:</span>
                          <p className="font-mono font-medium text-rose-950 bg-rose-50/40 p-2 rounded border border-rose-100 text-[10px] whitespace-pre-wrap max-h-24 overflow-y-auto">
                            {log.message}
                          </p>
                        </div>
                        {log.path && (
                          <div>
                            <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider block">Ruta / Pantalla:</span>
                            <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{log.path}</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        {log.deviceDetails && (
                          <div>
                            <span className="text-[10px] font-sans text-slate-400 font-bold uppercase tracking-wider block">Dispositivo del Cliente:</span>
                            <div className="text-[10px] text-slate-600 font-medium space-y-0.5 leading-tight font-mono bg-slate-100/60 p-2 rounded border border-slate-150">
                              <div>SO/Plataforma: {log.deviceDetails.platform || "Web"}</div>
                              <div className="truncate">Navegador: {log.deviceDetails.userAgent || "Desconocido"}</div>
                              {log.deviceDetails.screenSize && <div>Pantalla: {log.deviceDetails.screenSize}</div>}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 justify-end pt-2">
                          {!log.isResolved && (
                            <button
                              type="button"
                              onClick={() => handleResolveError(log.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer animate-slideUp"
                            >
                              <Check size={10} />
                              <span>Marcar como Resuelto</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Backend Cloud Diagnostics (Original) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs animate-fadeIn space-y-6">
            <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="font-sans font-semibold text-base text-slate-800 flex items-center gap-2">
                  <Database className="text-amber-500" size={18} />
                  <span>Estado e Integración con la Nube (Estático)</span>
                </h3>
                <p className="text-xs text-slate-400">Verifica la conexión con Google Cloud SQL (PostgreSQL) y Google Cloud Storage (Fotos/Videos) de dstores.app.</p>
              </div>
              <button
                onClick={fetchDiagnostics}
                disabled={loadingDiagnostics}
                className="self-start sm:self-auto px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw size={13} className={loadingDiagnostics ? "animate-spin" : ""} />
                <span>{loadingDiagnostics ? "Probando..." : "Re-probar Conexión Cloud"}</span>
              </button>
            </div>

            {loadingDiagnostics ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <RefreshCw size={32} className="animate-spin text-amber-500" />
                <p className="text-xs text-slate-500 font-medium animate-pulse">Ejecutando diagnóstico y pruebas de conexión de backend...</p>
              </div>
            ) : diagnostics ? (
              <div className="space-y-6">
                {/* 1. Database Connection Card */}
                <div className="border border-slate-200 rounded-2xl p-4 md:p-5">
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      diagnostics.database?.status === "success" 
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                        : "bg-rose-50 text-rose-600 border border-rose-100"
                    }`}>
                      <Database size={22} />
                    </div>
                    <div className="space-y-1.5 flex-1 select-text">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-slate-800 text-sm">Base de Datos Google Cloud Firestore (Serverless)</h4>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          diagnostics.database?.status === "success" 
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800 animate-pulse"
                        }`}>
                          {diagnostics.database?.status === "success" ? "Activo ✅" : "Error de Conexión ❌"}
                        </span>
                      </div>

                      {diagnostics.database?.status === "success" ? (
                        <p className="text-xs text-slate-500 leading-relaxed">
                          ¡Excelente! El servidor se ha conectado de forma automática y transparente a la base de datos de <strong>Google Cloud Firestore</strong> de manera serverless sin requerir configuración manual. Las modificaciones que realices serán duraderas y visibles en tiempo real para todos los clientes en cualquier dispositivo.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-rose-700 font-medium">
                            No se pudo conectar a la base de datos Google Cloud Firestore. Revisa que esté provisionado Firestore en tu proyecto de Firebase.
                          </p>
                          <div className="bg-slate-900 text-slate-200 p-3 rounded-lg text-[11px] font-mono whitespace-pre-wrap overflow-x-auto border border-slate-800 max-h-32">
                            <span className="text-rose-400">Detalle del Error devuelto por Firestore:</span>
                            {"\n"}{diagnostics.database?.error || "Fallo de conexión o tiempo de espera excedido (connection timeout)"}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Media Storage Card */}
                <div className="border border-slate-200 rounded-2xl p-4 md:p-5">
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      diagnostics.storage?.status === "success"
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                        : "bg-amber-50 text-amber-600 border border-amber-100"
                    }`}>
                      <HardDrive size={22} />
                    </div>
                    <div className="space-y-1.5 flex-1 select-text">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-slate-800 text-sm">Almacenamiento de Fotos y Videos de Catálogo</h4>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          diagnostics.storage?.status === "success"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {diagnostics.storage?.status === "success" ? "Persistencia Duradera GCS ✅" : "Almacenamiento Local Temporal ⚠️"}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 leading-relaxed">
                        Proveedor activo: <strong className="text-slate-700">{diagnostics.storage?.provider}</strong>
                      </p>

                      {diagnostics.storage?.status !== "success" ? (
                        <div className="space-y-2 mt-1">
                          <p className="text-xs text-amber-700 font-medium bg-amber-50/50 p-2.5 border border-amber-100 rounded-lg">
                            {diagnostics.storage?.warning}
                          </p>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            <span className="font-bold text-slate-700">¿Por qué pasa esto?</span> Google Cloud Run apaga y enciende contenedores de forma automatizada (por ejemplo, cuando no hay visitas para ahorrar costos). Al reiniciarse, el disco del contenedor se vacía por completo, causando que las imágenes y videos cargados desaparezcan y los enlaces dejen de funcionar. Para evitar esto, debes enlazar un Bucket de Google Cloud Storage.
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 leading-relaxed">
                          ¡Configurado correctamente! Los archivos multimedia cargados se guardan de forma permanente en el bucket de Google Cloud Storage <span className="font-mono bg-slate-100 text-slate-700 px-1 py-0.5 rounded text-[11px]">"{diagnostics.storage?.bucketName}"</span>.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Variables Ambientales de Cloud Run Simplificadas */}
                <div className="bg-slate-50 rounded-2xl p-4 md:p-5 border border-slate-150 space-y-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                      <Terminal size={15} className="text-slate-500" />
                      <span>Soporte Zero-Configuration con Firestore</span>
                    </h4>
                    <p className="text-xs text-slate-500">
                      ¡Grandes noticias! Gracias a la migración total a <strong>Google Cloud Firestore (Serverless)</strong>, la base de datos se comunica de forma nativa a través del contexto de seguridad de la nube de Google Cloud Console.
                    </p>
                  </div>

                  <div className="bg-emerald-50 text-emerald-900 border border-emerald-150 rounded-xl p-3.5 space-y-2">
                    <h5 className="font-bold text-xs">🎉 NO NECESITAS INGRESAR VARIABLES COMPLEJAS DE SQL:</h5>
                    <p className="text-[11px] leading-relaxed">
                      Las variables de entorno <code className="bg-emerald-100 px-1 text-emerald-950 font-mono rounded text-[10px]">SQL_HOST</code>, <code className="bg-emerald-100 px-1 text-emerald-950 font-mono rounded text-[10px]">SQL_USER</code>, <code className="bg-emerald-100 px-1 text-emerald-950 font-mono rounded text-[10px]">SQL_PASSWORD</code> y <code className="bg-emerald-100 px-1 text-emerald-950 font-mono rounded text-[10px]">SQL_DB_NAME</code> <strong>ya no son requeridas</strong> por tu sistema. Puedes eliminarlas o ignorarlas con total tranquilidad de tu panel de Cloud Run si lo deseas. ¡La base de datos Firestore funciona de forma 100% autogestionada, eliminando cualquier complicación de red o credenciales!
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2 mt-2">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-150 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-slate-800 font-semibold block">GCS_BUCKET_NAME</span>
                        <span className="text-[10px] text-slate-400">Bucket de almacenamiento de fotos (Única variable opcional sugerida para fotos persistentes si deseas usar GCS)</span>
                      </div>
                      <span>{diagnostics.env?.GCS_BUCKET_NAME_set ? "✅ Configurado" : "⚠️ Opcional / No Requerido"}</span>
                    </div>
                  </div>

                  {/* Paso a paso resumido */}
                  <div className="bg-amber-50/50 rounded-xl p-3.5 border border-amber-100 space-y-1">
                    <span className="font-bold text-amber-950 text-xs flex items-center gap-1">
                      <HelpCircle size={14} className="text-amber-600" />
                      <span>¿Cómo funciona el dominio dstores.app?</span>
                    </span>
                    <p className="text-[11px] text-amber-900/95 leading-relaxed">
                      Tu dominio y tu aplicación siguen respondiendo perfectamente en Google Cloud Run. La gran ventaja es que los productos y la configuración general se guardan instantáneamente en Firestore, haciendo el proceso infinitamente más fácil sin código ni bases de datos complicadas. No requieres configuraciones complejas para que funcione de forma óptima.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-rose-500">
                No se han cargado datos de diagnóstico. Por favor intenta presionar el botón de retest de arriba.
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "users" ? (
        /* USER MANAGEMENT DETAILED TAB PANEL */
        <div className="space-y-6 text-left">
          {isEditingUser ? (
            /* USER EDIT/CREATE VIEW */
            <form onSubmit={handleSubmitUserForm} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs animate-fadeIn space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
                <div>
                  <h3 className="font-sans font-semibold text-lg text-slate-800">
                    {editingUserId ? "Editar Colaborador" : "Crear Nuevo Colaborador"}
                  </h3>
                  <p className="text-xs text-slate-400">Define los accesos y privilegios del colaborador del catálogo.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingUser(false)}
                  className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-650 rounded-lg text-xs"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    value={userFormName}
                    onChange={(e) => setUserFormName(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 text-slate-800"
                    placeholder="Ej. Ana Vendedora"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nombre de Usuario o Correo *</label>
                  <input
                    type="text"
                    value={userFormUsername}
                    onChange={(e) => setUserFormUsername(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 text-slate-800"
                    placeholder="Ej. ana12 o ana@tienda.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Contraseña de Acceso *</label>
                  <input
                    type="text"
                    value={userFormPassword}
                    onChange={(e) => setUserFormPassword(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 font-mono text-slate-800"
                    placeholder="Introduce la contraseña"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Rol Asignado *</label>
                  <select
                    value={userFormRole}
                    onChange={(e) => setUserFormRole(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 text-slate-800 bg-white"
                  >
                    <option value="Vendedor">Vendedor (Sube productos y modifica catálogo, sin gestión de usuarios)</option>
                    <option value="Administrador">Administrador (Control total y gestión de usuarios)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Pregunta de Seguridad (Para recuperación de cuenta) *</label>
                  <select
                    value={userFormPregunta}
                    onChange={(e) => setUserFormPregunta(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 text-slate-800 bg-white"
                    required
                  >
                    <option value="">-- Selecciona una Pregunta --</option>
                    <option value="¿Cuál es el nombre de tu primera mascota?">¿Cuál es el nombre de tu primera mascota?</option>
                    <option value="¿En qué ciudad naciste?">¿En qué ciudad naciste?</option>
                    <option value="¿Cuál es el nombre de tu escuela primaria?">¿Cuál es el nombre de tu escuela primaria?</option>
                    <option value="¿Cuál es tu comida favorita?">¿Cuál es tu comida favorita?</option>
                    <option value="¿Cuál es el segundo nombre de tu madre?">¿Cuál es el segundo nombre de tu madre?</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Respuesta a la Pregunta *</label>
                  <input
                    type="text"
                    value={userFormRespuesta}
                    onChange={(e) => setUserFormRespuesta(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 text-slate-800"
                    placeholder="Escribe la respuesta secreta (No distingue mayúsculas)"
                    required
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">El usuario podrá responder esta pregunta para auto-restablecer su contraseña si la olvida.</span>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100 gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditingUser(false)}
                  className="px-4 py-2 border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <Save size={13} />
                  <span>{loading ? "Guardando..." : "Guardar Colaborador"}</span>
                </button>
              </div>
            </form>
          ) : (
            /* USERS MASTER TABLE VIEW */
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs animate-fadeIn space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-sans font-semibold text-lg text-slate-800">Cuentas de Usuarios y Colaboradores</h3>
                  <p className="text-xs text-slate-400">Asigna roles o cambia contraseñas de las personas autorizadas para utilizar el panel.</p>
                </div>
                <button
                  onClick={handleOpenNewUserForm}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 shadow-sm shadow-amber-500/10 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus size={14} />
                  <span>Nuevo Usuario</span>
                </button>
              </div>

              {loadingUsers ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <RefreshCw size={24} className="animate-spin text-amber-500" />
                  <p className="text-xs text-slate-500">Cargando usuarios autorizados...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-150 bg-slate-50/70">
                        <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nombre</th>
                        <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Usuario / Email</th>
                        <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rol de Acceso</th>
                        <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contraseña</th>
                        <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 text-xs font-semibold text-slate-800">{u.name}</td>
                          <td className="p-3 text-xs font-mono text-slate-500">{u.username}</td>
                          <td className="p-3 text-xs">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              u.role === "Administrador" 
                                ? "bg-amber-100 text-amber-800" 
                                : "bg-blue-100 text-blue-800"
                            }`}>
                              {u.role || "Vendedor"}
                            </span>
                          </td>
                          <td className="p-3 text-xs font-mono text-slate-500 select-all">{u.password}</td>
                          <td className="p-3 text-xs text-right space-x-1">
                            <button
                              onClick={() => handleOpenEditUserForm(u)}
                              className="p-1.5 text-slate-500 hover:text-slate-800 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg inline-flex items-center gap-1 transition-colors"
                              title="Editar Usuario"
                            >
                              <Edit2 size={12} />
                              <span className="text-[10px] font-medium hidden sm:inline">Editar</span>
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id, u.name)}
                              disabled={u.id === currentUser?.uid}
                              className={`p-1.5 border hover:bg-rose-50 rounded-lg inline-flex items-center gap-1 transition-colors ${
                                u.id === currentUser?.uid 
                                  ? "text-slate-300 border-slate-100 cursor-not-allowed" 
                                  : "text-rose-500 hover:text-rose-700 border-rose-150"
                              }`}
                              title={u.id === currentUser?.uid ? "No puedes eliminarte a ti mismo" : "Eliminar Usuario"}
                            >
                              <Trash2 size={12} />
                              <span className="text-[10px] font-medium hidden sm:inline">Eliminar</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-xs text-slate-400">
                            No se encontraron colaboradores registrados en Firestore.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
