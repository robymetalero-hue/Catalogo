/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Product, StoreConfig, AdminUser } from "./types";
import { db, auth } from "./firebase";
import { 
  signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword
} from "firebase/auth";
import { 
  collection, getDocs, doc, getDoc, updateDoc, query, orderBy, setDoc 
} from "firebase/firestore";
import { 
  Lock, LogOut, CheckCircle2, ShoppingBag, Grid, Compass, Smartphone, AlertCircle, X, ShieldAlert, Share2, Sparkles
} from "lucide-react";
import StoreHeader from "./components/StoreHeader";
import StoreFooter from "./components/StoreFooter";
import ProductCard from "./components/ProductCard";
import ProductDetailsModal from "./components/ProductDetailsModal";
import AdminPanel from "./components/AdminPanel";
import ShareCatalogModal from "./components/ShareCatalogModal";
import StoreLocationSection from "./components/StoreLocationSection";
import { CatalogSkeleton } from "./components/ProductSkeleton";
import { motion, AnimatePresence } from "motion/react";

const INITIAL_STORE_CONFIG: StoreConfig = {
  storeName: "Mi Catálogo de WhatsApp",
  address: "Av. Principal 123, Frente al Parque Comercial, La Paz",
  phone: "591 76543210",
  whatsappNumber: "59176543210",
  whatsappCustomMessage: "¡Hola! Vi el artículo: {productName} (SKU: {productSku}) en tu catálogo virtual y me gustaría reservarlo.",
  locationUrl: "https://maps.google.com/?q=-16.500000,-68.150000",
  showPrices: true
};

