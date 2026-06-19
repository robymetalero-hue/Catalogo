/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Product, StoreConfig, AdminUser } from "./types";
import { db, auth, OperationType, handleFirestoreError } from "./firebase";
import { 
  collection, query, getDocs, onSnapshot, doc, setDoc, orderBy, updateDoc, increment 
} from "firebase/firestore";
import { 
  signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged 
} from "firebase/auth";
import { 
  Lock, LogOut, CheckCircle2, ShoppingBag, Grid, Compass, Smartphone, AlertCircle, X, ShieldAlert, Share2 
} from "lucide-react";
import StoreHeader from "./components/StoreHeader";
import StoreFooter from "./components/StoreFooter";
import ProductCard from "./components/ProductCard";
import ProductDetailsModal from "./components/ProductDetailsModal";
import AdminPanel from "./components/AdminPanel";
import { motion, AnimatePresence } from "motion/react";

// Mock starter products for seeding the first time
const DEMO_PRODUCTS: Product[] = [
  {
    id: "sample_sneakers",
    sku: "CAL-ZAP-101",
    name: "Zapatillas Deportivas Neon Max",
    description: "Zapatillas cómodas ideales para runing, con suela amortiguadora de espuma eva, malla transpirable, refuerzos sintéticos contra el desgaste y cordones elásticos. Disponibles de la talla 38 a la 44.",
    category: "Calzado",
    retailPrice: 45,
    wholesalePrice: 35,
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?q=80&w=600&auto=format&fit=crop"
    ],
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Classic placeholder
    isAvailable: true
  },
  {
    id: "sample_jacket",
    sku: "ROP-ELT-202",
    name: "Chaqueta Cortavientos Impermeable",
    description: "Chaqueta rompevientos ultraligera de alta tecnología con recubrimiento hidrofóbico dwr. Capucha integrada ajustable, bolsillos laterales con cremallera termosellada y detalles reflectantes para caminatas nocturnas.",
    category: "Ropa",
    retailPrice: 80,
    wholesalePrice: 62,
    images: [
      "https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=600&auto=format&fit=crop"
    ],
    videoUrl: "",
    isAvailable: true
  },
  {
    id: "sample_watch",
    sku: "ACC-REL-303",
    name: "Reloj Inteligente Solar Midnight",
    description: "Reloj deportivo inteligente con pantalla amoled de 1.4 pulgadas, sensor de ritmo cardíaco continuo, rastreo gps integrado, resistencia al agua hasta 50 metros de profundidad y batería de larga duración asistida por panel solar.",
    category: "Accesorios",
    retailPrice: 150,
    wholesalePrice: 125,
    images: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=600&auto=format&fit=crop"
    ],
    videoUrl: "",
    isAvailable: false
  }
];

const INITIAL_STORE_CONFIG: StoreConfig = {
  storeName: "TIENDA DEMO",
  address: "Av. Principal 123, Frente al Parque Comercial, La Paz",
  phone: "591 76543210",
  whatsappNumber: "59176543210",
  whatsappCustomMessage: "¡Hola! Vi el artículo: {productName} (SKU: {productSku}) en tu catálogo virtual y me gustaría reservarlo.",
  locationUrl: "https://maps.google.com/?q=-16.500000,-68.150000",
  showPrices: true
};

