"use client";


import { useEffect, useState } from "react";

interface PropertyInfo {
  address: string;
  addressForDisplay?: string;
  legalDescription?: string;
  acres?: string;
}

interface StreetLabelData {
  id: string;
  position: { lat: number; lng: number };
  text: string;
  rotation: number;
  isEditing: boolean;
}

interface PropertyInfoPanelProps {
  heading?: string;
  propertyInfo: PropertyInfo;
  onPropertyInfoChange: (info: PropertyInfo) => void;
  onAddressSearch: (address: string) => void;
  bubbleSize: number;
  onBubbleSizeChange: (size: number) => void;
  tailDirection: "left" | "right";
  onTailDirectionChange: (direction: "left" | "right") => void;
  hideUI: boolean;
  onHideUIChange: (hide: boolean) => void;
  showDocumentOverlay?: boolean;
  onShowDocumentOverlayChange?: (show: boolean) => void;
  isTailPinned: boolean;
  onIsTailPinnedChange: (pinned: boolean) => void;
  pinnedTailTipPosition?: { lat: number; lng: number };
  onPinnedTailTipPositionChange?: (
    position: { lat: number; lng: number } | undefined,
  ) => void;
  isRepositioningTail: boolean;
  onIsRepositioningTailChange: (repositioning: boolean) => void;
  streetLabels: StreetLabelData[];
  onStreetLabelsChange: (labels: StreetLabelData[]) => void;
  labelSize: number;
  onLabelSizeChange: (size: number) => void;
  mapCenter: { lat: number; lng: number };
  apn?: string[]; // APN numbers for land comparables
  documentFrameSize?: number; // For land comp document frame size
  onDocumentFrameSizeChange?: (size: number) => void; // For land comp document frame size
}

