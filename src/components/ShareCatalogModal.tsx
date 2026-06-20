/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { motion, AnimatePresence } from "motion/react";
import { QrCode, X, Copy, Download, Check, ExternalLink, Share2 } from "lucide-react";

interface ShareCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeName: string;
}

export default function ShareCatalogModal({ isOpen, onClose, storeName }: ShareCatalogModalProps) {
  const [qrUrl, setQrUrl] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Get current application URL dynamically (handles both dev, pre and custom domains)
  const currentUrl = typeof window !== "undefined" 
    ? window.location.origin
    : "https://mis-tiendas.virtual";

  useEffect(() => {
    if (isOpen && currentUrl) {
      QRCode.toDataURL(currentUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: "#0f172a", // Slate-900 (deep background contrast)
          light: "#ffffff", // Pure white for perfect scanning contrast
        },
      })
        .then((url) => {
          setQrUrl(url);
          setErrorMsg("");
        })
        .catch((err) => {
          console.error("No se pudo generar el código QR:", err);
          setErrorMsg("Error al generar el código QR. Inténtalo de nuevo.");
        });
    }
  }, [isOpen, currentUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("No se pudo copiar el enlace:", err);
    }
  };

  const handleDownloadQr = () => {
    if (!qrUrl) return;
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = `QR_Catalogo_${storeName ? storeName.replace(/\s+/g, "_") : "Tienda"}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop mask */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative border border-slate-100 z-10 p-6 flex flex-col"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors border border-slate-100/50"
            >
              <X size={16} />
            </button>

            {/* Header Title */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <QrCode size={20} />
              </div>
              <div>
                <h3 className="font-sans font-bold text-slate-900 text-base leading-tight">Compartir Catálogo</h3>
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 mt-0.5">Atrae clientes físicos a tu tienda</p>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Imprime este código QR o compártelo para que tus clientes en tiendas físicas puedan escanearlo con el celular y ver tu catálogo digital al instante.
            </p>

            {/* QR Canvas / Image Render Box */}
            <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-100 p-6 rounded-2xl mb-5 space-y-3 relative">
              {errorMsg ? (
                <div className="text-xs text-rose-500 font-semibold">{errorMsg}</div>
              ) : qrUrl ? (
                <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm relative group">
                  <img
                    src={qrUrl}
                    alt={`Código QR para ${storeName}`}
                    referrerPolicy="no-referrer"
                    className="w-48 h-48 object-contain"
                  />
                  
                  {/* Visual helper badge */}
                  <div className="absolute inset-x-0 bottom-2 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="bg-slate-900 text-white text-[9px] px-2 py-1 rounded-md font-bold shadow-sm">
                      Clic Secundario para Guardar
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-48 h-48 flex items-center justify-center bg-white rounded-2xl border border-slate-100/50 animate-pulse">
                  <span className="w-6 h-6 rounded-full border-2 border-slate-350 border-t-transparent animate-spin" />
                </div>
              )}

              {/* Dynamic app URL readout */}
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-100 shadow-3xs rounded-full text-[10px] font-semibold text-slate-600 max-w-full">
                <span className="truncate max-w-[260px]">{currentUrl}</span>
                <ExternalLink size={10} className="text-slate-400" />
              </div>
            </div>

            {/* Share & Download actions */}
            <div className="grid grid-cols-2 gap-3 mb-1">
              <button
                onClick={handleCopyLink}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-xs font-bold text-slate-700 transition-all select-none"
              >
                {copied ? (
                  <>
                    <Check size={14} className="text-emerald-500" />
                    <span className="text-emerald-600">¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} className="text-slate-500" />
                    <span>Copiar Enlace</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadQr}
                disabled={!qrUrl}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 text-white text-xs font-bold transition-all shadow-md shadow-slate-900/10 disabled:opacity-50 select-none cursor-pointer"
              >
                <Download size={14} className="text-amber-400" />
                <span>Descargar QR</span>
              </button>
            </div>
            
            <div className="text-center mt-3.5 text-[10px] text-slate-400 font-medium">
              Sugerencia: puedes colocar este QR en volantes, vitrinas o mostradores de pago.
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
