/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Store, MapPin, Phone, MessageSquare, Info, ExternalLink } from "lucide-react";
import { StoreConfig } from "../types";

interface StoreFooterProps {
  storeConfig: StoreConfig;
  onOpenLocation: () => void;
  onOpenLogin: () => void;
}

export default function StoreFooter({ storeConfig, onOpenLocation, onOpenLogin }: StoreFooterProps) {
  const getWhatsAppLink = () => {
    const cleanPhone = storeConfig.whatsappNumber || "59100000000";
    const msg = encodeURIComponent("¡Hola! Estaba viendo tu catálogo virtual y me gustaría hacer una consulta general.");
    return `https://wa.me/${cleanPhone}?text=${msg}`;
  };

  return (
    <footer className="w-full bg-slate-900 border-t border-slate-800 text-slate-300 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-8 border-b border-slate-800">
          
          {/* Col 1: Store Intro branding */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                <Store size={16} />
              </div>
              <span className="font-sans font-bold text-white text-base tracking-wide uppercase">
                {storeConfig.storeName || "Mi Tienda Virtual"}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              Explora nuestro catálogo virtual oficial con total disponibilidad de fotos, videos y precios actualizados para compras minoristas y de distribución mayoristas.
            </p>
          </div>

          {/* Col 2: Actionable directions card (Google Maps) */}
          <div className="space-y-4">
            <span className="text-xs font-semibold text-white uppercase tracking-wider block">Ubicación y Dirección</span>
            <div className="bg-slate-850 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-start gap-2.5">
                <MapPin size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs font-semibold text-slate-100 block mb-0.5">Visita nuestra sucursal física</span>
                  <span className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {storeConfig.address || "Dirección no especificada aún."}
                  </span>
                </div>
              </div>

              {storeConfig.locationUrl && (
                <button
                  onClick={onOpenLocation}
                  className="flex items-center justify-center gap-1.5 w-full py-1.8 bg-amber-500 hover:bg-amber-600 text-slate-950 hover:text-white rounded-lg text-xs font-semibold uppercase tracking-wider transition-all"
                >
                  <span>Cómo llegar (Google Maps)</span>
                  <ExternalLink size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Col 3: Direct communication triggers */}
          <div className="space-y-4">
            <span className="text-xs font-semibold text-white uppercase tracking-wider block">Canales de Atención Directa</span>
            <div className="space-y-2">
              {storeConfig.whatsappNumber && (
                <a
                  href={getWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs font-medium transition-colors"
                >
                  <MessageSquare size={14} />
                  <span>Chatear vía WhatsApp Directo</span>
                </a>
              )}
              {storeConfig.phone && (
                <a
                  href={`tel:${storeConfig.phone}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium transition-colors"
                >
                  <Phone size={14} />
                  <span>Llamar al número {storeConfig.phone}</span>
                </a>
              )}
            </div>
          </div>

        </div>

        {/* Bottom copyright and status disclosures */}
        <div className="pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] text-slate-500 gap-4 select-none">
          <span 
            onDoubleClick={onOpenLogin}
            title="Doble clic para administrador" 
            className="cursor-default"
          >
            &copy; {new Date().getFullYear()} {storeConfig.storeName || "Mi Tienda Virtual"}. Todos los derechos reservados
            <button
              onClick={onOpenLogin}
              type="button"
              className="text-[#64748b] bg-transparent border-0 p-0 ml-0.5 focus:outline-hidden inline font-semibold text-[11px] transition-colors focus:ring-1 focus:ring-slate-800 rounded px-1 active:scale-95 cursor-default hover:text-amber-500/20"
              style={{ contentVisibility: "auto", cursor: "default" }}
            >
              .
            </button>
          </span>
          <div className="flex items-center gap-1.5 bg-slate-855 px-2.5 py-1 rounded-md text-slate-400">
            <Info size={12} />
            <span>Los clientes no realizan pagos directamente en este catálogo. Completa tu orden por WhatsApp.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
