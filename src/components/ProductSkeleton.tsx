/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion } from "motion/react";

/**
 * Single skeleton card that perfectly mirrors the proportions,
 * paddings, spacing, borders, aspect ratios, and grid structure
 * of the live ProductCard component.
 */
export const ProductCardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-100 hover:border-amber-400/80 shadow-xs overflow-hidden relative">
      {/* Aspect-Square Image Box */}
      <div className="relative aspect-square w-full bg-slate-200 animate-pulse overflow-hidden">
        {/* Availability Badge Mockup */}
        <div className="absolute top-3 left-3 w-18 h-5.5 rounded-lg bg-slate-300/80 animate-pulse" />
        
        {/* Play/Video Icon Mockup if the real layout has it */}
        <div className="absolute top-3 right-3 w-8 h-8 rounded-xl bg-slate-300/80 animate-pulse" />
      </div>

      {/* Content Details Block */}
      <div className="flex flex-col flex-grow p-4.5 bg-gradient-to-b from-white to-slate-25/20">
        {/* Category & SKU row */}
        <div className="flex justify-between items-center gap-2 mb-2.5">
          <div className="w-16 h-4.5 bg-slate-200 rounded-md animate-pulse" />
          <div className="w-20 h-4.5 bg-slate-200 rounded-md animate-pulse" />
        </div>

        {/* Title Line */}
        <div className="w-11/12 h-5 bg-slate-300 rounded-md mb-2 animate-pulse" />

        {/* Two-line short description */}
        <div className="space-y-1.5 mb-5 flex-grow">
          <div className="w-full h-3.5 bg-slate-200 rounded-md animate-pulse" />
          <div className="w-5/6 h-3.5 bg-slate-200 rounded-md animate-pulse" />
        </div>

        {/* Price & Buy Buttons Container with border separator */}
        <div className="mt-auto border-t border-slate-100 pt-3.5 flex flex-col gap-3">
          {/* Prices Row */}
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <div className="w-8 h-2.5 bg-slate-200 rounded-sm animate-pulse" />
              <div className="w-16 h-6 bg-slate-300 rounded-md animate-pulse" />
            </div>
            <div className="space-y-1 flex flex-col items-end">
              <div className="w-12 h-2.5 bg-slate-200 rounded-sm animate-pulse" />
              <div className="w-14 h-5.5 bg-slate-200 rounded-md animate-pulse" />
            </div>
          </div>

          {/* Quick Contact & Info Grid Buttons */}
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div className="h-8.5 bg-slate-200 rounded-xl animate-pulse" />
            <div className="h-8.5 bg-slate-200 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Entire page-level container skeleton structure mimicking the header section,
 * category selectors, list status header, and product grid.
 */
export const CatalogSkeleton: React.FC = () => {
  return (
    <div className="flex-grow w-full pb-16">
      {/* mimic StoreHeader Banner Area */}
      <div className="bg-slate-900 pt-6 pb-8 px-4 sm:px-6 lg:px-8 border-b border-slate-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-radial from-slate-800/30 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-5 justify-between">
          <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
            {/* Logo/Avatar pulsecircle */}
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-3 border-slate-700 bg-slate-800 animate-pulse shrink-0" />
            <div className="space-y-2">
              {/* Store Name Title */}
              <div className="w-56 h-6.5 bg-slate-750 rounded-lg animate-pulse mx-auto md:mx-0" />
              {/* Description */}
              <div className="w-40 h-4 bg-slate-800 rounded-md animate-pulse mx-auto md:mx-0" />
            </div>
          </div>
          
          {/* Action pill widgets */}
          <div className="flex flex-wrap gap-2.5 justify-center">
            <div className="w-24 h-7 bg-slate-800 rounded-full animate-pulse" />
            <div className="w-24 h-7 bg-slate-800 rounded-full animate-pulse" />
          </div>
        </div>
      </div>

      {/* mimic Filters & Category select bar */}
      <div className="bg-white border-b border-slate-200/65 py-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 rounded-b-3xl shadow-3xs mb-7">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Search bar skeleton */}
          <div className="w-full md:w-96 h-10.5 bg-slate-100 rounded-2xl animate-pulse" />
          
          {/* Categories slides */}
          <div className="flex gap-2 overflow-hidden w-full md:w-auto self-start md:self-auto pb-1 md:pb-0 scrollbar-none">
            <div className="w-14 h-8 bg-slate-200 rounded-full animate-pulse shrink-0" />
            <div className="w-20 h-8 bg-slate-200 rounded-full animate-pulse shrink-0" />
            <div className="w-24 h-8 bg-slate-200 rounded-full animate-pulse shrink-0" />
            <div className="w-18 h-8 bg-slate-200 rounded-full animate-pulse shrink-0" />
          </div>
        </div>
      </div>

      {/* Container wrapper for product headers and grids */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* List status label bar */}
        <div className="flex justify-between items-center mb-6">
          <div className="w-36 h-5.5 bg-slate-200 rounded-md animate-pulse" />
          <div className="w-16 h-5 bg-slate-200 rounded-md animate-pulse" />
        </div>

        {/* Skeletons Product Card Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
            >
              <ProductCardSkeleton />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
