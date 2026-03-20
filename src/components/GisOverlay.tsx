"use client";

import React, { useState, useEffect } from "react";
import { XMarkIcon, AdjustmentsHorizontalIcon, CursorArrowRaysIcon, ArrowsPointingOutIcon } from "@heroicons/react/24/outline";

interface GisOverlayProps {
  initialUrl: string;
  onClose: () => void;
  visible?: boolean;
  position?: "fixed" | "absolute";
}

export function GisOverlay({ initialUrl, onClose, visible = true, position = "fixed" }: GisOverlayProps) {
  const [url, setUrl] = useState(initialUrl);
  const [opacity, setOpacity] = useState(50);
  const [isMapInteractive, setIsMapInteractive] = useState(false); // Default to adjusting GIS

  // Update URL if initialUrl changes (e.g. user clicks different comp)
  useEffect(() => {
    setUrl(initialUrl);
  }, [initialUrl]);

  return (
    <div 
        className={`${position} inset-0 z-50 flex flex-col pointer-events-none ${!visible ? 'hidden' : ''}`}
    >
      {/* Function Bar - Always Interactive */}
      <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm shadow-lg border-b border-gray-200 dark:border-gray-700 pointer-events-auto p-4 flex flex-col sm:flex-row items-center gap-4 transition-colors">
        
        <div className="flex-1 flex items-center gap-2 w-full">
            <span className="font-semibold whitespace-nowrap hidden sm:block dark:text-gray-200">GIS Overlay</span>
            <input 
                type="text" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 min-w-[200px] border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter Map URL..."
            />
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
            {/* Opacity Control */}
            <div className="flex items-center gap-2">
                <AdjustmentsHorizontalIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
                <span className="text-xs w-8 dark:text-gray-400">{opacity}%</span>
            </div>

            {/* Mode Toggle */}
            <button
                onClick={() => setIsMapInteractive(!isMapInteractive)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border shadow-sm ${
                    isMapInteractive 
                    ? "bg-green-100 text-green-800 border-green-200 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
                    : "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
                }`}
                title={isMapInteractive ? "Click to Adjust GIS Map" : "Click to Draw on Main Map"}
            >
                {isMapInteractive ? (
                    <>
                        <CursorArrowRaysIcon className="h-4 w-4" />
                        <span>Trace Mode</span>
                    </>
                ) : (
                    <>
                        <ArrowsPointingOutIcon className="h-4 w-4" />
                        <span>Align GIS</span>
                    </>
                )}
            </button>

            <button 
                onClick={onClose}
                className="p-1.5 hover:bg-red-100 text-gray-500 hover:text-red-600 rounded-full transition-colors dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                title="Close Overlay"
            >
                <XMarkIcon className="h-6 w-6" />
            </button>
        </div>
      </div>

      {/* Iframe Container */}
      <div 
        className="flex-1 w-full relative"
        style={{ 
            pointerEvents: isMapInteractive ? "none" : "auto",
            opacity: opacity / 100 
        }}
      >
        <iframe 
            src={url} 
            className="w-full h-full border-none"
            title="GIS Overlay"
        />
        
        {/* Helper overlay text when in trace mode to signal pass-through */}
        {!isMapInteractive && (
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center pointer-events-none">
                <div className="bg-black/50 text-white px-4 py-2 rounded-full backdrop-blur text-sm font-medium opacity-0 hover:opacity-100 transition-opacity">
                    Align Mode Active - Interact with this map
                </div>
             </div>
        )}
      </div>
    </div>
  );
}
