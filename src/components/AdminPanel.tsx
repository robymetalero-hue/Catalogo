/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Product, StoreConfig } from "../types";
import { db, OperationType, handleFirestoreError, storage } from "../firebase";
import { 
  collection, doc, setDoc, deleteDoc, updateDoc
} from "firebase/firestore";
import { 
  ref, uploadBytes, getDownloadURL 
} from "firebase/storage";
import { 
  Store, Plus, Edit2, Trash2, Save, X, Eye, EyeOff, Video, Link, Check, Image as ImageIcon, Sparkles, FolderPlus, Phone, TrendingUp, ThumbsUp, BarChart2, Upload 
} from "lucide-react";

interface AdminPanelProps {
  products: Product[];
  storeConfig: StoreConfig;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setStoreConfig: React.Dispatch<React.SetStateAction<StoreConfig>>;
  onRefreshProducts: () => void;
  onRefreshConfig: () => void;
  onSeedDemo?: () => void;
}

const CATEGORY_PRESETS = ["Calzado", "Ropa", "Accesorios", "Hogar", "Tecnología", "Salud y Belleza", "Deportes", "Otros"];

export default function AdminPanel({
  products,
  storeConfig,
  setProducts,
  setStoreConfig,
  onRefreshProducts,
  onRefreshConfig,
  onSeedDemo,
}: AdminPanelProps) {
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

  // Global States
  const [activeTab, setActiveTab] = useState<"products" | "store">("products");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);

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
  const [wholesalePrice, setWholesalePrice] = useState(0);
  const [isAvailable, setIsAvailable] = useState(true);
  const [videoUrl, setVideoUrl] = useState("");
  const [imagesList, setImagesList] = useState<string[]>([""]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadError, setUploadError] = useState("");

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
    }
  }, [storeConfig]);

  // Show status toasts
  const showToast = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  // Preserve original high-fidelity megabyte-sized images or videos selected by the store editor as requested
  const compressImage = (file: File): Promise<File> => {
    return new Promise<File>((resolve) => {
      // Return file completely untouched to preserve original quality and megabyte-scale dimensions
      resolve(file);
    });
  };

  // Media upload handler for PC / Android files selecting multiple at once
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingMedia(true);
    setUploadError("");

    try {
      const formData = new FormData();
      for (const file of Array.from(files) as File[]) {
        formData.append("files", file);
      }

      // Upload via backend Express API endpoint
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("La respuesta del backend falló durante la subida.");
      }

      const uploadData = await res.json();
      const urls: string[] = uploadData.urls || [];

      const newImages: string[] = [];
      let lastVideo = "";

      urls.forEach((url) => {
        const lowerUrl = url.toLowerCase();
        if (
          lowerUrl.endsWith(".mp4") ||
          lowerUrl.endsWith(".webm") ||
          lowerUrl.endsWith(".mov") ||
          lowerUrl.endsWith(".avi")
        ) {
          lastVideo = url;
        } else {
          newImages.push(url);
        }
      });

      // Add to current image roster, filtering out blank fields
      setImagesList((prev) => {
        const cleaned = prev.filter((img) => img.trim() !== "");
        const combined = [...cleaned, ...newImages];
        return combined.length === 0 ? [""] : combined;
      });

      if (lastVideo) {
        setVideoUrl(lastVideo);
      }

      showToast(`¡Carga completada! Subidos ${urls.length} archivo(s) al servidor de Google Cloud.`);
    } catch (err: any) {
      console.error("Carga de archivos fallida: ", err);
      setUploadError("Error en la carga rápida. El archivo puede ser demasiado grande o no compatible.");
      showToast("Error al subir los medios", "error");
    } finally {
      setUploadingMedia(false);
      // Allow re-upload of the same files if needed
      e.target.value = "";
    }
  };

  // Action: Save general config to Firestore
  const handleSaveStoreConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const path = "storeConfig/default";
    
    const updatedData: StoreConfig = {
      storeName: storeName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      whatsappNumber: whatsappNumber.trim().replace(/[^0-9]/g, ""), // clean number
      whatsappCustomMessage: whatsappCustomMessage.trim(),
      locationUrl: locationUrl.trim(),
      showPrices: !!showPrices,
      updatedAt: new Date()
    };

    // UPDATE LOCAL STATE / CACHE INSTANTLY (IMMEDIATE REACTION)
    setStoreConfig(updatedData);
    try {
      localStorage.setItem("local_store_config_cache", JSON.stringify(updatedData));
    } catch (err) {}

    try {
      const res = await fetch("/api/store-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData)
      });
      if (!res.ok) throw new Error("Fallo en la llamada API a Google Cloud PostgreSQL");
      showToast("Configuración general guardada exitosamente en Google Cloud SQL");
      onRefreshConfig(); // Sincroniza la información real desde la BD
    } catch (error: any) {
      console.error("Could not save config to Google Cloud SQL:", error);
      showToast(`Error al guardar configuración: ${error.message || error}`, "error");
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
    setVideoUrl("");
    setImagesList([""]); // initialize with one empty field
    setIsEditingProduct(true);
  };

  // Open Form to edit specific Product
  const handleOpenEditProduct = (product: Product) => {
    setEditingProductId(product.id);
    setSku(product.sku);
    setName(product.name);
    setDescription(product.description || "");
    if (CATEGORY_PRESETS.includes(product.category)) {
      setCategory(product.category);
      setNewCustomCategory("");
    } else {
      setCategory("Custom");
      setNewCustomCategory(product.category);
    }
    setRetailPrice(product.retailPrice || 0);
    setWholesalePrice(product.wholesalePrice || 0);
    setIsAvailable(product.isAvailable !== false);
    setVideoUrl(product.videoUrl || "");
    setImagesList(product.images && product.images.length > 0 ? [...product.images] : [""]);
    setIsEditingProduct(true);
  };

  // Handle Dynamic List for multiple images
  const handleAddImageField = () => {
    setImagesList([...imagesList, ""]);
  };

  const handleImageFieldChange = (index: number, val: string) => {
    const updated = [...imagesList];
    updated[index] = val;
    setImagesList(updated);
  };

  const handleRemoveImageField = (index: number) => {
    if (imagesList.length === 1) {
      setImagesList([""]);
    } else {
      setImagesList(imagesList.filter((_, idx) => idx !== index));
    }
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
    const path = `products/${id}`;

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

    let updatedProductsList: Product[] = [];
    let savedMsg = "";

    if (editingProductId) {
      // Edit flow
      const updatedItemFields = {
        sku: sku.trim(),
        name: name.trim(),
        description: description.trim(),
        category: finalCategory || "Otros",
        retailPrice: Number(retailPrice) || 0,
        wholesalePrice: Number(wholesalePrice) || 0,
        images: filteredImages,
        videoUrl: videoUrl.trim(),
        isAvailable: !!isAvailable,
        updatedAt: currentTime
      };

      updatedProductsList = products.map((p) => 
        p.id === id ? { ...p, ...updatedItemFields } : p
      );
      savedMsg = "Producto actualizado con éxito";
    } else {
      // Create flow
      const newItem: Product = {
        id,
        sku: sku.trim(),
        name: name.trim(),
        description: description.trim(),
        category: finalCategory || "Otros",
        retailPrice: Number(retailPrice) || 0,
        wholesalePrice: Number(wholesalePrice) || 0,
        images: filteredImages,
        videoUrl: videoUrl.trim(),
        isAvailable: !!isAvailable,
        createdAt: currentTime,
        updatedAt: currentTime,
        views: 0,
        whatsappClicks: 0
      };

      updatedProductsList = [newItem, ...products];
      savedMsg = "Producto agregado al catálogo";
    }

    // UPDATE LOCAL STATE AND CACHE INSTANTLY (IMMEDIATE REACTION)
    setProducts(updatedProductsList);
    try {
      localStorage.setItem("local_products_cache", JSON.stringify(updatedProductsList));
    } catch (e) {}

    setIsEditingProduct(false);

    try {
      if (editingProductId) {
        const reqObj = {
          sku: sku.trim(),
          name: name.trim(),
          description: description.trim(),
          category: finalCategory || "Otros",
          retailPrice: Number(retailPrice) || 0,
          wholesalePrice: Number(wholesalePrice) || 0,
          images: filteredImages,
          videoUrl: videoUrl.trim(),
          isAvailable: !!isAvailable,
          updatedAt: currentTime
        };
        const res = await fetch(`/api/products/${editingProductId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqObj)
        });
        if (!res.ok) throw new Error("Fallo en la llamada API PostgreSQL al editar");
      } else {
        const reqObj = {
          id,
          sku: sku.trim(),
          name: name.trim(),
          description: description.trim(),
          category: finalCategory || "Otros",
          retailPrice: Number(retailPrice) || 0,
          wholesalePrice: Number(wholesalePrice) || 0,
          images: filteredImages,
          videoUrl: videoUrl.trim(),
          isAvailable: !!isAvailable,
          createdAt: currentTime,
          updatedAt: currentTime,
          views: 0,
          whatsappClicks: 0
        };
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqObj)
        });
        if (!res.ok) throw new Error("Fallo en la llamada API PostgreSQL al crear");
      }
      showToast(savedMsg);
      onRefreshProducts(); // Sincroniza productos y categorías reales desde Cloud SQL
    } catch (error: any) {
      console.error("Could not sync product edit with Cloud SQL:", error);
      showToast(`Error al guardar producto: ${error.message || error}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Action: Delete product
  const handleDeleteProduct = async (id: string) => {
    if (!confirm("¿Está seguro que desea eliminar este producto del catálogo?")) return;
    
    setLoading(true);
    
    // UPDATE LOCAL STATE AND CACHE INSTANTLY
    const updatedProductsList = products.filter(p => p.id !== id);
    setProducts(updatedProductsList);
    try {
      localStorage.setItem("local_products_cache", JSON.stringify(updatedProductsList));
    } catch (e) {}

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Fallo en la llamada API PostgreSQL al eliminar");
      showToast("Producto eliminado del catálogo");
      onRefreshProducts(); // Sincroniza los cambios con Cloud SQL
    } catch (error: any) {
      console.error("Could not sync delete with Cloud SQL:", error);
      showToast(`Error al eliminar producto: ${error.message || error}`, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="admin-panel-container" className="bg-slate-50 rounded-3xl border border-slate-100 p-6 md:p-8">
      
      {/* Toast state notifications */}
      {message && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border animate-slideUp ${
            message.type === "success" 
              ? "bg-slate-900 border-slate-800 text-teal-400" 
              : "bg-rose-900 border-rose-800 text-white"
          }`}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"></div>
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
        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl self-start">
          <button
            onClick={() => { setActiveTab("products"); setIsEditingProduct(false); }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "products"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Productos
          </button>
          <button
            onClick={() => { setActiveTab("store"); setIsEditingProduct(false); }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "store"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Ajustes de Tienda
          </button>
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
                    {CATEGORY_PRESETS.map((cat) => (
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

              <div className="flex items-center gap-2 py-1 bg-slate-50 px-3 rounded-lg border border-dashed border-slate-200">
                <input
                  type="checkbox"
                  id="isAvailable"
                  checked={isAvailable}
                  onChange={(e) => setIsAvailable(e.target.checked)}
                  className="w-4 h-4 text-amber-500 border-slate-300 rounded-sm focus:ring-amber-500"
                />
                <label htmlFor="isAvailable" className="text-xs font-semibold text-slate-700">
                  Producto disponible en stock
                </label>
              </div>
            </div>

            {/* Right media elements column */}
            <div className="space-y-4">
              
              {/* PC / Android Upload Zone */}
              <div className="border border-dashed border-slate-200 hover:border-amber-400 bg-amber-50/10 hover:bg-amber-50/20 p-5 rounded-2xl transition-all relative flex flex-col items-center justify-center text-center">
                <input
                  id="media-file-picker"
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleMediaUpload}
                  disabled={uploadingMedia}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                
                <div className="flex flex-col items-center pointer-events-none">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-2">
                    <Upload size={18} className={uploadingMedia ? "animate-bounce" : ""} />
                  </div>
                  <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    {uploadingMedia ? "Subiendo medios..." : "Subir Fotos y Videos"}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 max-w-[280px]">
                    Selecciona varias fotos y videos a la vez desde tu PC o Android. (Admite MP4, PNG, JPG, etc.)
                  </span>
                </div>

                {uploadingMedia && (
                  <div className="absolute inset-0 bg-white/95 rounded-2xl flex flex-col items-center justify-center z-20">
                    <span className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin inline-block mb-1" />
                    <span className="text-[11px] font-bold text-amber-900 uppercase tracking-widest animate-pulse">Cargando Archivos...</span>
                  </div>
                )}
              </div>

              {uploadError && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-rose-700 text-[11px] font-semibold">
                  {uploadError}
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
                  <div className="mt-2 text-[10px] bg-slate-50/50 p-2 border border-slate-100 rounded-lg flex items-center justify-between">
                    <span className="text-slate-500 font-mono truncate max-w-[200px]">Video: {videoUrl}</span>
                    <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wide">Listo para reproducir</span>
                  </div>
                )}
              </div>

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
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-slate-900 border border-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-850 flex items-center gap-1.5 transition-all shadow-xs shrink-0 disabled:opacity-50"
            >
              <Save size={13} />
              <span>{loading ? "Guardando..." : "Guardar Producto"}</span>
            </button>
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

          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-3xs gap-4">
            <span className="text-sm font-semibold text-slate-700">Tienes {products.length} productos en el catálogo</span>
            <button
              onClick={handleOpenCreateProduct}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-amber-500/15 flex items-center gap-1 shrink-0"
            >
              <Plus size={14} />
              <span>Agregar Producto</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            {products.length === 0 ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-4">
                <Store size={40} className="text-slate-300 mb-2" />
                <span className="text-sm font-medium text-slate-600">No se han registrado productos en la base de datos de la nube.</span>
                {onSeedDemo && (
                  <button
                    onClick={onSeedDemo}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-655 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-500/10 flex items-center gap-2 cursor-pointer mt-2"
                  >
                    <Sparkles size={14} className="text-amber-100 animate-pulse" />
                    <span>Cargar Productos de Demostración</span>
                  </button>
                )}
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
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenEditProduct(prod)}
                              className="p-1 px-2.5 text-xs border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg text-slate-600 font-semibold flex items-center gap-1"
                              title="Editar producto"
                            >
                              <Edit2 size={12} />
                              <span>Editar</span>
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(prod.id)}
                              className="p-1 px-2.5 text-xs border border-rose-100 hover:bg-rose-50 rounded-lg text-rose-500 font-semibold flex items-center gap-1"
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
      ) : (
        
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
      )}
    </div>
  );
}
