"use client";


import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

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
  isEditing?: boolean;
}

interface PropertyInfoPanelProps {
  isCollapsed: boolean;
  onIsCollapsedChange: (isCollapsed: boolean) => void;
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
  onCaptureScreenshot?: () => void;
  onOpenGis?: (apn: string) => void;
  /** When true, map editing controls are disabled (view-only / another user holds lock). */
  readOnly?: boolean;
}

export function PropertyInfoPanel({
  isCollapsed,
  onIsCollapsedChange,
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
  onCaptureScreenshot,
  onOpenGis,
  readOnly = false,
}: PropertyInfoPanelProps) {
  const [searchAddress, setSearchAddress] = useState("");

  const handleOpenGis = (apns: string[]) => {
      // Use the first APN for now, or could let user pick if multiple
      const targetApn = apns && apns.length > 0 ? apns[0] : "";
      if (targetApn && onOpenGis) {
          onOpenGis(targetApn);
      }
  };

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
    <div 
        className={`relative z-[60] h-full overflow-y-auto border-r border-gray-300 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900 transition-all duration-300 ${
            isCollapsed ? "w-12 p-2" : "w-80 p-6"
        }`}
    >
      <div className={`mb-4 flex items-center ${isCollapsed ? "justify-center" : "justify-between gap-3"}`}>
        {!isCollapsed && <h2 className="text-lg font-semibold dark:text-gray-100 truncate" title={heading}>{heading}</h2>}
         <button
          onClick={() => onIsCollapsedChange(!isCollapsed)}
          className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
          title={isCollapsed ? "Expand Panel" : "Collapse Panel"}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
          )}
        </button>
      </div>

      <div className={isCollapsed ? "hidden" : ""}>

      {/* Address Search */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Address
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchAddress}
            readOnly={readOnly}
            onChange={(e) => handleAddressChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
            placeholder="Enter address or search..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-950 dark:text-gray-200 dark:focus:border-blue-400"
          />
          <button
            type="button"
            disabled={readOnly}
            onClick={handleSearch}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Search
          </button>
        </div>
      </div>

      {/* Address Display */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Address (for display)
        </label>
        <input
          type="text"
          value={propertyInfo.addressForDisplay ?? ""}
          readOnly={readOnly}
          onChange={(e) =>
            onPropertyInfoChange({
              ...propertyInfo,
              addressForDisplay: e.target.value,
            })
          }
          placeholder="360 SE Loop 338, Odessa, TX 79766"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-950 dark:text-gray-200 dark:focus:border-blue-400"
        />
      </div>

      {/* Acres */}
      {propertyInfo.acres !== undefined && propertyInfo.acres !== "" && (
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Acres
          </label>
          <input
            type="text"
            value={propertyInfo.acres || ""}
            readOnly={readOnly}
            onChange={(e) => handleAcresChange(e.target.value)}
            placeholder="9.834"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-950 dark:text-gray-200 dark:focus:border-blue-400"
          />
        </div>
      )}

      {/* APN (for land comparables) */}
      {apn && apn.length > 0 && (
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            APN
          </label>
          <div className="space-y-1">
            {apn.map((apnValue, idx) => (
              <div
                key={idx}
                className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {apnValue}
              </div>
            ))}
            <button
                type="button"
                disabled={readOnly}
                onClick={() => handleOpenGis(apn)}
                className="w-full rounded-md border border-indigo-500 text-indigo-700 bg-indigo-50 px-3 py-2 text-xs hover:bg-indigo-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700"
            >
                🌐 Open GIS Overlay
            </button>
          </div>
        </div>
      )}

      {/* Legal Description */}
      {propertyInfo.legalDescription !== undefined &&
        propertyInfo.legalDescription !== "" && (
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Legal Description
            </label>
            <textarea
              value={propertyInfo.legalDescription}
              readOnly={readOnly}
              onChange={(e) => handleLegalDescriptionChange(e.target.value)}
              placeholder="GUNSMOKE SUB BLOCK 1 LOT 1 & 2"
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-950 dark:text-gray-200 dark:focus:border-blue-400"
            />
          </div>
        )}

      {/* Tail Pin Control */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Tail Pin
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => {
              // Reposition tail tip: enter pin mode - user will click on map to place tail tip
              onIsRepositioningTailChange(true);
            }}
            className={`flex-1 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isRepositioningTail
                ? "animate-pulse border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            {isRepositioningTail
              ? "Click map to set tail tip..."
              : "📍 Reposition Tail Tip"}
          </button>
          <button
            type="button"
            disabled={readOnly}
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
            className={`rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isTailPinned
                ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
            title={
              isTailPinned ? "Disable tail pinning" : "Enable tail pinning"
            }
          >
            {isTailPinned ? "🔒" : "🔓"}
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {isTailPinned
            ? pinnedTailTipPosition
              ? "Tail tip is pinned. Move bubble to stretch tail."
              : "Click 'Reposition Tail Tip' to set the pin location."
            : "Tail pinning is disabled."}
        </div>
      </div>

      {/* Labels Section */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Labels
        </label>
        {streetLabels.map((label, index) => (
          <div
            key={label.id}
            className="mb-2 rounded-md border border-gray-200 p-2 dark:border-gray-700"
          >
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Label {index + 1}
              </label>
              {streetLabels.length > 1 && (
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    onStreetLabelsChange(
                      streetLabels.filter((l) => l.id !== label.id),
                    );
                  }}
                  className="text-xs text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              type="text"
              value={label.text}
              readOnly={readOnly}
              onChange={(e) => {
                onStreetLabelsChange(
                  streetLabels.map((l) =>
                    l.id === label.id ? { ...l, text: e.target.value } : l,
                  ),
                );
              }}
              placeholder="Enter label text..."
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-950 dark:text-gray-200 dark:focus:border-blue-400"
            />
          </div>
        ))}
        <button
          type="button"
          disabled={readOnly}
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
          className="w-full rounded-md border-2 border-blue-500 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
        >
          Add Label +
        </button>
      </div>

      {/* Bubble Size Controls */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Bubble Size
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onBubbleSizeChange(Math.max(0.5, bubbleSize - 0.1))}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            title="Decrease bubble size"
          >
            −
          </button>
          <span className="min-w-[60px] text-center text-sm font-medium text-gray-700 dark:text-gray-300">
            {Math.round(bubbleSize * 100)}%
          </span>
          <button
            type="button"
            disabled={readOnly}
            onClick={() =>
              onBubbleSizeChange(Math.min(1.667, bubbleSize + 0.1))
            }
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            title="Increase bubble size"
          >
            +
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Base: 400×200px (100%) | Max: ~667×333px (167%)
        </div>
      </div>

      {/* Tail Direction Control - only show when tail is not pinned */}
      {!isTailPinned && (
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Tail Direction
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onTailDirectionChange("left")}
              className={`flex-1 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                tailDirection === "left"
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              ← Left
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onTailDirectionChange("right")}
              className={`flex-1 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                tailDirection === "right"
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              Right →
            </button>
          </div>
        </div>
      )}

      {/* Label Size Controls */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Label Size
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onLabelSizeChange(Math.max(0.5, labelSize - 0.1))}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            title="Decrease label size"
          >
            −
          </button>
          <span className="min-w-[60px] text-center text-sm font-medium text-gray-700 dark:text-gray-300">
            {Math.round(labelSize * 100)}%
          </span>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onLabelSizeChange(Math.min(2.0, labelSize + 0.1))}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            title="Increase label size"
          >
            +
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Base: 36px (100%) | Max: 72px (200%)
        </div>
      </div>

      {/* Screenshot Mode Toggle */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Screenshot Mode
        </label>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onHideUIChange(!hideUI)}
          className={`w-full rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            hideUI
              ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          {hideUI
            ? "✓ UI Hidden (Ready for Screenshot)"
            : "Hide UI for Screenshot"}
        </button>
        {onShowDocumentOverlayChange && (
          <>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onShowDocumentOverlayChange(!showDocumentOverlay)}
              className={`mt-2 w-full rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                showDocumentOverlay
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {showDocumentOverlay
                ? "✓ Document Frame Visible"
                : heading.includes("Land Comp")
                  ? "Show 1.57:1 Document Frame"
                  : "Show 8.5×11\" Document Frame"}
            </button>
            {showDocumentOverlay &&
              documentFrameSize !== undefined &&
              onDocumentFrameSizeChange && (
                <div className="mt-3">
                  <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Frame Size
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() =>
                        onDocumentFrameSizeChange(
                          Math.max(0.5, documentFrameSize - 0.1),
                        )
                      }
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      title="Decrease frame size"
                    >
                      −
                    </button>
                    <span className="min-w-[60px] text-center text-sm font-medium text-gray-700 dark:text-gray-300">
                      {Math.round(documentFrameSize * 100)}%
                    </span>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() =>
                        onDocumentFrameSizeChange(
                          Math.min(2.0, documentFrameSize + 0.1),
                        )
                      }
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      title="Increase frame size"
                    >
                      +
                    </button>
                  </div>
                  
                  {onCaptureScreenshot && (
                    <button
                        type="button"
                        disabled={readOnly}
                        onClick={onCaptureScreenshot}
                        className="mt-3 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                    >
                        📸 Capture Screenshot
                    </button>
                  )}
                </div>
              )}
          </>
        )}
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {hideUI
            ? "All buttons and controls are hidden. Ready to take a screenshot!"
            : "Toggle to hide all UI elements for clean screenshots"}
          {showDocumentOverlay &&
            (heading.includes("Land Comp")
              ? " The document frame shows a 1.57:1 aspect ratio area."
              : " The document frame shows the 8.5×11\" area that will fit on a Google Doc page.")}
        </div>
      </div>
      </div>
    </div>
  );
}
