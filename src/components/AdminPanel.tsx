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

interface AdminPanelProps {
  products: Product[];
  storeConfig: StoreConfig;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setStoreConfig: React.Dispatch<React.SetStateAction<StoreConfig>>;
  onRefreshProducts: () => void;
  onRefreshConfig: () => void;
  currentUser?: any | null;
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
  const [activeTab, setActiveTab] = useState<"products" | "store" | "diagnostics" | "users">("products");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "warning" } | null>(null);
  const [loading, setLoading] = useState(false);

  // Cloud diagnostics states
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);

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
    try {
      const payload = {
        name: userFormName,
        username: userFormUsername,
        password: userFormPassword,
        role: userFormRole,
        preguntaSeguridad: userFormPregunta,
        respuestaSeguridad: userFormRespuesta
      };

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
        setIsEditingUser(false);
        fetchUsers();
      } else {
        const errData = await res.json();
        showToast(errData.error || "Error al guardar el usuario.", "error");
      }
    } catch (err: any) {
      showToast("Error de conexión: " + err.message, "error");
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
        showToast(errData.error || "Fallo al eliminar usuario.", "error");
      }
    } catch (err: any) {
      showToast("Error de conexión: " + err.message, "error");
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

  useEffect(() => {
    if (activeTab === "diagnostics") {
      fetchDiagnostics();
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

  // Core Helper: Direct Multi-file Upload to Express Backend with Fallback to Firebase Storage
  const uploadMultipleWithProgress = async (
    files: File[], 
    onProgress: (percent: number) => void
  ): Promise<string[]> => {
    // 1. We prioritize the high-speed Express Backend /api/upload endpoint because it is 100% reliable
    // in our sandboxed Node environments and won't get stuck at 0% due to Firebase Storage bucket permissions.
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
      console.warn("[Backend Upload] Falló carga al backend. Intentando Firebase Storage como alternativa:", backendErr);
      
      // 2. Fallback: Client-side Firebase Storage
      try {
        console.log(`[Firebase Client Storage] Iniciando subida alternativa de ${files.length} archivo(s)...`);
        const { ref, uploadBytesResumable, getDownloadURL } = await import("firebase/storage");
        const { storage } = await import("../firebase");

        const fileProgresses = new Array(files.length).fill(0);

        const uploadPromises = files.map((file, idx) => {
          return new Promise<string>((resolveFile, rejectFile) => {
            // Create clean unique path in Storage bucket
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
            const extIndex = file.name.lastIndexOf(".");
            const ext = extIndex !== -1 ? file.name.substring(extIndex) : "";
            const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_");
            const storagePath = `products/${baseName}-${uniqueSuffix}${ext || ".jpg"}`;
            const fileRef = ref(storage, storagePath);

            const uploadTask = uploadBytesResumable(fileRef, file);

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
        throw new Error("No fue posible subir los archivos. Al parecer la conexión falló: " + (fbStorageErr?.message || fbStorageErr));
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

    const reqObj: any = {
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

    // UPDATE LOCAL STATE AND CACHE INSTANTLY (IMMEDIATE REACTION)
    setProducts(updatedProductsList);
    try {
      localStorage.setItem("local_products_cache", JSON.stringify(updatedProductsList));
    } catch (e) {}

    setIsEditingProduct(false);

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
      console.warn("[Firebase Client] Error escribiendo producto en Firestore:", fsErr.message);
    }

    try {
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
      onRefreshProducts(); // Synchronize local state
    } catch (error: any) {
      console.error("Could not write product to Firestore:", error);
      showToast(`Error al guardar producto en Firestore: ${error.message || error}`, "error");
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

    // Delete directly from Firestore first (Client SDK)
    try {
      await deleteDoc(doc(db, "products", id));
      console.log("[Firebase Client] Producto eliminado directamente de Firestore!");
    } catch (fsErr: any) {
      console.warn("[Firebase Client] Error eliminando producto directamente de Firestore:", fsErr.message);
    }

    try {
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
      onRefreshProducts(); // Synchronize local state
    } catch (error: any) {
      console.error("Could not delete product from Firestore:", error);
      showToast(`Error al eliminar producto en Firestore: ${error.message || error}`, "error");
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

                {uploadingMedia && !uploadProgressMsg.includes("foto") && (
                  <div className="absolute inset-0 bg-white/98 rounded-2xl flex flex-col items-center justify-center z-20 p-5 text-center">
                    {/* circular spinner with percent */}
                    <div className="relative flex items-center justify-center mb-3">
                      <span className="w-14 h-14 rounded-full border-4 border-amber-100 border-t-amber-500 animate-spin inline-block" />
                      <span className="absolute text-[11px] font-black text-amber-800">{uploadPercent}%</span>
                    </div>
                    
                    {/* progress text messages */}
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide max-w-full truncate px-2 mb-2.5">
                      {uploadProgressMsg || "Preparando Archivos..."}
                    </span>

                    {/* bar container */}
                    <div className="w-full max-w-[200px] h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200/50">
                      <div 
                        className="h-full bg-linear-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-300 ease-out" 
                        style={{ width: `${uploadPercent}%` }}
                      />
                    </div>
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
      ) : activeTab === "diagnostics" ? (
        /* CLOUD DIAGNOSTICS DETAILED TAB PANEL */
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs animate-fadeIn space-y-6 text-left">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="font-sans font-semibold text-lg text-slate-800 flex items-center gap-2">
                <Database className="text-amber-500" size={20} />
                <span>Estado e Integración con la Nube</span>
              </h3>
              <p className="text-xs text-slate-400">Verifica la conexión con Google Cloud SQL (PostgreSQL) y Google Cloud Storage (Fotos/Videos) de dstores.app.</p>
            </div>
            <button
              onClick={fetchDiagnostics}
              disabled={loadingDiagnostics}
              className="self-start sm:self-auto px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <RefreshCw size={13} className={loadingDiagnostics ? "animate-spin" : ""} />
              <span>{loadingDiagnostics ? "Probando..." : "Re-probar Conexiones"}</span>
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
