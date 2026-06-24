/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Image as ImageIcon } from "lucide-react";
import { motion } from "motion/react";

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  rootMargin?: string;
  threshold?: number;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  className = "",
  fallbackSrc = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600&auto=format&fit=crop",
  rootMargin = "150px", // Load slightly before entering viewport for a seamless experience
  threshold = 0.01,
  onError,
  onLoad,
  ...props
}) => {
  const [isInView, setIsInView] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentContainer = containerRef.current;
    if (!currentContainer) return;

    // Browser feature detection for IntersectionObserver
    if (!("IntersectionObserver" in window)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.unobserve(currentContainer);
          }
        });
      },
      {
        rootMargin,
        threshold,
      }
    );

    observer.observe(currentContainer);

    return () => {
      if (currentContainer) {
        observer.unobserve(currentContainer);
      }
    };
  }, [rootMargin, threshold]);

  // Once in view, trigger the image load
  useEffect(() => {
    if (isInView && src) {
      setCurrentSrc(src);
    }
  }, [isInView, src]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setIsLoaded(true);
    if (onLoad) onLoad(e);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // If the image fails to load, try to fallback
    if (currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
    } else {
      setIsLoaded(true); // stop showing loading animation if fallback also fails
    }
    if (onError) onError(e);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-slate-50 flex items-center justify-center"
    >
      {/* Loading Skeleton / Placeholder */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-slate-100 flex items-center justify-center z-10 transition-opacity duration-300">
          <motion.div
            animate={{ opacity: [0.4, 0.75, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            className="flex flex-col items-center gap-2"
          >
            <ImageIcon size={18} className="text-slate-300" />
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest select-none">
              Cargando...
            </span>
          </motion.div>
        </div>
      )}

      {/* Actual Image */}
      {isInView && currentSrc && (
        <motion.img
          src={currentSrc}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{
            opacity: isLoaded ? 1 : 0,
            scale: isLoaded ? 1 : 1.02,
          }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={`${className} ${isLoaded ? "" : "invisible"}`}
          {...props}
        />
      )}
    </div>
  );
};

export default LazyImage;
