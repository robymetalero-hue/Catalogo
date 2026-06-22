/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { Product } from "../types";
import { X, Phone, Tag, Play, Film, Check, ExternalLink, Sparkles, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ProductDetailsModalProps {
  product: Product;
  showPrices: boolean;
  whatsappNumber?: string;
  whatsappCustomMessage?: string;
  onClose: () => void;
  onWhatsAppInquiry?: (product: Product) => void;
}

export default function ProductDetailsModal({
  product,
  showPrices,
  whatsappNumber,
  whatsappCustomMessage,
  onClose,
  onWhatsAppInquiry,
}: ProductDetailsModalProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  const images = product.images && product.images.filter(img => img && img.trim() !== "").length > 0 
    ? product.images.filter(img => img && img.trim() !== "") 
    : ["https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=600&auto=format&fit=crop"];

  const currentImageUrl = images[activeImageIndex];
  const [imageSrc, setImageSrc] = useState(currentImageUrl || "");

  // Trigger loading skeleton during media transitions for ultimate visual polish
  useEffect(() => {
    setImageSrc(currentImageUrl || "");
    if (!isPlayingVideo && imgRef.current && imgRef.current.complete) {
      setImageLoading(false);
    } else {
      setImageLoading(true);
    }
  }, [activeImageIndex, isPlayingVideo, product.id, currentImageUrl]);

  const handleImageError = () => {
    setImageLoading(false);
    const backupImg = product.backupImages?.[activeImageIndex];
    if (backupImg && imageSrc !== backupImg) {
      setImageSrc(backupImg);
    } else {
      setImageSrc("https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600&auto=format&fit=crop");
    }
  };

  // Lock background scroll when modal is open and handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    
    // Prevent scrolling
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    
    window.addEventListener("keydown", handleKeyDown);
    
    return () => {
      document.body.style.overflow = originalStyle;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Helper to parse and embed YouTube / Vimeo or return direct video url
  const getEmbedUrl = (url?: string) => {
    if (!url) return null;
    
    // YouTube
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const ytMatch = url.match(ytRegex);
    if (ytMatch && ytMatch[1]) {
      return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;
    }

    // Vimeo
    const vimeoRegex = /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)([0-9]+)/i;
    const vimeoMatch = url.match(vimeoRegex);
    if (vimeoMatch && vimeoMatch[1]) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
    }

    return null;
  };

  const embedVideoUrl = getEmbedUrl(product.videoUrl);

  const getWhatsAppLink = () => {
    const cleanPhone = whatsappNumber?.replace(/[^0-9]/g, "") || "59100000000";
    const customText = whatsappCustomMessage || "Hola! Estoy interesado en el producto: {productName} (SKU: {productSku})";
    
    // Support a wide variety of placeholder names for maximum flexibility
    let resolvedText = customText;
    
    // Use regex with 'i' (case-insensitive) and 'g' (global) to match any user configuration
    resolvedText = resolvedText.replace(/{productName}/gi, product.name);
    resolvedText = resolvedText.replace(/{name}/gi, product.name);
    
    resolvedText = resolvedText.replace(/{productSku}/gi, product.sku || "");
    resolvedText = resolvedText.replace(/{sku}/gi, product.sku || "");
    
    const priceFormatted = showPrices && !product.hidePrice && product.retailPrice !== undefined && product.retailPrice !== null
      ? `$${product.retailPrice.toLocaleString()}`
      : "";
    resolvedText = resolvedText.replace(/{productPrice}/gi, priceFormatted);
    resolvedText = resolvedText.replace(/{price}/gi, priceFormatted);
    resolvedText = resolvedText.replace(/{precio}/gi, priceFormatted);

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(resolvedText)}`;
  };

  return (
    <motion.div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md overscroll-contain"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      {/* Modal Card wrapper */}
      <motion.div 
        id="product-details-modal"
        className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-100/80"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: "spring", damping: 28, stiffness: 350, restDelta: 0.001 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button details */}
        <motion.button
          onClick={onClose}
          whileHover={{ scale: 1.1, backgroundColor: "#f1f5f9" }}
          whileTap={{ scale: 0.9 }}
          className="absolute right-4 top-4 md:right-5 md:top-5 z-[100] p-2.5 text-slate-700 hover:text-slate-900 bg-white border border-slate-200/80 shadow-md rounded-full transition-all cursor-pointer"
          aria-label="Cerrar modal"
        >
          <X size={20} />
        </motion.button>

        {/* Scrollable Content Container */}
        <div className="flex-grow overflow-y-auto p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
            
            {/* Left side: Images & Videos */}
            <div className="flex flex-col gap-4">
              
              {/* Main Media Stage */}
              <div className="relative aspect-square rounded-2xl bg-slate-100 border border-slate-100 overflow-hidden shadow-3xs flex items-center justify-center">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div 
                    key={isPlayingVideo ? "video" : activeImageIndex}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.04 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full h-full absolute inset-0 flex items-center justify-center bg-slate-50/20"
                  >
                  {isPlayingVideo && product.videoUrl ? (
                    embedVideoUrl ? (
                      <iframe
                        src={embedVideoUrl}
                        title="Product Video"
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    ) : (
                      <video
                        src={product.videoUrl}
                        controls
                        autoPlay
                        preload="metadata"
                        playsInline
                        className="w-full h-full object-contain"
                      />
                    )
                  ) : (
                    <img
                      ref={imgRef}
                      src={imageSrc}
                      alt={product.name}
                      referrerPolicy="no-referrer"
                      onLoad={() => setImageLoading(false)}
                      onError={handleImageError}
                      className="w-full h-full object-contain p-2"
                    />
                  )}
                </motion.div>
                </AnimatePresence>

                {/* Return from Video to Image */}
                {isPlayingVideo && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsPlayingVideo(false)}
                    className="absolute bottom-4 left-4 px-3.5 py-2 bg-slate-950/85 hover:bg-slate-950 border border-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg"
                  >
                    <span>Ver fotos del producto</span>
                  </motion.button>
                )}
              </div>

              {/* Media selection bar: photo gallery thumbnails and video previews */}
              <div id="media-navigation-grid" className="flex flex-wrap gap-2.5 items-center">
                
                {/* Images Selector */}
                {images.map((img, idx) => {
                  const backupImg = product.backupImages?.[idx];
                  return (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setActiveImageIndex(idx);
                        setIsPlayingVideo(false);
                      }}
                      className={`w-14 h-14 rounded-xl overflow-hidden border bg-slate-50 transition-all ${
                        activeImageIndex === idx && !isPlayingVideo
                          ? "border-amber-500 scale-105 shadow-xs ring-2 ring-amber-500/20"
                          : "border-slate-200 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <img 
                        src={img} 
                        onError={(e) => {
                          if (backupImg) {
                            e.currentTarget.src = backupImg;
                          } else {
                            e.currentTarget.src = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600&auto=format&fit=crop";
                          }
                        }}
                        alt={`Thumbnail ${idx}`} 
                        referrerPolicy="no-referrer" 
                        className="w-full h-full object-cover" 
                      />
                    </motion.button>
                  );
                })}

                {/* Video Option Thumbnail */}
                {product.videoUrl && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsPlayingVideo(true)}
                    className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center border transition-all ${
                      isPlayingVideo
                        ? "border-amber-500 bg-amber-50 scale-105 shadow-xs ring-2 ring-amber-500/20 text-amber-600 font-bold"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:text-amber-500 hover:bg-amber-50/50"
                    }`}
                  >
                    <Play size={16} fill="currentColor" className="ml-0.5 animate-pulse" />
                    <span className="text-[9px] font-bold mt-1 uppercase tracking-wide">Video</span>
                  </motion.button>
                )}
              </div>
            </div>

            {/* Right side: Information */}
            <div className="flex flex-col h-full justify-between">
              <div>
                {/* Badge indicators */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-sky-700 bg-sky-50 rounded-xl border border-sky-100">
                    {product.category || "General"}
                  </span>
                  <span className="text-[10px] text-mono text-slate-500 bg-slate-50 border border-slate-100 px-2 py-1 rounded-xl font-mono font-semibold">
                    SKU: {product.sku}
                  </span>
                  <span
                    className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest rounded-xl ${
                      product.isAvailable
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        : "bg-rose-50 text-rose-700 border border-rose-100"
                    }`}
                  >
                    {product.isAvailable ? "● En Stock" : "🚫 Fuera de stock"}
                  </span>
                </div>

                {/* Product Title */}
                <h2 className="font-sans font-extrabold text-slate-900 text-2xl md:text-3xl mb-4 leading-tight tracking-tight">
                  {product.name}
                </h2>

                {/* Prices block */}
                {showPrices && !product.hidePrice ? (
                  <div className="bg-gradient-to-r from-slate-50 to-slate-100/50 border border-slate-100/80 rounded-2xl p-4.5 flex justify-between gap-4 mb-6 relative overflow-hidden">
                    <div className="absolute right-0 top-0 translate-x-1/3 -translate-y-1/3 w-32 h-32 bg-amber-500/5 rounded-full pointer-events-none" />
                    <div>
                      <span className="block text-[9px] text-slate-400 font-extrabold uppercase tracking-widest mb-1">Precio Unitario</span>
                      <span className="text-2xl font-black text-slate-900 tracking-tight">
                        ${product.retailPrice.toLocaleString()}
                      </span>
                    </div>
                    {product.wholesalePrice > 0 && (
                      <div className="border-l border-slate-200/80 pl-6 pr-2">
                        <span className="block text-[9px] text-slate-400 font-extrabold uppercase tracking-widest mb-1">Distribuidor / Mayorista</span>
                        <span className="text-2xl font-bold text-amber-600 tracking-tight">
                          ${product.wholesalePrice.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-amber-50/40 border border-amber-500/15 rounded-2xl p-4.5 text-amber-900 text-xs font-semibold mb-6 flex items-start gap-3">
                    <Tag size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-900 uppercase tracking-wide text-[10px] block mb-1">Precios Especiales</span>
                      <p className="text-slate-600 leading-normal">Los precios de este artículo están reservados. Solicita cotización minoristas o descuentos para distribuidores directo por WhatsApp.</p>
                    </div>
                  </div>
                )}

                {/* Detailed Description */}
                <div className="mb-6">
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Detalles del Producto</h4>
                  <div className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed max-h-[160px] overflow-y-auto pr-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100/80">
                    {product.description || "Este excelente producto no cuenta con descripción adicional por el momento."}
                  </div>
                </div>

                {/* Extra features checkmarks */}
                <div className="space-y-2 mb-6 border-t border-slate-100 pt-4.5">
                  <div className="flex items-center gap-2.5 text-xs font-medium text-slate-500">
                    <Check size={14} className="text-emerald-500 bg-emerald-50 p-0.5 rounded-full" />
                    <span>Compra directa sin intermediarios ni comisiones</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs font-medium text-slate-500">
                    <Check size={14} className="text-emerald-500 bg-emerald-50 p-0.5 rounded-full" />
                    <span>Cotización garantizada para compras mayoritarias en lote</span>
                  </div>
                </div>
              </div>

              {/* WhatsApp direct contact CTA */}
              <div id="contact-action-zone" className="border-t border-slate-100 pt-5 mt-auto">
                <motion.a
                  whileHover={{ y: -2, scale: 1.01, boxShadow: "0 10px 20px -10px rgba(16, 185, 129, 0.4)" }}
                  whileTap={{ scale: 0.98 }}
                  href={getWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (onWhatsAppInquiry) {
                      onWhatsAppInquiry(product);
                    }
                  }}
                  className="flex items-center justify-center gap-2.5 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl transition-all shadow-md shadow-emerald-500/15"
                >
                  <Phone size={14} className="animate-bounce" />
                  <span>Preguntar por WhatsApp sobre este Producto</span>
                </motion.a>
              </div>
            </div>

          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
