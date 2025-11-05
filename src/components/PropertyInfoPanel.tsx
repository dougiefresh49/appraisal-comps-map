"use client";

import { useState } from "react";

interface PropertyInfo {
  address: string;
  legalDescription: string;
  acres?: string;
}

interface PropertyInfoPanelProps {
  propertyInfo: PropertyInfo;
  onPropertyInfoChange: (info: PropertyInfo) => void;
  onAddressSearch: (address: string) => void;
  bubbleSize: number;
  onBubbleSizeChange: (size: number) => void;
  tailDirection: "left" | "right";
  onTailDirectionChange: (direction: "left" | "right") => void;
  hideUI: boolean;
  onHideUIChange: (hide: boolean) => void;
}

export function PropertyInfoPanel({
  propertyInfo,
  onPropertyInfoChange,
  onAddressSearch,
  bubbleSize,
  onBubbleSizeChange,
  tailDirection,
  onTailDirectionChange,
  hideUI,
  onHideUIChange,
}: PropertyInfoPanelProps) {
  const [searchAddress, setSearchAddress] = useState("");

  const handleAddressChange = (value: string) => {
    setSearchAddress(value);
    onPropertyInfoChange({ ...propertyInfo, address: value });
  };

  const handleSearch = () => {
    if (searchAddress.trim()) {
      onAddressSearch(searchAddress);
    }
  };

  const handleLegalDescriptionChange = (value: string) => {
    onPropertyInfoChange({ ...propertyInfo, legalDescription: value });
  };

  const handleAcresChange = (value: string) => {
    onPropertyInfoChange({ ...propertyInfo, acres: value });
  };

  return (
    <div className="w-80 border-r border-gray-300 bg-white p-6 shadow-lg">
      <h2 className="mb-4 text-xl font-bold">Subject Location Map</h2>

      {/* Address Search */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Address
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchAddress}
            onChange={(e) => handleAddressChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
            placeholder="Enter address or search..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSearch}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Search
          </button>
        </div>
      </div>

      {/* Address Display */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Address (for display)
        </label>
        <input
          type="text"
          value={propertyInfo.address}
          onChange={(e) =>
            onPropertyInfoChange({ ...propertyInfo, address: e.target.value })
          }
          placeholder="360 SE Loop 338, Odessa, TX 79766"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Acres */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Acres
        </label>
        <input
          type="text"
          value={propertyInfo.acres || ""}
          onChange={(e) => handleAcresChange(e.target.value)}
          placeholder="9.834"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Legal Description */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Legal Description
        </label>
        <textarea
          value={propertyInfo.legalDescription}
          onChange={(e) => handleLegalDescriptionChange(e.target.value)}
          placeholder="GUNSMOKE SUB BLOCK 1 LOT 1 & 2"
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Bubble Size Controls */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Bubble Size
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onBubbleSizeChange(Math.max(0.5, bubbleSize - 0.1))}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            title="Decrease bubble size"
          >
            −
          </button>
          <span className="min-w-[60px] text-center text-sm font-medium text-gray-700">
            {Math.round(bubbleSize * 100)}%
          </span>
          <button
            onClick={() =>
              onBubbleSizeChange(Math.min(1.667, bubbleSize + 0.1))
            }
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            title="Increase bubble size"
          >
            +
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Base: 400×200px (100%) | Max: ~667×333px (167%)
        </div>
      </div>

      {/* Tail Direction Control */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Tail Direction
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => onTailDirectionChange("left")}
            className={`flex-1 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors ${
              tailDirection === "left"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            ← Left
          </button>
          <button
            onClick={() => onTailDirectionChange("right")}
            className={`flex-1 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors ${
              tailDirection === "right"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            Right →
          </button>
        </div>
      </div>

      {/* Screenshot Mode Toggle */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Screenshot Mode
        </label>
        <button
          onClick={() => onHideUIChange(!hideUI)}
          className={`w-full rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${
            hideUI
              ? "border-green-500 bg-green-50 text-green-700"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          {hideUI
            ? "✓ UI Hidden (Ready for Screenshot)"
            : "Hide UI for Screenshot"}
        </button>
        <div className="mt-2 text-xs text-gray-500">
          {hideUI
            ? "All buttons and controls are hidden. Ready to take a screenshot!"
            : "Toggle to hide all UI elements for clean screenshots"}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 rounded-md bg-blue-50 p-4 text-sm text-blue-900">
        <p className="mb-2 font-semibold">Instructions:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Search for an address or click on the map to set marker</li>
          <li>Click "Draw Polygon" to draw property boundaries</li>
          <li>Drag the bubble marker to reposition it</li>
          <li>Fill in address and legal description above</li>
        </ul>
      </div>
    </div>
  );
}
