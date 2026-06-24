/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Product } from "../types";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Video, Phone, Tag } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ProductCardProps {
  product: Product;
  showPrices: boolean;
  whatsappNumber?: string;
  whatsappCustomMessage?: string;
  onOpenDetails: (product: Product) => void;
  onWhatsAppInquiry?: (product: Product) => void;
  index?: number;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  showPrices,
  whatsappNumber,
  whatsappCustomMessage,
  onOpenDetails,
  onWhatsAppInquiry,
  index = 0,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(true);
  const imgRef = React.useRef<HTMLImageElement>(null);

  const images = product.images && product.images.filter(img => img && img.trim() !== "").length > 0
    ? product.images.filter(img => img && img.trim() !== "")
    : ["https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=600&auto=format&fit=crop"]; // beautiful default product placeholder

  const currentImageUrl = images[currentImageIndex];

  const [imageSrc, setImageSrc] = React.useState(currentImageUrl || "");

  React.useEffect(() => {
    setImageSrc(currentImageUrl || "");
    if (imgRef.current && imgRef.current.complete) {
      setImageLoading(false);
    } else {
      setImageLoading(true);
    }
  }, [currentImageUrl]);

  const handleImageError = () => {
    setImageLoading(false);
    const backupImg = product.backupImages?.[currentImageIndex];
    if (backupImg && imageSrc !== backupImg) {
      setImageSrc(backupImg);
    } else {
      setImageSrc("https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600&auto=format&fit=crop");
    }
  };

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  // Generate a direct WhatsApp link for this product
  const getWhatsAppLink = () => {
    const cleanPhone = whatsappNumber?.replace(/[^0-9]/g, "") || "59100000000"; // default fallback or simple number
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
      id={`product-card-${product.id}`}
      className="group flex flex-col h-full bg-white rounded-2xl sm:rounded-3xl border border-slate-200/60 hover:border-amber-500/60 shadow-xs hover:shadow-xl hover:shadow-slate-900/5 overflow-hidden cursor-pointer relative select-none transition-all duration-500 hover:-translate-y-1.5 hover:scale-102"
      onClick={() => onOpenDetails(product)}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: index * 0.03 }}
    >
      {/* Image Gallery Container */}
      <div className="relative aspect-square w-full bg-slate-50/50 overflow-hidden border-b border-slate-100">
        {/* Skeleton Shimmer Overlay */}
        {imageLoading && (
          <div className="absolute inset-0 bg-slate-100 flex items-center justify-center z-10 transition-opacity duration-300">
            <ImageIcon size={16} className="text-slate-300 animate-pulse" />
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.img
            key={currentImageIndex}
            ref={imgRef}
            src={imageSrc}
            alt={product.name}
            referrerPolicy="no-referrer"
            loading="lazy"
            onLoad={() => setImageLoading(false)}
            onError={handleImageError}
            initial={{ opacity: 0 }}
            animate={{ opacity: imageLoading ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-705 ease-[0.16,1,0.3,1] absolute inset-0 font-sans"
          />
        </AnimatePresence>

        {/* Subtle shadow overlay that activates on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        {/* Stock Availability Badge - Left side */}
        <span
          className={`absolute top-2 left-2 sm:top-4 sm:left-4 px-1.5 py-0.5 sm:px-2.5 sm:py-1 text-[7px] sm:text-[9px] font-extrabold tracking-wider rounded-md sm:rounded-full uppercase shadow-xs backdrop-blur-md border ${
            product.isAvailable
              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-500 border-rose-500/20"
          }`}
        >
          {product.isAvailable ? "Disponible" : "Sin Stock"}
        </span>

        {/* Video Badge - Right side */}
        {product.videoUrl && (
          <motion.div 
            className="absolute top-2 right-2 sm:top-4 sm:right-4 p-1 sm:p-2 bg-slate-900/90 backdrop-blur-md text-amber-400 rounded-full shadow-xs border border-white/10" 
            title="Tiene video demostrativo"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          >
            <Video size={10} className="sm:w-[11px] sm:h-[11px]" />
          </motion.div>
        )}

        {/* Image Counters & Navigation with dynamic slides indicator */}
        {images.length > 1 && (
          <>
            {/* Soft, small, precise prev side button */}
            <button
              onClick={handlePrevImage}
              className="absolute left-1.5 sm:left-3 top-1/2 -translate-y-1/2 w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-slate-800 shadow-md backdrop-blur-xs transition-all duration-300 opacity-0 group-hover:opacity-100 hover:scale-105 active:scale-95 z-10"
              aria-label="Anterior imagen"
            >
              <ChevronLeft size={12} className="stroke-[2.5]" />
            </button>
            <button
              onClick={handleNextImage}
              className="absolute right-1.5 sm:right-3 top-1/2 -translate-y-1/2 w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-slate-800 shadow-md backdrop-blur-xs transition-all duration-300 opacity-0 group-hover:opacity-100 hover:scale-105 active:scale-95 z-10"
              aria-label="Siguiente imagen"
            >
              <ChevronRight size={12} className="stroke-[2.5]" />
            </button>
            
            {/* Elegant pagination pill indicators */}
            <div className="absolute bottom-2.5 sm:bottom-4 left-1/2 -translate-x-1/2 flex gap-1 bg-slate-950/40 px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded-full backdrop-blur-xs z-10 opacity-75 group-hover:opacity-100 transition-opacity duration-300">
              {images.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-0.5 sm:h-1 rounded-full transition-all duration-300 ${
                    idx === currentImageIndex ? "bg-amber-400 w-2.5 sm:w-3" : "bg-white/45 w-1"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Content details */}
      <div className="flex flex-col flex-grow p-2.5 sm:p-4 md:p-5 bg-gradient-to-b from-white to-slate-50/20">
        {/* Category & SKU row */}
        <div className="flex justify-between items-center gap-1 mb-1 sm:mb-2 md:mb-2.5">
          <span className="px-1.5 py-0.5 sm:px-2 text-[7px] sm:text-[8px] uppercase tracking-widest font-black text-amber-700 bg-amber-500/8 rounded-md border border-amber-500/10">
            {product.category || "General"}
          </span>
          <span className="text-[7.5px] sm:text-[9px] font-mono font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1 sm:px-1.5 py-0.5 rounded" title="SKU único del producto">
            {product.sku}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-sans font-extrabold text-slate-900 text-xs sm:text-sm group-hover:text-amber-550 transition-colors tracking-tight line-clamp-1 mb-0.5 sm:mb-1 leading-snug">
          {product.name}
        </h3>

        {/* Short Description */}
        <p className="text-[10px] sm:text-xs text-slate-500 line-clamp-1 sm:line-clamp-2 mb-2 sm:mb-3 md:mb-4 flex-grow leading-tight sm:leading-relaxed">
          {product.description || "Este excelente producto está disponible en catálogo oficial."}
        </p>

        {/* Prices Row */}
        <div className="mt-auto border-t border-slate-100 pt-1.5 sm:pt-2 md:pt-3 flex flex-col gap-1 sm:gap-2 md:gap-2.5">
          {showPrices && !product.hidePrice ? (
            <div className="flex flex-wrap justify-between items-baseline gap-x-1 gap-y-0.5 py-0.5">
              <div className="min-w-0">
                <span className="block text-[7px] sm:text-[8px] text-slate-400 font-extrabold uppercase tracking-widest leading-none mb-0.5">Precio</span>
                <span className="text-xs sm:text-sm md:text-base font-black text-slate-900 tracking-tight leading-none whitespace-nowrap">
                  ${product.retailPrice.toLocaleString()}
                </span>
              </div>
              {product.wholesalePrice > 0 && (
                <div className="text-right">
                  <span className="block text-[7px] sm:text-[8px] text-slate-400 font-extrabold uppercase tracking-widest leading-none mb-0.5">Por mayor</span>
                  <span className="text-[9px] sm:text-[10px] md:text-xs font-bold text-emerald-600 bg-emerald-50 px-1 sm:px-1.5 py-0.5 rounded border border-emerald-500/15 leading-none whitespace-nowrap">
                    ${product.wholesalePrice.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg sm:rounded-xl py-1 md:py-2 px-1.5 md:px-3 text-center text-[9px] sm:text-[10px] md:text-[11px] font-bold text-amber-700 flex items-center justify-center gap-1 select-none leading-none shadow-3xs">
              <Tag size={10} className="text-amber-400" />
              <span>Consultar precios</span>
            </div>
          )}

          {/* Quick Contact buttons & details links */}
          <div className="grid grid-cols-2 gap-1 sm:gap-2 mt-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails(product);
              }}
              className="px-1.5 py-1.5 sm:px-2.5 sm:py-2 text-center text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-700 rounded-lg sm:rounded-xl transition-all cursor-pointer select-none active:scale-97"
            >
              Ficha
            </button>
            <a
              href={getWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                if (onWhatsAppInquiry) {
                  onWhatsAppInquiry(product);
                }
              }}
              className="flex items-center justify-center gap-1 sm:gap-1.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-extrabold text-[9px] sm:text-[10px] uppercase tracking-wider py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all shadow-sm shadow-emerald-500/10 cursor-pointer select-none active:scale-97"
            >
              <Phone size={10} className="stroke-[2.5]" />
              <span>Consultar</span>
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProductCard;
