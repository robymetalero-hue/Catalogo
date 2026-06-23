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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md overscroll-contain"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      {/* Modal Card wrapper */}
      <motion.div 
        id="product-details-modal"
        className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-[28px] shadow-2xl flex flex-col overflow-hidden border border-slate-200/50"
        initial={{ opacity: 0, scale: 0.95, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button details */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 md:right-6 md:top-6 z-[100] w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-950 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-full transition-all cursor-pointer active:scale-90"
          aria-label="Cerrar modal"
        >
          <X size={18} className="stroke-[2.5]" />
        </button>

        {/* Scrollable Content Container */}
        <div className="flex-grow overflow-y-auto p-5 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
            
            {/* Left side: Images & Videos */}
            <div className="flex flex-col gap-4">
              
              {/* Main Media Stage */}
              <div className="relative aspect-square rounded-2xl bg-slate-50/50 border border-slate-100 overflow-hidden flex items-center justify-center group/stage shadow-2xs">
                {imageLoading && !isPlayingVideo && (
                  <div className="absolute inset-0 bg-slate-50 flex items-center justify-center z-10">
                    <ImageIcon size={28} className="text-slate-200 animate-pulse" />
                  </div>
                )}

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div 
                    key={isPlayingVideo ? "video" : activeImageIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="w-full h-full absolute inset-0 flex items-center justify-center bg-transparent"
                  >
                  {isPlayingVideo && product.videoUrl ? (
                    embedVideoUrl ? (
                      <iframe
                        src={embedVideoUrl}
                        title="Video de producto"
                        className="w-full h-full border-0 rounded-2xl"
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
                        className="w-full h-full object-contain rounded-2xl bg-slate-950"
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
                  <button
                    onClick={() => setIsPlayingVideo(false)}
                    className="absolute bottom-4 left-4 px-3 py-1.5 bg-slate-900/90 hover:bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95"
                  >
                    <span>Ver fotos</span>
                  </button>
                )}
              </div>

              {/* Media selection bar: photo gallery thumbnails and video previews */}
              <div id="media-navigation-grid" className="flex flex-wrap gap-2.5 items-center">
                
                {/* Images Selector */}
                {images.map((img, idx) => {
                  const backupImg = product.backupImages?.[idx];
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setActiveImageIndex(idx);
                        setIsPlayingVideo(false);
                      }}
                      className={`w-14 h-14 rounded-xl overflow-hidden border bg-slate-50/50 transition-all cursor-pointer active:scale-90 ${
                        activeImageIndex === idx && !isPlayingVideo
                          ? "border-amber-500 ring-2 ring-amber-500/10 scale-102"
                          : "border-slate-200/80 opacity-60 hover:opacity-100"
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
                        alt={`Miniatura ${idx}`} 
                        referrerPolicy="no-referrer" 
                        className="w-full h-full object-cover" 
                      />
                    </button>
                  );
                })}

                {/* Video Option Thumbnail */}
                {product.videoUrl && (
                  <button
                    onClick={() => setIsPlayingVideo(true)}
                    className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center border transition-all cursor-pointer active:scale-90 ${
                      isPlayingVideo
                        ? "border-amber-500 bg-amber-500/10 text-amber-600 font-bold"
                        : "border-slate-200/80 bg-slate-50/50 text-slate-500 hover:text-amber-600 hover:bg-slate-50"
                    }`}
                  >
                    <Play size={14} fill="currentColor" className="ml-0.5" />
                    <span className="text-[8px] font-black mt-1 uppercase tracking-wider">Video</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right side: Information */}
            <div className="flex flex-col h-full justify-between">
              <div>
                {/* Badge indicators */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="px-2.5 py-0.5 text-[8px] font-extrabold uppercase tracking-widest text-sky-700 bg-sky-500/8 rounded-md border border-sky-500/10">
                    {product.category || "General"}
                  </span>
                  <span className="text-[8px] font-mono text-slate-400 bg-slate-50 border border-slate-200/50 px-2 py-0.5 rounded font-semibold">
                    SKU: {product.sku}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 text-[8px] font-extrabold uppercase tracking-widest rounded-md border ${
                      product.isAvailable
                        ? "bg-emerald-500/8 text-emerald-600 border-emerald-500/10"
                        : "bg-rose-500/8 text-rose-500 border-rose-500/10"
                    }`}
                  >
                    {product.isAvailable ? "● En Stock" : "🚫 Sin Stock"}
                  </span>
                </div>

                {/* Product Title */}
                <h2 className="font-sans font-extrabold text-slate-950 text-xl md:text-2xl mb-4 leading-snug tracking-tight">
                  {product.name}
                </h2>

                {/* Prices block */}
                {showPrices && !product.hidePrice ? (
                  <div className="border border-slate-200/60 rounded-2xl p-4.5 flex justify-between gap-4 mb-6 bg-slate-50/30">
                    <div>
                      <span className="block text-[8px] text-slate-400 font-extrabold uppercase tracking-widest mb-1.5">Precio Unitario</span>
                      <span className="text-xl font-black text-slate-950 tracking-tight">
                        ${product.retailPrice.toLocaleString()}
                      </span>
                    </div>
                    {product.wholesalePrice > 0 && (
                      <div className="border-l border-slate-250/20 pl-6 pr-2">
                        <span className="block text-[8px] text-slate-400 font-extrabold uppercase tracking-widest mb-1.5">Distribuidor / Mayorista</span>
                        <span className="text-xl font-bold text-emerald-600 tracking-tight">
                          ${product.wholesalePrice.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4.5 text-amber-900 text-xs font-semibold mb-6 flex items-start gap-3">
                    <Tag size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-800 uppercase tracking-wide text-[9px] block mb-1">Precios Especiales</span>
                      <p className="text-slate-500 leading-normal text-xs">Los precios de este artículo están reservados. Solicita cotización directo por WhatsApp.</p>
                    </div>
                  </div>
                )}

                {/* Detailed Description */}
                <div className="mb-6">
                  <h4 className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Detalles del Producto</h4>
                  <div className="text-slate-600 text-xs whitespace-pre-wrap leading-relaxed max-h-[160px] overflow-y-auto pr-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100/60">
                    {product.description || "Este excelente producto no cuenta con descripción adicional por el momento."}
                  </div>
                </div>

                {/* Extra features checkmarks */}
                <div className="space-y-2 mb-6 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2.5 text-xs text-slate-500">
                    <Check size={12} className="text-emerald-500 bg-emerald-50 p-0.5 rounded-full" />
                    <span>Compra directa sin comisiones ocultas</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-500">
                    <Check size={12} className="text-emerald-500 bg-emerald-50 p-0.5 rounded-full" />
                    <span>Cotización preferente mayorista sobre volumen</span>
                  </div>
                </div>
              </div>

              {/* WhatsApp direct contact CTA */}
              <div id="contact-action-zone" className="border-t border-slate-100 pt-5 mt-auto">
                <a
                  href={getWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (onWhatsAppInquiry) {
                      onWhatsAppInquiry(product);
                    }
                  }}
                  className="flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl transition-all shadow-md shadow-emerald-500/10 cursor-pointer active:scale-99"
                >
                  <Phone size={13} className="stroke-[2.5]" />
                  <span>Preguntar por WhatsApp</span>
                </a>
              </div>
            </div>

          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
