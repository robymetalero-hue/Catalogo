/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { StoreConfig } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { MapPin, Phone, MessageSquare, ExternalLink, Calendar, ShieldCheck, HelpCircle, ImageIcon, Compass } from "lucide-react";

interface StoreLocationSectionProps {
  storeConfig: StoreConfig;
}

export default function StoreLocationSection({ storeConfig }: StoreLocationSectionProps) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  const images = storeConfig.storeImages && storeConfig.storeImages.length > 0
    ? storeConfig.storeImages
    : [];

  const getWhatsAppLink = () => {
    const cleanPhone = storeConfig.whatsappNumber || "59100000000";
    const msg = encodeURIComponent("¡Hola! Me gustaría coordinar una visita a su sucursal física.");
    return `https://wa.me/${cleanPhone}?text=${msg}`;
  };

  const hasPhotos = images.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4 }}
      className="space-y-8 text-left"
    >
      {/* Upper Grid Layout: Photo display and main data panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Store Photos Gallery Grid / Carousel (7 cols) */}
        <div id="store-photos-panel" className="lg:col-span-7 space-y-4">
          <div className="border border-slate-200/80 bg-white p-3 rounded-3xl shadow-3xs">
            <div className="relative aspect-16/10 rounded-2xl overflow-hidden bg-slate-900 group">
              {hasPhotos ? (
                <>
                  <motion.img
                    key={activePhotoIndex}
                    initial={{ opacity: 0, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    src={images[activePhotoIndex]}
                    alt={`Sucursal ${activePhotoIndex + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Badge Counter */}
                  <div className="absolute bottom-4 right-4 bg-slate-950/80 backdrop-blur-md text-white font-mono text-[10px] font-bold px-3 py-1.5 rounded-full select-none">
                    {activePhotoIndex + 1} / {images.length}
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-3">
                    <ImageIcon size={22} className="text-slate-500" />
                  </div>
                  <h4 className="font-sans font-bold text-slate-200 uppercase tracking-wide text-xs">Sin Fotografías Disponibles</h4>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-xs leading-relaxed">Sube fotos de la sucursal física desde los Ajustes del Panel de Administrador para que aparezcan aquí.</p>
                </div>
              )}
            </div>

            {/* Thumbnail Selection Strip */}
            {hasPhotos && images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActivePhotoIndex(idx)}
                    className={`relative w-20 h-14 rounded-xl overflow-hidden border-2 shrink-0 transition-all ${
                      activePhotoIndex === idx ? "border-amber-500 scale-102" : "border-slate-100 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={img} alt="Thumbnail preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Direction Details & Interactive Quick Call Routing (5 cols) */}
        <div id="store-direction-panel" className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-3xs space-y-6">
            <div>
              <span className="text-[10px] px-2.5 py-1 bg-amber-500/10 text-amber-700 rounded-full font-bold uppercase tracking-wider mb-2.5 inline-block select-none">Dirección Certificada</span>
              <h3 className="font-sans font-extrabold text-slate-900 text-lg uppercase tracking-tight leading-none">
                {storeConfig.storeName || "Nuestra Sucursal"}
              </h3>
              <p className="text-slate-500 text-xs font-medium mt-1 leading-relaxed">Visítanos en nuestra sucursal y obtén atención inmediata.</p>
            </div>

            {/* Address Row Info Card */}
            <div className="flex items-start gap-3.5 bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <MapPin size={18} />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Dirección Física</span>
                <p className="text-slate-800 text-xs font-semibold leading-relaxed">
                  {storeConfig.address || "La tienda no ha especificado una dirección comercial en la base de datos."}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-2">
              {storeConfig.locationUrl ? (
                <a
                  href={storeConfig.locationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-2xl shadow-md hover:shadow-lg transition-all"
                >
                  <Compass size={14} className="animate-pulse" />
                  <span>Cómo llegar con Google Maps</span>
                  <ExternalLink size={12} />
                </a>
              ) : (
                <div className="text-center p-3.5 border border-slate-100 rounded-2xl bg-rose-50/50">
                  <span className="text-[10px] font-semibold text-rose-500">Google Maps no configurado</span>
                  <p className="text-[9px] text-slate-400 mt-0.5">La tienda no ha activado coordenadas ni enlace de navegación.</p>
                </div>
              )}

              {storeConfig.whatsappNumber && (
                <a
                  href={getWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 hover:text-emerald-700 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all"
                >
                  <MessageSquare size={14} />
                  <span>Coordinar Visita por WhatsApp</span>
                </a>
              )}
            </div>
          </div>

          {/* Quick Schedule Information */}
          <div className="bg-slate-900 border border-slate-800 text-slate-350 rounded-3xl p-5 shadow-sm space-y-3.5 text-xs">
            <div className="flex items-center gap-2 text-white">
              <Calendar size={14} className="text-amber-500" />
              <span className="font-bold uppercase tracking-wider text-[10px]">Horarios de Atención General</span>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 font-medium">
                <span>Lunes a Viernes:</span>
                <span className="text-white font-semibold">09:00 AM - 07:00 PM</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 font-medium">
                <span>Sábados:</span>
                <span className="text-white font-semibold">10:00 AM - 04:00 PM</span>
              </div>
              <div className="flex items-center justify-between font-medium">
                <span>Domingos y Feriados:</span>
                <span className="text-amber-500 hover:underline font-bold">Cerrado</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Decorative Mock Map Background for premium editorial feel */}
      <div className="bg-slate-100 border border-slate-200 rounded-3xl overflow-hidden h-[240px] relative flex items-center justify-center shadow-3xs p-6 text-center select-none">
        <div className="absolute inset-0 opacity-15 mix-blend-overlay bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-100/90 via-slate-100/10 to-slate-100/90" />
        
        <div className="relative z-10 space-y-2 max-w-sm">
          <div className="w-10 h-10 rounded-full bg-slate-950 text-white flex items-center justify-center mx-auto shadow-sm">
            <MapPin size={18} className="text-amber-400" />
          </div>
          <h4 className="font-sans font-extrabold text-slate-800 uppercase tracking-tight text-xs">Navegador Georreferencial</h4>
          <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
            Pulsa el botón de Google Maps de arriba para abrir tu aplicación de GPS preferida y navegar directo a nuestra tienda física.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