export function PropertyInfoPanel({
  heading = "Subject Location Map",
  propertyInfo,
  onPropertyInfoChange,
  onAddressSearch,
  bubbleSize,
  onBubbleSizeChange,
  tailDirection,
  onTailDirectionChange,
  hideUI,
  onHideUIChange,
  showDocumentOverlay,
  onShowDocumentOverlayChange,
  isTailPinned,
  onIsTailPinnedChange,
  pinnedTailTipPosition,
  onPinnedTailTipPositionChange,
  isRepositioningTail,
  onIsRepositioningTailChange,
  streetLabels,
  onStreetLabelsChange,
  labelSize,
  onLabelSizeChange,
  mapCenter,
  apn,
  documentFrameSize,
  onDocumentFrameSizeChange,
}: PropertyInfoPanelProps) {
  const [searchAddress, setSearchAddress] = useState("");

  useEffect(() => {
    setSearchAddress(propertyInfo.address || "");
  }, [propertyInfo.address]);

  const handleAddressChange = (value: string) => {
    setSearchAddress(value);
    const shouldSyncDisplay =
      !propertyInfo.addressForDisplay ||
      propertyInfo.addressForDisplay === propertyInfo.address;
    onPropertyInfoChange({
      ...propertyInfo,
      address: value,
      addressForDisplay: shouldSyncDisplay
        ? value
        : propertyInfo.addressForDisplay,
    });
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{heading}</h2>
      </div>

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
          value={propertyInfo.addressForDisplay ?? ""}
          onChange={(e) =>
            onPropertyInfoChange({
              ...propertyInfo,
              addressForDisplay: e.target.value,
            })
          }
          placeholder="360 SE Loop 338, Odessa, TX 79766"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Acres */}
      {propertyInfo.acres !== undefined && propertyInfo.acres !== "" && (
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
      )}

      {/* APN (for land comparables) */}
      {apn && apn.length > 0 && (
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            APN
          </label>
          <div className="space-y-1">
            {apn.map((apnValue, idx) => (
              <div
                key={idx}
                className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
              >
                {apnValue}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legal Description */}
      {propertyInfo.legalDescription !== undefined &&
        propertyInfo.legalDescription !== "" && (
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
        )}

      {/* Tail Pin Control */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Tail Pin
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              // Reposition tail tip: enter pin mode - user will click on map to place tail tip
              onIsRepositioningTailChange(true);
            }}
            className={`flex-1 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors ${
              isRepositioningTail
                ? "animate-pulse border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {isRepositioningTail
              ? "Click map to set tail tip..."
              : "📍 Reposition Tail Tip"}
          </button>
          <button
            onClick={() => {
              // Toggle tail pinning on/off
              onIsTailPinnedChange(!isTailPinned);
              if (!isTailPinned && onPinnedTailTipPositionChange) {
                // If enabling, keep existing position or set undefined
                onPinnedTailTipPositionChange(pinnedTailTipPosition);
              } else if (isTailPinned && onPinnedTailTipPositionChange) {
                // If disabling, clear position
                onPinnedTailTipPositionChange(undefined);
              }
              if (isRepositioningTail) {
                onIsRepositioningTailChange(false);
              }
            }}
            className={`rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors ${
              isTailPinned
                ? "border-green-500 bg-green-50 text-green-700"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
            title={
              isTailPinned ? "Disable tail pinning" : "Enable tail pinning"
            }
          >
            {isTailPinned ? "🔒" : "🔓"}
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          {isTailPinned
            ? pinnedTailTipPosition
              ? "Tail tip is pinned. Move bubble to stretch tail."
              : "Click 'Reposition Tail Tip' to set the pin location."
            : "Tail pinning is disabled."}
        </div>
      </div>

      {/* Labels Section */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Labels
        </label>
        {streetLabels.map((label, index) => (
          <div
            key={label.id}
            className="mb-2 rounded-md border border-gray-200 p-2"
          >
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                Label {index + 1}
              </label>
              {streetLabels.length > 1 && (
                <button
                  onClick={() => {
                    onStreetLabelsChange(
                      streetLabels.filter((l) => l.id !== label.id),
                    );
                  }}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              type="text"
              value={label.text}
              onChange={(e) => {
                onStreetLabelsChange(
                  streetLabels.map((l) =>
                    l.id === label.id ? { ...l, text: e.target.value } : l,
                  ),
                );
              }}
              placeholder="Enter label text..."
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        ))}
        <button
          onClick={() => {
            const newLabel: StreetLabelData = {
              id: `label-${Date.now()}-${Math.random()}`,
              position: mapCenter,
              text: "",
              rotation: 0,
              isEditing: false,
            };
            onStreetLabelsChange([...streetLabels, newLabel]);
          }}
          className="w-full rounded-md border-2 border-blue-500 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
        >
          Add Label +
        </button>
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

      {/* Tail Direction Control - only show when tail is not pinned */}
      {!isTailPinned && (
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
      )}

      {/* Label Size Controls */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Label Size
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onLabelSizeChange(Math.max(0.5, labelSize - 0.1))}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            title="Decrease label size"
          >
            −
          </button>
          <span className="min-w-[60px] text-center text-sm font-medium text-gray-700">
            {Math.round(labelSize * 100)}%
          </span>
          <button
            onClick={() => onLabelSizeChange(Math.min(2.0, labelSize + 0.1))}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            title="Increase label size"
          >
            +
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Base: 36px (100%) | Max: 72px (200%)
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
        {onShowDocumentOverlayChange && (
          <>
            <button
              onClick={() => onShowDocumentOverlayChange(!showDocumentOverlay)}
              className={`mt-2 w-full rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${
                showDocumentOverlay
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {showDocumentOverlay
                ? "✓ Document Frame Visible"
                : heading === "Land Comparable Map"
                  ? "Show 1.57:1 Document Frame"
                  : "Show 8.5×11\" Document Frame"}
            </button>
            {showDocumentOverlay &&
              documentFrameSize !== undefined &&
              onDocumentFrameSizeChange && (
                <div className="mt-3">
                  <label className="mb-2 block text-xs font-medium text-gray-700">
                    Frame Size
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() =>
                        onDocumentFrameSizeChange(
                          Math.max(0.5, documentFrameSize - 0.1),
                        )
                      }
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      title="Decrease frame size"
                    >
                      −
                    </button>
                    <span className="min-w-[60px] text-center text-sm font-medium text-gray-700">
                      {Math.round(documentFrameSize * 100)}%
                    </span>
                    <button
                      onClick={() =>
                        onDocumentFrameSizeChange(
                          Math.min(2.0, documentFrameSize + 0.1),
                        )
                      }
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      title="Increase frame size"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
          </>
        )}
        <div className="mt-2 text-xs text-gray-500">
          {hideUI
            ? "All buttons and controls are hidden. Ready to take a screenshot!"
            : "Toggle to hide all UI elements for clean screenshots"}
          {showDocumentOverlay &&
            (heading === "Land Comparable Map"
              ? " The document frame shows a 1.57:1 aspect ratio area."
              : " The document frame shows the 8.5×11\" area that will fit on a Google Doc page.")}
        </div>
      </div>

    </div>
  );
}

