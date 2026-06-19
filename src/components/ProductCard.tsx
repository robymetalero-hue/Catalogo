/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Product } from "../types";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Video, Phone, Tag } from "lucide-react";
import { motion } from "motion/react";

interface ProductCardProps {
  product: Product;
  showPrices: boolean;
  whatsappNumber?: string;
  whatsappCustomMessage?: string;
  onOpenDetails: (product: Product) => void;
  onWhatsAppInquiry?: (product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  showPrices,
  whatsappNumber,
  whatsappCustomMessage,
  onOpenDetails,
  onWhatsAppInquiry,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(true);

  const images = product.images && product.images.length > 0
    ? product.images
    : ["https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=600&auto=format&fit=crop"]; // beautiful default product placeholder

  const currentImageUrl = images[currentImageIndex];

  React.useEffect(() => {
    setImageLoading(true);
  }, [currentImageUrl]);

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
    const resolvedText = customText
      .replace("{productName}", product.name)
      .replace("{productSku}", product.sku);
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(resolvedText)}`;
  };

  return (
    <motion.div
      id={`product-card-${product.id}`}
      className="group flex flex-col h-full bg-white rounded-2xl border border-slate-100 hover:border-amber-400/80 shadow-xs hover:shadow-xl overflow-hidden cursor-pointer relative animate-fade-in transition-shadow duration-300"
      onClick={() => onOpenDetails(product)}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10px" }}
      whileHover={{ scale: 1.012 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Image Gallery Container */}
      <div className="relative aspect-square w-full bg-slate-100 overflow-hidden">
        {/* Skeleton Shimmer Overlay */}
        {imageLoading && (
          <div className="absolute inset-0 bg-slate-200/90 flex items-center justify-center z-10 transition-opacity duration-300">
            <ImageIcon size={24} className="text-slate-400 animate-pulse" />
          </div>
        )}

        <img
          src={images[currentImageIndex]}
          alt={product.name}
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => setImageLoading(false)}
          className={`w-full h-full object-cover transition-all duration-500 ease-out font-sans group-hover:scale-106 ${imageLoading ? 'opacity-0 scale-98 blur-xs' : 'opacity-100 scale-100 blur-none'}`}
        />

        {/* Subtle hover zoom overlay for absolute premium feel */}
        <div className="absolute inset-0 bg-black/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Stock Availability Badge */}
        <span
          className={`absolute top-3 left-3 px-2.5 py-1 text-[10px] font-bold tracking-wider rounded-lg uppercase shadow-xs ${
            product.isAvailable
              ? "bg-slate-900/90 text-emerald-400 backdrop-blur-xs border border-emerald-500/20"
              : "bg-rose-550/95 text-white shadow-md shadow-rose-500/10"
          }`}
        >
          {product.isAvailable ? "Disponible" : "Sin Stock"}
        </span>

        {/* Video Badge */}
        {product.videoUrl && (
          <motion.div 
            className="absolute top-3 right-3 p-2 bg-slate-950/85 backdrop-blur-xs text-amber-500 rounded-xl shadow-sm border border-white/10" 
            title="Tiene video demostrativo"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          >
            <Video size={13} />
          </motion.div>
        )}

        {/* Image Counters & Navigation */}
        {images.length > 1 && (
          <>
            <motion.button
              onClick={handlePrevImage}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-white/90 hover:bg-white text-slate-800 shadow-sm backdrop-blur-xs transition-colors opacity-0 group-hover:opacity-100"
              aria-label="Anterior imagen"
            >
              <ChevronLeft size={14} />
            </motion.button>
            <motion.button
              onClick={handleNextImage}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-white/90 hover:bg-white text-slate-800 shadow-sm backdrop-blur-xs transition-colors opacity-0 group-hover:opacity-100"
              aria-label="Siguiente imagen"
            >
              <ChevronRight size={14} />
            </motion.button>
            <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 flex gap-1.5 bg-slate-950/45 px-2.5 py-1.5 rounded-full backdrop-blur-xs">
              {images.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentImageIndex ? "bg-amber-400 w-3" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Content details */}
      <div className="flex flex-col flex-grow p-4.5 bg-gradient-to-b from-white to-slate-25/30">
        {/* Category & SKU */}
        <div className="flex justify-between items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 text-[9px] uppercase tracking-wider font-extrabold text-amber-700 bg-amber-50 rounded-md border border-amber-500/10">
            {product.category || "General"}
          </span>
          <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-sm" title="SKU único">
            SKU: {product.sku}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-sans font-bold text-slate-900 text-sm group-hover:text-amber-600 transition-colors tracking-tight line-clamp-1 mb-1">
          {product.name}
        </h3>

        {/* Short Description */}
        <p className="text-xs text-slate-500 line-clamp-2 mb-4 flex-grow leading-relaxed">
          {product.description || "Sin descripción detallada disponible."}
        </p>

        {/* Prices Row */}
        <div className="mt-auto border-t border-slate-100/80 pt-3.5 flex flex-col gap-2">
          {showPrices ? (
            <div className="flex justify-between items-end">
              <div>
                <span className="block text-[9px] text-slate-400 font-extrabold uppercase tracking-widest leading-none mb-1">Unidad</span>
                <span className="text-lg font-extrabold text-slate-950 tracking-tight leading-none">
                  ${product.retailPrice.toLocaleString()}
                </span>
              </div>
              {product.wholesalePrice > 0 && (
                <div className="text-right">
                  <span className="block text-[9px] text-slate-400 font-extrabold uppercase tracking-widest leading-none mb-1">Por Mayor</span>
                  <span className="text-sm font-bold text-emerald-600 leading-none">
                    ${product.wholesalePrice.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-amber-50/40 border border-amber-500/15 rounded-xl py-2 px-3 text-center text-xs font-semibold text-amber-800 flex items-center justify-center gap-1.5">
              <Tag size={12} className="text-amber-500 animate-pulse" />
              <span>Consultar precios</span>
            </div>
          )}

          {/* Quick Contact buttons & details links */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails(product);
              }}
              className="px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl transition-all"
            >
              Ver ficha
            </motion.button>
            <motion.a
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              href={getWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                if (onWhatsAppInquiry) {
                  onWhatsAppInquiry(product);
                }
              }}
              className="flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[11px] uppercase tracking-wider py-2 rounded-xl transition-all shadow-md shadow-emerald-500/10"
            >
              <Phone size={12} />
              <span>Consultar</span>
            </motion.a>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProductCard;