export default function App() {
  // Global states
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem("local_products_cache");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  });
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(() => {
    try {
      const saved = localStorage.getItem("local_store_config_cache");
      if (saved) {
        return JSON.parse(saved) as StoreConfig;
      }
    } catch (e) {}
    return INITIAL_STORE_CONFIG;
  });
  const [categories, setCategories] = useState<string[]>(() => {
    const initialProducts = (() => {
      try {
        const saved = localStorage.getItem("local_products_cache");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
      return [];
    })();
    const cats = Array.from(new Set(initialProducts.map((item) => item.category).filter(Boolean)));
    return ["Todos", ...cats];
  });
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [activeViewTab, setActiveViewTab] = useState<"catalog" | "location">("catalog");

  // Authentication & Admin states
  const [user, setUser] = useState<AdminUser | null>(() => {
    try {
      const saved = localStorage.getItem("admin_session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && parsed.uid) {
          return parsed as AdminUser;
        }
      }
    } catch (e) {
      console.warn("Could not load saved session:", e);
    }
    return null;
  });
  const [showAdminPanel, setShowAdminPanel] = useState(() => {
    try {
      const saved = localStorage.getItem("admin_session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && parsed.uid) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadingApp, setLoadingApp] = useState(false);
  const [isUsingCache, setIsUsingCache] = useState(false);

  // Safety fallback for hidden location tab
  useEffect(() => {
    if (storeConfig.showLocation === false && !user && activeViewTab === "location") {
      setActiveViewTab("catalog");
    }
  }, [storeConfig.showLocation, user, activeViewTab]);

  // Modal Login form states
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [localLoginError, setLocalLoginError] = useState<string | null>(null);

  // Fetch functions setting Google Cloud Firestore as the only primary source of truth
  const fetchProducts = async () => {
    try {
      // 1. Intentar primero consultar directamente Firebase Firestore (Cliente) - Rápido, resiliente y 100% confiable
      const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const data: any[] = [];
      querySnapshot.forEach((docSnap) => {
        data.push({ id: docSnap.id, ...docSnap.data() });
      });

      if (data && data.length > 0) {
        const processedProducts: Product[] = data.map((item: any) => ({
          id: item.id,
          sku: item.sku || "",
          name: item.name || "Sin nombre",
          description: item.description || "",
          category: item.category || "General",
          retailPrice: Number(item.retailPrice) || 0,
          wholesalePrice: Number(item.wholesalePrice) || 0,
          images: Array.isArray(item.images) ? item.images : [],
          videoUrl: item.videoUrl || "",
          isAvailable: item.isAvailable ?? true,
          views: Number(item.views) || 0,
          whatsappClicks: Number(item.whatsappClicks) || 0,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
        }));

        setIsUsingCache(false);
        setProducts(processedProducts);
        localStorage.setItem("local_products_cache", JSON.stringify(processedProducts));
        const cats = Array.from(new Set(processedProducts.map((item: Product) => item.category).filter(Boolean)));
        setCategories(["Todos", ...cats as string[]]);
        return;
      }
    } catch (fsErr) {
      console.warn("[Firebase Client] No se pudo conectar a Firestore de forma directa. Intentando proxy API:", fsErr);
    }

    try {
      // 2. Fallback Secundario: API del servidor Backend con base de datos en nube o caché
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      
      const processedProducts: Product[] = data.map((item: any) => ({
        id: item.id,
        sku: item.sku || "",
        name: item.name || "Sin nombre",
        description: item.description || "",
        category: item.category || "General",
        retailPrice: Number(item.retailPrice) || 0,
        wholesalePrice: Number(item.wholesalePrice) || 0,
        images: Array.isArray(item.images) ? item.images : [],
        videoUrl: item.videoUrl || "",
        isAvailable: item.isAvailable ?? true,
        views: Number(item.views) || 0,
        whatsappClicks: Number(item.whatsappClicks) || 0,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
      }));

      setIsUsingCache(false);
      setProducts(processedProducts);
      localStorage.setItem("local_products_cache", JSON.stringify(processedProducts));
      const cats = Array.from(new Set(processedProducts.map((item: Product) => item.category).filter(Boolean)));
      setCategories(["Todos", ...cats as string[]]);
      return;
    } catch (e) {
      console.warn("No se pudo conectar al endpoint API de productos, intentando Caché local:", e);
    }

    // 3. Fallback Terciario: Caché estática del sistema de almacenamiento del navegador
    loadProductsStatically();
  };

  const fetchStoreConfig = async () => {
    try {
      // 1. Intentar primero directo de Firestore (Cliente)
      const docRef = doc(db, "storeConfig", "default");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const configData: StoreConfig = {
          storeName: data.storeName || "Mi Catálogo de WhatsApp",
          address: data.address || "",
          phone: data.phone || "",
          whatsappNumber: data.whatsappNumber || "",
          whatsappCustomMessage: data.whatsappCustomMessage || "",
          locationUrl: data.locationUrl || "",
          showPrices: data.showPrices ?? true,
          storeImages: Array.isArray(data.storeImages) ? data.storeImages : [],
          updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
        };
        setStoreConfig(configData);
        localStorage.setItem("local_store_config_cache", JSON.stringify(configData));
        return;
      }
    } catch (fsErr) {
      console.warn("[Firebase Client] No se pudo leer storeConfig de Firestore directamente. Intentando proxy API:", fsErr);
    }

    try {
      // 2. Fallback Secundario: API de servidor Backend
      const res = await fetch("/api/store-config");
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      
      const configData: StoreConfig = {
        storeName: data.storeName || "Mi Catálogo de WhatsApp",
        address: data.address || "",
        phone: data.phone || "",
        whatsappNumber: data.whatsappNumber || "",
        whatsappCustomMessage: data.whatsappCustomMessage || "",
        locationUrl: data.locationUrl || "",
        showPrices: data.showPrices ?? true,
        storeImages: Array.isArray(data.storeImages) ? data.storeImages : [],
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
      };
      setStoreConfig(configData);
      localStorage.setItem("local_store_config_cache", JSON.stringify(configData));
      return;
    } catch (e) {
      console.warn("Error leyendo store-config desde el backend API:", e);
    }

    // 3. Fallback Terciario: Caché local persistente del navegador
    try {
      const saved = localStorage.getItem("local_store_config_cache");
      if (saved) {
        setStoreConfig(JSON.parse(saved));
      }
    } catch (err) {}
  };

  const refreshAll = async () => {
    setLoadingApp(true);
    await Promise.all([fetchProducts(), fetchStoreConfig()]);
    setLoadingApp(false);
  };

  // Initial load of products and configuration from Google Cloud SQL (PostgreSQL)
  useEffect(() => {
    refreshAll();
  }, []);

  // Synchronize local cached products automatically in background when admin mounts the app
  useEffect(() => {
    const autoSyncCachedProducts = async () => {
      if (showAdminPanel && isUsingCache && products.length > 0) {
        console.log("Detectados productos en cache local de administrador. Iniciando auto-sincronización con PostgreSQL en segundo plano...");
        try {
          const res = await fetch("/api/products/seed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(products),
          });
          if (res.ok) {
            console.log("¡Sincronización automática en segundo plano exitosa! Actualizando productos...");
            const seedData = await res.json();
            if (seedData && seedData.length > 0) {
              setProducts(seedData);
              setIsUsingCache(false);
              localStorage.setItem("local_products_cache", JSON.stringify(seedData));
              const cats = Array.from(new Set(seedData.map((item: Product) => item.category).filter(Boolean)));
              setCategories(["Todos", ...cats]);
            }
          }
        } catch (e) {
          console.warn("No se pudo completar la auto-sincronización en segundo plano con Cloud SQL:", e);
        }
      }
    };
    autoSyncCachedProducts();
  }, [showAdminPanel, isUsingCache, products.length]);

  // Dynamically update browser tab title based on store configuration
  useEffect(() => {
    if (storeConfig && storeConfig.storeName) {
      document.title = storeConfig.storeName;
    } else {
      document.title = "Catálogo de Productos";
    }
  }, [storeConfig?.storeName]);

  // Sync user logging state
  useEffect(() => {
    try {
      const saved = localStorage.getItem("admin_session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && parsed.uid) {
          setUser(parsed);
          setShowAdminPanel(true);
        }
      }
    } catch (e) {
      console.warn("Error cargando sesión persistente:", e);
    }
  }, []);

  // Helper: Static loading if listener fails due to offline/permission
  const loadProductsStatically = async () => {
    try {
      const saved = localStorage.getItem("local_products_cache");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProducts(parsed);
          setIsUsingCache(true);
          const cats = Array.from(new Set(parsed.map((item) => item.category).filter(Boolean)));
          setCategories(["Todos", ...cats]);
          setLoadingApp(false);
          return;
        }
      }
    } catch (e) {
      console.warn("Could not load products from local cache:", e);
    }

    setProducts([]);
    setIsUsingCache(false);
    setCategories(["Todos"]);
    setLoadingApp(false);
  };

  // Dynamic metrics tracking
  const handleSelectProduct = async (product: Product) => {
    setSelectedProduct(product);
    const newViews = (product.views || 0) + 1;
    
    // Increment view count locally first (instant UI update)
    const updated = products.map(p => p.id === product.id ? { ...p, views: newViews } : p);
    setProducts(updated);
    try {
      localStorage.setItem("local_products_cache", JSON.stringify(updated));
    } catch (e) {}

    // Track on Firestore directly first (allowed by rules for open view/click updates)
    try {
      await updateDoc(doc(db, "products", product.id), { views: newViews });
    } catch (fsErr) {
      console.warn("[Firebase Client] No se pudo guardar métrica de vista directamente en Firestore:", fsErr);
    }

    // Failback/Sync with REST API Server
    try {
      await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ views: newViews }),
      });
    } catch (err) {
      console.warn("Could not track view metrics in backend API.", err);
    }
  };

  const handleWhatsAppInquiry = async (product: Product) => {
    const newClicks = (product.whatsappClicks || 0) + 1;
    
    // Increment click count locally first (instant UI update)
    const updated = products.map(p => p.id === product.id ? { ...p, whatsappClicks: newClicks } : p);
    setProducts(updated);
    try {
      localStorage.setItem("local_products_cache", JSON.stringify(updated));
    } catch (e) {}

    // Track on Firestore directly first (allowed by rules)
    try {
      await updateDoc(doc(db, "products", product.id), { whatsappClicks: newClicks });
    } catch (fsErr) {
      console.warn("[Firebase Client] No se pudo guardar métrica de clic directamente en Firestore:", fsErr);
    }

    // Failback/Sync with REST API Server
    try {
      await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ whatsappClicks: newClicks }),
      });
    } catch (err) {
      console.warn("Could not track WhatsApp click in backend API.", err);
    }
  };

  const handleShareCatalog = async () => {
    setIsShareOpen(true);
  };

  const handleAdminLogin = async () => {
    const provider = new GoogleAuthProvider();
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, provider);
      const email = result.user.email;
      if (email !== "robymetalero@gmail.com") {
        setAuthError(`Acceso Restringido: El email '${email}' no figura como administrador oficial del catálogo.`);
      } else {
        setShowLoginModal(false);
        setShareToast("¡Sesión iniciada con Google!");
        setTimeout(() => setShareToast(null), 3000);
      }
    } catch (error) {
      setAuthError("Error de autenticación Google: " + (error as Error).message);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalLoginError(null);
    const cleanEmail = loginEmail.trim().toLowerCase();
    const cleanPassword = loginPassword.trim();

    if (!cleanEmail || !cleanPassword) {
      setLocalLoginError("Por favor ingresa usuario y contraseña.");
      return;
    }

    setLoadingApp(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: cleanEmail, password: cleanPassword })
      });

      if (!response.ok) {
        const errData = await response.json();
        setLocalLoginError(errData.error || "Usuario o contraseña incorrectos.");
        setLoadingApp(false);
        return;
      }

      const loggedUser: AdminUser = await response.json();

      setUser(loggedUser);
      localStorage.setItem("admin_session", JSON.stringify(loggedUser));
      setShowAdminPanel(true);
      setShowLoginModal(false);
      setLoginPassword("");
      
      setShareToast(`¡Sesión iniciada con éxito! Bienvenido, ${loggedUser.displayName}.`);
      setTimeout(() => setShareToast(null), 4000);
    } catch (err: any) {
      console.error("General login process error:", err);
      setLocalLoginError("Fallo al iniciar sesión en el servidor: " + err.message);
    } finally {
      setLoadingApp(false);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem("admin_session");
      await signOut(auth);
      setUser(null);
      setShowAdminPanel(false);
      setAuthError(null);
    } catch (error) {
      console.error(error);
      setUser(null);
      setShowAdminPanel(false);
      localStorage.removeItem("admin_session");
    }
  };

  const handleOpenGoogleMaps = () => {
    setActiveViewTab("location");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Filter products by search bar input and category selections
  const filteredProducts = products.filter((prod) => {
    // Hide out-of-stock items if config says so and the active visitor is not an administrative user
    const isPublicFilteredOut = storeConfig.hideOutOfStock && !user && !prod.isAvailable;
    if (isPublicFilteredOut) return false;

    const matchesCategory = selectedCategory === "Todos" || prod.category === selectedCategory;
    const cleanSearch = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      !cleanSearch ||
      prod.name.toLowerCase().includes(cleanSearch) ||
      prod.sku.toLowerCase().includes(cleanSearch) ||
      prod.category.toLowerCase().includes(cleanSearch) ||
      (prod.description && prod.description.toLowerCase().includes(cleanSearch));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased selection:bg-amber-100 selection:text-amber-900">
      
      {/* Top micro administrative action bar */}
      <div className="w-full bg-slate-900 py-1.5 px-4 sm:px-6 lg:px-8 text-white flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5 grayscale-20 opacity-80 font-medium">
          <ShoppingBag size={13} className="text-amber-500 animate-pulse" />
          <span>Ingreso para administración de tu tienda</span>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-2.5">
              <span className="opacity-80">
                Hola, <strong className="font-semibold text-amber-500">{user.displayName || user.email}</strong>
                {user.isAdmin && " (Admin)"}
              </span>
              
              {user.isAdmin && (
                <button
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className={`px-2.5 py-1 rounded-sm uppercase tracking-wider font-bold style-xs transition-colors ${
                    showAdminPanel 
                      ? "bg-amber-500 hover:bg-amber-600 text-slate-950" 
                      : "bg-slate-700 hover:bg-slate-650 text-white"
                  }`}
                >
                  {showAdminPanel ? "Ver Catálogo" : "Ver Panel Admin"}
                </button>
              )}

              <button onClick={handleLogout} className="opacity-70 hover:opacity-100 flex items-center gap-1">
                <LogOut size={12} />
                <span>Salir</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setAuthError(null);
                setLocalLoginError(null);
                setShowLoginModal(true);
              }}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-750 px-2.5 py-1 rounded-md text-amber-500 font-semibold transition-all hover:scale-102 cursor-pointer"
            >
              <Lock size={11} />
              <span>Ingresar como Admin</span>
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Promo Banner Ribbon */}
      {storeConfig.promoBannerText && storeConfig.promoBannerText.trim() && (
        <div className="w-full bg-amber-500 text-slate-950 font-extrabold uppercase tracking-widest text-[9px] py-1 text-center select-none shadow-sm flex items-center justify-center gap-1.5 overflow-hidden animate-pulse">
          <Sparkles size={11} className="text-slate-950" />
          <span>{storeConfig.promoBannerText}</span>
          <Sparkles size={11} className="text-slate-950" />
        </div>
      )}

      {/* Access alert warnings */}
      {authError && (
        <div className="bg-rose-950 border-b border-rose-900 text-rose-200 px-4 py-2.5 text-xs text-center flex items-center justify-center gap-2 relative">
          <AlertCircle size={14} className="shrink-0" />
          <span>{authError} Sigue navegando de forma pasiva por los productos de la tienda.</span>
          <button onClick={() => setAuthError(null)} className="absolute right-4 hover:opacity-80">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Dynamic Main Body render */}
      {loadingApp ? (
        <CatalogSkeleton />
      ) : showAdminPanel && user?.isAdmin ? (
        
        /* ADMIN PANEL INTERFACE VIEW */
        <div className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => setShowAdminPanel(false)}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-3xs transition-transform hover:-translate-x-0.5"
            >
              <span>← Volver al Catálogo Público</span>
            </button>

            <div className="bg-slate-100 px-3 py-1.5 rounded-lg border flex items-center gap-1.5 text-slate-600 text-xs font-semibold">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span>Estás autenticado como Editor Principal</span>
            </div>
          </div>

          {isUsingCache && (
            <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-950 px-4 py-3 rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-3xs">
              <div className="flex items-start sm:items-center gap-2">
                <AlertCircle className="text-amber-500 shrink-0 mt-0.5 sm:mt-0" size={18} />
                <div>
                  <span className="font-bold">⚠️ Tus artículos actuales provienen de la memoria caché local de este navegador.</span>
                  <p className="opacity-90 mt-0.5">Tus clientes no podrán verlos desde sus dispositivos hasta que los sincronices con la base de datos de la nube. Por favor utiliza el botón "Sincronizar con la Nube" que está en el panel azul de abajo.</p>
                </div>
              </div>
            </div>
          )}

          <AdminPanel
            products={products}
            storeConfig={storeConfig}
            setProducts={setProducts}
            setStoreConfig={setStoreConfig}
            onRefreshProducts={refreshAll}
            onRefreshConfig={refreshAll}
            currentUser={user}
          />
        </div>
      ) : (
        
        /* PUBLIC CATALOGUE INTERFACE VIEW */
        <>
          <StoreHeader
            storeConfig={storeConfig}
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onOpenLocation={handleOpenGoogleMaps}
            onOpenShare={() => setIsShareOpen(true)}
          />

          <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn font-sans">
            
            {/* View Tab Switcher */}
            <div className="flex border-b border-slate-200 mb-8 w-full font-bold text-xs uppercase tracking-wider select-none">
              <button
                onClick={() => setActiveViewTab("catalog")}
                className={`pb-3 px-5 transition-all border-b-2 relative -mb-[2px] ${
                  activeViewTab === "catalog"
                    ? "text-amber-600 border-amber-500 font-extrabold"
                    : "text-slate-400 border-transparent hover:text-slate-700"
                }`}
              >
                🛍️ Catálogo de Productos
              </button>
              {(storeConfig.showLocation !== false || (user && user.isAdmin)) && (
                <button
                  onClick={() => setActiveViewTab("location")}
                  className={`pb-3 px-5 transition-all border-b-2 relative -mb-[2px] ${
                    activeViewTab === "location"
                      ? "text-amber-600 border-amber-500 font-extrabold"
                      : "text-slate-400 border-transparent hover:text-slate-700"
                  }`}
                >
                  📍 Ubicación y Fotos
                </button>
              )}
            </div>

            {activeViewTab === "catalog" ? (
              <>
                {/* Catalog Banner */}
                <div id="catalog-hero" className="group w-full bg-slate-900 rounded-3xl overflow-hidden relative mb-8 aspect-21/9 md:aspect-32/10 shadow-lg shadow-slate-900/5">
                  <img
                    src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1200&auto=format&fit=crop"
                    alt="Banner principal"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover opacity-45 mix-blend-overlay filter saturate-75 transition-transform duration-1000 ease-out group-hover:scale-105"
                  />
                  
                  {/* Share Floating Button with Slow Glow Ring */}
                  <div className="absolute top-4 right-4 md:top-6 md:right-6 z-10">
                    {/* Slow Glow Ring Backdrop */}
                    <motion.div
                      animate={{
                        scale: [1, 1.15, 1],
                        opacity: [0.4, 0.75, 0.4],
                        boxShadow: [
                          "0 0 10px 2px rgba(16, 185, 129, 0.2)",
                          "0 0 20px 8px rgba(16, 185, 129, 0.5)",
                          "0 0 10px 2px rgba(16, 185, 129, 0.2)"
                        ]
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                      className="absolute inset-0 bg-emerald-500/25 rounded-xl blur-xs pointer-events-none"
                    />
                    
                    <motion.button
                      onClick={handleShareCatalog}
                      whileHover={{ scale: 1.05, backgroundColor: "#065f46" }}
                      whileTap={{ scale: 0.88, rotate: -1.5 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                      className="relative flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-emerald-600 text-white font-bold text-[10px] md:text-xs uppercase tracking-wider rounded-xl shadow-md border border-emerald-500/20 backdrop-blur-xs transition-colors cursor-pointer"
                      title="Compartir enlace de catálogo comercial"
                    >
                      <Share2 size={13} className="animate-pulse" />
                      <span>Compartir Catálogo</span>
                    </motion.button>
                  </div>

                  <div className="absolute inset-0 p-6 md:p-8 flex flex-col justify-end text-white">
                    <span className="text-[10px] md:text-xs font-bold text-amber-500 uppercase tracking-widest mb-1 select-none">Catálogo Temporada Invierno 2026</span>
                    <h2 className="text-xl md:text-3xl font-bold font-sans tracking-tight max-w-2xl uppercase">
                      {storeConfig.storeName || "Mi Tienda Virtual"}
                    </h2>
                    <p className="text-xs md:text-sm text-slate-300 font-medium max-w-md line-clamp-2 mt-1.5">
                      Filtra tus productos favoritos, copia las especificaciones, revisa los videos instructivos y ordénalo directo por WhatsApp en simples clicks.
                    </p>
                  </div>
                </div>

                {/* Title / Grid Category Heading */}
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Grid size={16} className="text-slate-400" />
                    <h3 className="font-sans font-bold text-slate-900 uppercase text-xs tracking-wider">
                      Listando: {selectedCategory} ({filteredProducts.length})
                    </h3>
                  </div>
                </div>

                {/* Products Grid */}
                {filteredProducts.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="py-20 text-center bg-white rounded-3xl border border-slate-200 shadow-3xs text-slate-400 flex flex-col items-center justify-center"
                  >
                    <ShoppingBag size={48} className="text-slate-200 mb-2.5 animate-pulse" />
                    <span className="text-sm font-semibold">No se encontraron artículos para tu filtro.</span>
                    <span className="text-xs opacity-70 mt-1">Prueba cambiando tu búsqueda o seleccionando otra categoría.</span>
                  </motion.div>
                ) : (
                  <motion.div 
                    layout
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                  >
                    <AnimatePresence mode="popLayout">
                      {filteredProducts.map((prod) => (
                        <ProductCard
                          key={prod.id}
                          product={prod}
                          showPrices={storeConfig.showPrices}
                          whatsappNumber={storeConfig.whatsappNumber}
                          whatsappCustomMessage={storeConfig.whatsappCustomMessage}
                          onOpenDetails={handleSelectProduct}
                          onWhatsAppInquiry={handleWhatsAppInquiry}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* Ambient Shop Sneak Peek / Showroom Section at Bottom */}
                {(() => {
                  const verifiedStoreImages = (storeConfig.storeImages || []).filter(img => img && img.trim() !== "");
                  return verifiedStoreImages.length > 0 && (
                    <div className="mt-20 border-t border-slate-200/60 pt-10 space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h4 className="font-sans font-extrabold text-slate-900 text-sm uppercase tracking-tight">📸 Conoce Nuestra Sucursal Física</h4>
                          <p className="text-slate-500 text-[11px] font-medium">Te invitamos a visitarnos en nuestro showroom físico para ver el inventario completo.</p>
                        </div>
                        <button
                          onClick={() => {
                            setActiveViewTab("location");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="text-[10px] font-bold uppercase tracking-wider text-amber-600 hover:text-amber-700 underline self-start sm:self-auto cursor-pointer"
                        >
                          Ver dirección completa y mapa &rarr;
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {verifiedStoreImages.slice(0, 4).map((img, idx) => (
                          <motion.div
                            key={idx}
                            whileHover={{ scale: 1.02 }}
                            onClick={() => {
                              setActiveViewTab("location");
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="aspect-16/10 rounded-2xl overflow-hidden border border-slate-200 cursor-pointer bg-slate-100 shadow-3xs"
                          >
                            <img src={img} alt={`Sucursal Sneak Peek ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <StoreLocationSection storeConfig={storeConfig} />
            )}
          </main>

          <StoreFooter
            storeConfig={storeConfig}
            onOpenLocation={handleOpenGoogleMaps}
          />
        </>
      )}

      {/* POPUP DETAIL MODAL */}
      <AnimatePresence>
        {selectedProduct && (
          <ProductDetailsModal
            product={selectedProduct}
            showPrices={storeConfig.showPrices}
            whatsappNumber={storeConfig.whatsappNumber}
            whatsappCustomMessage={storeConfig.whatsappCustomMessage}
            onClose={() => setSelectedProduct(null)}
            onWhatsAppInquiry={handleWhatsAppInquiry}
          />
        )}
      </AnimatePresence>

      {/* GLOBAL TOAST NOTICE FEEDBACK */}
      <AnimatePresence>
        {shareToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-800 text-white font-semibold text-xs py-3.5 px-6 rounded-2xl shadow-xl flex items-center gap-2.5 backdrop-blur-md"
          >
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span>{shareToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ADMIN SECURE LOGIN MODAL */}
      <AnimatePresence>
        {showLoginModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs"
          >
            {/* Backdrop click dismiss handler card */}
            <div
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-0"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10"
            >
              {/* Header */}
              <div className="bg-slate-900 p-6 text-white relative">
                <button
                  onClick={() => setShowLoginModal(false)}
                  className="absolute right-4 top-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
                <div className="flex items-center gap-2 mb-1.5 text-amber-500">
                  <Lock size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Panel de Control</span>
                </div>
                <h3 className="text-xl font-bold font-sans">Acceso de Administrador</h3>
                <p className="text-slate-400 text-xs mt-1">
                  Inicia sesión para gestionar el stock, precios y parámetros de tu tienda virtual.
                </p>
              </div>

              {/* Login Options / Form */}
              <div className="p-6 space-y-6">
                
                {/* Method 1: Password Form */}
                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <div className="border-b border-slate-100 pb-3 mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Método 1: Contraseña de Acceso</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">La opción oficial ideal y confiable para su propio dominio.</span>
                  </div>

                  {localLoginError && (
                    <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs font-medium flex items-start gap-2">
                      <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                      <span>{localLoginError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Usuario o Correo</label>
                    <input
                      type="text"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="Ej. admin o tu correo"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500 font-medium text-slate-800"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Contraseña</label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Introduce tu contraseña"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500 font-medium text-slate-805"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all hover:shadow-lg hover:shadow-amber-500/20 active:scale-98 cursor-pointer"
                  >
                    Ingresar al Sistema
                  </button>
                </form>

                {/* Divider */}
                <div className="relative flex items-center justify-center my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <span className="relative px-3 bg-white text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Ó</span>
                </div>

                {/* Method 2: Google Sign-in */}
                <div className="space-y-3">
                  <div className="pb-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Método 2: Google Sign-In</span>
                    <p className="text-[10px] text-slate-500 leading-normal mt-0.5">
                      Requiere que configure la whitelist de dominios autorizados en su panel de Firebase Console para <span className="font-mono text-slate-700 bg-slate-100 px-1 rounded">dstores.app</span>.
                    </p>
                  </div>

                  {authError && (
                    <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs font-medium flex items-start gap-2">
                      <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                      <span>{authError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleAdminLogin}
                    className="w-full py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-750 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <svg className="w-4 h-4 shadow-3xs" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                    </svg>
                    <span>Autenticar con cuenta Google</span>
                  </button>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ShareCatalogModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        storeName={storeConfig.storeName || ""}
      />
    </div>
  );
}
