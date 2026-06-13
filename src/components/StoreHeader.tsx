/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Store, Search, Filter, Sparkles, MapPin, Phone } from "lucide-react";
import { StoreConfig } from "../types";
import { motion } from "motion/react";

interface StoreHeaderProps {
  storeConfig: StoreConfig;
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenLocation: () => void;
}

export default function StoreHeader({
  storeConfig,
  categories,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  onOpenLocation,
}: StoreHeaderProps) {
  return (
    <header className="w-full bg-white/95 border-b border-slate-100 sticky top-0 z-30 shadow-3xs backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        
        {/* Top Info line: Store description, phone call shortcut, location click */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 mb-4 text-xs text-slate-500 gap-2 font-medium">
          <div className="flex items-center gap-1.5">
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            >
              <Sparkles size={12} className="text-amber-500" />
            </motion.div>
            <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">Catálogo Oficial Virtual de Ventas</span>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            {storeConfig.phone && (
              <a href={`tel:${storeConfig.phone}`} className="hover:text-amber-605 transition-colors flex items-center gap-1.5 hover:underline text-slate-600 font-bold">
                <Phone size={11} className="text-amber-550" />
                <span>Llámamos: {storeConfig.phone}</span>
              </a>
            )}
            {storeConfig.address && (
              <button onClick={onOpenLocation} className="hover:text-amber-600 transition-colors flex items-center gap-1.5 text-left select-none font-semibold text-slate-500">
                <MapPin size={11} className="text-slate-400 shrink-0" />
                <span className="line-clamp-1">{storeConfig.address}</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Logo & Store Name */}
          <div className="flex items-center gap-3.5">
            <motion.div 
              whileHover={{ rotate: 5, scale: 1.05 }}
              className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 text-white flex items-center justify-center shadow-lg shadow-slate-900/10 shrink-0"
            >
              <Store size={22} className="text-amber-400" />
            </motion.div>
            <div>
              <h1 className="font-sans font-extrabold text-slate-950 text-xl tracking-tight leading-none uppercase">
                {storeConfig.storeName || "Mi Tienda Virtual"}
              </h1>
              <p className="text-[9px] uppercase tracking-widest font-extrabold text-slate-400 mt-1">
                Selecciona tus artículos y haz tu pedido
              </p>
            </div>
          </div>

          {/* Search Bar Input */}
          <div id="search-bar-container" className="relative w-full md:max-w-md">
            <span className="absolute left-3.5 top-3 text-slate-400">
              <Search size={15} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar por nombre, SKU o marca..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all bg-slate-50/70 hover:bg-slate-50/90 text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Tab-like categories layout with smooth layout spring-sliding */}
        <div id="category-scroller" className="mt-5 flex gap-2 overflow-x-auto pb-1.5 no-scrollbar scroll-smooth relative">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectCategory("Todos")}
            className={`px-4 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap tracking-wider transition-colors uppercase relative select-none ${
              selectedCategory === "Todos"
                ? "text-white"
                : "text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-100"
            }`}
          >
            <span className="relative z-10">Todos ({categories.length - 1 <= 0 ? "0" : categories.length - 1})</span>
            {selectedCategory === "Todos" && (
              <motion.div
                layoutId="activeCategoryPill"
                className="absolute inset-0 bg-amber-500 rounded-xl shadow-md shadow-amber-500/20"
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
              />
            )}
          </motion.button>
          
          {categories.filter(c => c !== "Todos").map((cat) => (
            <motion.button
              key={cat}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectCategory(cat)}
              className={`px-4 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap tracking-wider transition-colors uppercase relative select-none ${
                selectedCategory === cat
                  ? "text-white"
                  : "text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-100"
              }`}
            >
              <span className="relative z-10">{cat}</span>
              {selectedCategory === cat && (
                <motion.div
                  layoutId="activeCategoryPill"
                  className="absolute inset-0 bg-slate-900 rounded-xl shadow-lg shadow-black/10"
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                />
              )}
            </motion.button>
          ))}
        </div>

      </div>
    </header>
  );
}