export default function App() {
  // Global states
  const [products, setProducts] = useState<Product[]>([]);
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(INITIAL_STORE_CONFIG);
  const [categories, setCategories] = useState<string[]>(["Todos"]);
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

  // Authentication & Admin states
  const [user, setUser] = useState<AdminUser | null>(() => {
    try {
      const saved = localStorage.getItem("admin_session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && parsed.email === "robymetalero@gmail.com") {
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
        if (parsed && typeof parsed === "object" && parsed.email === "robymetalero@gmail.com") {
          return true;
        }
      }
    } catch (e) {}
    return false;
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadingApp, setLoadingApp] = useState(true);

  // Modal Login form states
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("robymetalero@gmail.com");
  const [loginPassword, setLoginPassword] = useState("");
  const [localLoginError, setLocalLoginError] = useState<string | null>(null);

  // Load configuration and listen to Products collection on start
  useEffect(() => {
    let unsubscribeProducts = () => {};
    let unsubscribeConfig = () => {};

    const loadData = async () => {
      try {
        // 1. Listen to store Config document
        const configDocRef = doc(db, "storeConfig", "default");
        unsubscribeConfig = onSnapshot(configDocRef, (snapshot) => {
          if (snapshot.exists()) {
            setStoreConfig(snapshot.data() as StoreConfig);
          } else {
            // Seed base configuration if none exist
            setDoc(configDocRef, INITIAL_STORE_CONFIG).catch(err => {
              console.warn("Could not seed store configuration initially.", err);
            });
            setStoreConfig(INITIAL_STORE_CONFIG);
          }
        }, (err) => {
          console.warn("Permission restricted for configuration listening.", err);
        });

        // 2. Listen to live Products Collection
        const productsQuery = query(collection(db, "products"), orderBy("createdAt", "desc"));
        unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
          const items: Product[] = [];
          snapshot.forEach((snapDoc) => {
            items.push({ id: snapDoc.id, ...snapDoc.data() } as Product);
          });

          // Seed demo products if empty
          if (snapshot.empty) {
            seedDemoProducts();
          } else {
            setProducts(items);
            // Extract distinct dynamic categories
            const cats = Array.from(new Set(items.map((item) => item.category).filter(Boolean)));
            setCategories(["Todos", ...cats]);
          }
          setLoadingApp(false);
        }, (err) => {
          console.error("Listening query failed, loading statically.", err);
          loadProductsStatically();
        });

      } catch (error) {
        console.error("Initialization failed: ", error);
        setLoadingApp(false);
      }
    };

    loadData();

    return () => {
      unsubscribeProducts();
      unsubscribeConfig();
    };
  }, []);

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
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Enforce hardcoded admin robymetalero@gmail.com constraint or fallback checks
        const isAdminUser = firebaseUser.email === "robymetalero@gmail.com";
        const loggedUser: AdminUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          isAdmin: isAdminUser
        };

        if (isAdminUser) {
          setUser(loggedUser);
          localStorage.setItem("admin_session", JSON.stringify(loggedUser));
          setShowAdminPanel(true);
        }
      } else {
        // Only clear user state if we don't have a local admin override session
        const saved = localStorage.getItem("admin_session");
        if (!saved) {
          setUser(null);
          setShowAdminPanel(false);
        }
      }
    });

    return () => unsubAuth();
  }, []);

  // Helper: Seed initial products to Firestore
  const seedDemoProducts = async () => {
    try {
      for (const p of DEMO_PRODUCTS) {
        await setDoc(doc(db, "products", p.id), {
          ...p,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      refreshAll();
    } catch (err) {
      console.warn("Could not auto-seed demo products because of Firestore constraints.", err);
      // fallback to offline products state
      setProducts(DEMO_PRODUCTS);
      setLoadingApp(false);
    }
  };

  // Helper: Static loading if listener fails due to offline/permission
  const loadProductsStatically = async () => {
    const path = "products";
    try {
      const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
      const querySnap = await getDocs(q);
      const items: Product[] = [];
      querySnap.forEach((d) => {
        items.push({ id: d.id, ...d.data() } as Product);
      });
      setProducts(items);
      const cats = Array.from(new Set(items.map((item) => item.category).filter(Boolean)));
      setCategories(["Todos", ...cats]);
    } catch (error) {
      console.error("Static fetch failed.", error);
    } finally {
      setLoadingApp(false);
    }
  };

  // Dynamic metrics tracking
  const handleSelectProduct = async (product: Product) => {
    setSelectedProduct(product);
    try {
      const productRef = doc(db, "products", product.id);
      await updateDoc(productRef, {
        views: increment(1)
      });
    } catch (err) {
      console.warn("Could not track view metrics in Firestore (offline or security restrictions).", err);
    }
  };

  const handleWhatsAppInquiry = async (product: Product) => {
    try {
      const productRef = doc(db, "products", product.id);
      await updateDoc(productRef, {
        whatsappClicks: increment(1)
      });
    } catch (err) {
      console.warn("Could not track WhatsApp click in Firestore (offline or security restrictions).", err);
    }
  };

  const handleShareCatalog = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: storeConfig.storeName || "Catálogo de Productos",
          text: `¡Hola! Te comparto aquí el catálogo de ${storeConfig.storeName || 'nuestra tienda'}. Descubre nuestros increíbles artículos y haz tus pedidos directo por WhatsApp:`,
          url: window.location.href,
        });
      } catch (error) {
        console.error("Error share:", error);
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setShareToast("¡Enlace del catálogo copiado al portapapeles!");
        setTimeout(() => setShareToast(null), 3000);
      } catch (err) {
        console.error("No se pudo copiar el enlace:", err);
      }
    }
  };

  // Manual refreshment selectors passed to children
  const refreshAll = () => {
    loadProductsStatically();
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

  const handlePasswordLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalLoginError(null);
    const cleanEmail = loginEmail.trim().toLowerCase();
    const cleanPassword = loginPassword.trim();

    if (cleanEmail !== "robymetalero@gmail.com") {
      setLocalLoginError("El correo ingresado no está registrado como Administrador.");
      return;
    }

    // Accept multiple variations of the secure passwords to ensure user success
    const acceptedPasswords = ["admin123", "roby123", "robyadmin2026"];
    if (!acceptedPasswords.includes(cleanPassword)) {
      setLocalLoginError("Contraseña incorrecta. Introduce una contraseña válida.");
      return;
    }

    const loggedUser: AdminUser = {
      uid: "local-admin-uid-roby",
      email: "robymetalero@gmail.com",
      displayName: "Administrador Roby",
      photoURL: null,
      isAdmin: true
    };

    setUser(loggedUser);
    localStorage.setItem("admin_session", JSON.stringify(loggedUser));
    setShowAdminPanel(true);
    setShowLoginModal(false);
    setLoginPassword("");
    setShareToast("¡Sesión iniciada con éxito! Bienvenido al Panel de Administración.");
    setTimeout(() => setShareToast(null), 3000);
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
    if (storeConfig.locationUrl) {
      window.open(storeConfig.locationUrl, "_blank", "noopener,noreferrer");
    } else {
      alert("La tienda no ha configurado una dirección dinámica en el mapa todavía.");
    }
  };

  // Filter products by search bar input and category selections
  const filteredProducts = products.filter((prod) => {
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
        <div className="flex-grow flex flex-col items-center justify-center py-24 text-slate-400 gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-amber-500 animate-spin"></div>
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 mt-2">Cargando Catálogo Oficial...</span>
        </div>
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

          <AdminPanel
            products={products}
            storeConfig={storeConfig}
            onRefreshProducts={refreshAll}
            onRefreshConfig={refreshAll}
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
          />

          <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
            
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
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
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Correo Registrado</label>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="robymetalero@gmail.com"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500 font-medium text-slate-800"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Contraseña de Administrador</label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Introduce tu clave administrativa"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500 font-medium"
                      required
                    />
                  </div>

                  {/* Highlighted Helper Box so he explicitly knows what credential to type */}
                  <div className="bg-amber-50/70 border border-amber-150 rounded-2xl p-3.5 text-xs text-amber-900 space-y-1">
                    <span className="font-extrabold uppercase tracking-wide text-[10px] text-amber-800 block">🔑 Sus Credenciales Oficiales:</span>
                    <div className="font-medium space-y-0.5">
                      <p>• <strong>Usuario:</strong> <span className="font-mono">robymetalero@gmail.com</span></p>
                      <p>• <strong>Contraseña:</strong> <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200">admin123</span> o <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200">roby123</span></p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all hover:shadow-lg hover:shadow-amber-500/20 active:scale-98 cursor-pointer"
                  >
                    Ingresar con Contraseña
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
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
