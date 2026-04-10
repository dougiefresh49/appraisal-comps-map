"use client";


import { useEffect, useState } from "react";
import { type ComparableType } from "~/utils/projectStore";
import { GisOverlay } from "./GisOverlay";

type LatLng = { lat: number; lng: number };

function formatLatLng(value: LatLng): string {
  return `${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}`;
}

function parseDecimalLatLng(input: string): LatLng | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(input);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function dmsToDecimal(
  degrees: number,
  minutes: number,
  seconds: number,
  direction: "N" | "S" | "E" | "W",
): number {
  const magnitude = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  const signed =
    direction === "S" || direction === "W" ? -magnitude : magnitude;
  return signed;
}

function parseDmsLatLng(input: string): LatLng | null {
  // Supports: 31° 47' 24" N 102° 30' 30" W (and many common variations)
  const normalized = input
    .replace(/[’‘′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/º/g, "°")
    .trim()
    .toUpperCase();

  const token =
    /(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*'?\s*(\d+(?:\.\d+)?)?\s*"?\s*([NSEW])/g;

  const parts: Array<{
    deg: number;
    min: number;
    sec: number;
    dir: "N" | "S" | "E" | "W";
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = token.exec(normalized))) {
    const deg = Number(match[1]);
    const min = match[2] ? Number(match[2]) : 0;
    const sec = match[3] ? Number(match[3]) : 0;
    const dir = match[4] as "N" | "S" | "E" | "W";
    if (![deg, min, sec].every(Number.isFinite)) return null;
    parts.push({ deg, min, sec, dir });
  }

  if (parts.length < 2) return null;

  const latPart = parts.find((p) => p.dir === "N" || p.dir === "S");
  const lngPart = parts.find((p) => p.dir === "E" || p.dir === "W");
  if (!latPart || !lngPart) return null;

  const lat = dmsToDecimal(latPart.deg, latPart.min, latPart.sec, latPart.dir);
  const lng = dmsToDecimal(lngPart.deg, lngPart.min, lngPart.sec, lngPart.dir);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function parseCoordinates(input: string): LatLng | null {
  return parseDecimalLatLng(input) ?? parseDmsLatLng(input);
}

interface SubjectInfo {
  address: string;
  addressForDisplay?: string;
  legalDescription?: string;
  acres?: string;
}

interface ComparableInfo {
  id: string;
  address: string;
  addressForDisplay: string;
  isTailPinned: boolean;
  type: ComparableType;
  pinnedTailTipPosition?: { lat: number; lng: number };
  apn?: string[];
}

interface ComparablesPanelProps {
  subjectInfo: SubjectInfo;
  onSubjectInfoChange: (info: SubjectInfo) => void;
  onSubjectAddressSearch: (address: string) => void;
  comparables: ComparableInfo[];
  onComparablesChange: (comparables: ComparableInfo[]) => void;
  onComparableAddressSearch: (compId: string, address: string) => void;
  bubbleSize: number;
  onBubbleSizeChange: (size: number) => void;
  hideUI: boolean;
  onHideUIChange: (hide: boolean) => void;
  showDocumentOverlay?: boolean;
  onShowDocumentOverlayChange?: (show: boolean) => void;
  documentFrameSize?: number;
  onDocumentFrameSizeChange?: (size: number) => void;
  activeType: ComparableType;
  onActiveTypeChange: (type: ComparableType) => void;
  pinningTailForCompId: string | null;
  onPinningTailForCompIdChange: (compId: string | null) => void;
  isSubjectTailPinned: boolean;
  onIsSubjectTailPinnedChange: (pinned: boolean) => void;
  subjectPinnedTailTipPosition?: { lat: number; lng: number };
  onSubjectPinnedTailTipPositionChange?: (
    position: { lat: number; lng: number } | undefined,
  ) => void;
  isRepositioningSubjectTail: boolean;
  onIsRepositioningSubjectTailChange: (repositioning: boolean) => void;
  onOpenLandMap?: (compId: string) => void;
  readOnly?: boolean;
  /** Triggers the auto-placement algorithm. */
  onAutoPlace?: () => void;
  /** True while geocoding / layout is running. */
  isAutoPlacing?: boolean;
  /** Saves a PNG of the document-frame crop (when overlay is on). */
  onCaptureScreenshot?: () => void;
}

export function ComparablesPanel({
  subjectInfo,
  onSubjectInfoChange,
  onSubjectAddressSearch,
  comparables,
  onComparablesChange,
  onComparableAddressSearch,
  bubbleSize,
  onBubbleSizeChange,
  hideUI,
  onHideUIChange,
  showDocumentOverlay,
  onShowDocumentOverlayChange,
  documentFrameSize,
  onDocumentFrameSizeChange,
  activeType,
  // onActiveTypeChange,
  pinningTailForCompId,
  onPinningTailForCompIdChange,
  isSubjectTailPinned,
  onIsSubjectTailPinnedChange,
  subjectPinnedTailTipPosition,
  onSubjectPinnedTailTipPositionChange,
  isRepositioningSubjectTail,
  onIsRepositioningSubjectTailChange,
  onOpenLandMap,
  readOnly = false,
  onAutoPlace,
  isAutoPlacing = false,
  onCaptureScreenshot,
}: ComparablesPanelProps) {
  const [searchAddress, setSearchAddress] = useState("");
  const [coordinateInputsById, setCoordinateInputsById] = useState<
    Record<string, string>
  >({});
  const [coordinateErrorsById, setCoordinateErrorsById] = useState<
    Record<string, string | undefined>
  >({});
  const [collapsedComps, setCollapsedComps] = useState<Set<string>>(new Set());
  const [showGisOverlay, setShowGisOverlay] = useState(false);
  const [gisApn, setGisApn] = useState("");

  const handleOpenGis = (apn: string) => {
    setGisApn(apn);
    setShowGisOverlay(true);
  };

  const getGisUrl = (apn: string) => {
      // Basic cleanup of APN if needed, or just pass direct
      return `https://search.ectorcad.org/map/#${apn}`;
  };

  const toggleCollapse = (id: string) => {
    const newSet = new Set(collapsedComps);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    setCollapsedComps(newSet);
  };

  useEffect(() => {
    setSearchAddress(subjectInfo.address || "");
  }, [subjectInfo.address]);

  const filteredComparables = comparables.filter(
    (comp) => comp.type === activeType,
  );

  const handleSubjectAddressChange = (value: string) => {
    setSearchAddress(value);
    const shouldSyncDisplay =
      !subjectInfo.addressForDisplay ||
      subjectInfo.addressForDisplay === subjectInfo.address;
    onSubjectInfoChange({
      ...subjectInfo,
      address: value,
      addressForDisplay: shouldSyncDisplay
        ? value
        : subjectInfo.addressForDisplay,
    });
  };

  const handleSubjectSearch = () => {
    if (searchAddress.trim()) {
      onSubjectAddressSearch(searchAddress);
    }
  };

  const handleAddComparable = () => {
    const newComp: ComparableInfo = {
      id: `comp-${Date.now()}-${Math.random()}`,
      address: "",
      addressForDisplay: "",
      isTailPinned: true,
      type: activeType,
      pinnedTailTipPosition: undefined,
    };
    onComparablesChange([...comparables, newComp]);
  };

  const handleComparableChange = (
    id: string,
    updates: Partial<ComparableInfo>,
  ) => {
    onComparablesChange(
      comparables.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  };

  const applyCoordinatesToComparable = (compId: string, raw: string) => {
    const parsed = parseCoordinates(raw);
    if (!parsed) {
      setCoordinateErrorsById((prev) => ({
        ...prev,
        [compId]:
          "Invalid coordinate format. Example: 31° 47' 24\" N 102° 30' 30\" W",
      }));
      return;
    }

    const decimal = formatLatLng(parsed);
    setCoordinateInputsById((prev) => ({ ...prev, [compId]: decimal }));
    setCoordinateErrorsById((prev) => ({ ...prev, [compId]: undefined }));

    handleComparableChange(compId, { address: decimal });
    onComparableAddressSearch(compId, decimal);
  };

  return (
    <div className="w-80 overflow-y-auto border-l border-r border-gray-300 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-900">
        {gisApn && (
            <GisOverlay 
                initialUrl={getGisUrl(gisApn)}
                visible={showGisOverlay}
                onClose={() => setShowGisOverlay(false)}
            />
        )}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold dark:text-gray-100">Comparables Map</h2>
        {onAutoPlace && (
          <button
            type="button"
            disabled={readOnly || isAutoPlacing}
            onClick={onAutoPlace}
            title="Auto-place all comps and arrange bubbles to avoid overlaps"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-purple-400 bg-purple-50 px-2.5 py-1.5 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-800/50"
          >
            {isAutoPlacing ? (
              <>
                <svg
                  className="h-3.5 w-3.5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Placing…
              </>
            ) : (
              <>✨ Auto Place</>
            )}
          </button>
        )}
      </div>

      {/* Subject Section */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Subject
        </label>
        <div className="mb-2">
          <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Address</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchAddress}
              readOnly={readOnly}
              onChange={(e) => handleSubjectAddressChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSubjectSearch();
                }
              }}
              placeholder="Enter address or search..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
            />
            <button
              type="button"
              disabled={readOnly}
              onClick={handleSubjectSearch}
              className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              title="Search"
            >
              🔍
            </button>
          </div>
        </div>
        <div className="mb-2">
          <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">
            Address (for display)
          </label>
          <input
            type="text"
            value={subjectInfo.addressForDisplay ?? ""}
            readOnly={readOnly}
            onChange={(e) =>
              onSubjectInfoChange({
                ...subjectInfo,
                addressForDisplay: e.target.value,
              })
            }
            placeholder="Enter display address..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
          />
        </div>
        <div className="mb-2">
          <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Acres</label>
          <input
            type="text"
            value={subjectInfo.acres ?? ""}
            readOnly={readOnly}
            onChange={(e) =>
              onSubjectInfoChange({
                ...subjectInfo,
                acres: e.target.value,
              })
            }
            placeholder="Enter acres..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
          />
        </div>
        <div className="mb-2">
          <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">
            Legal Description
          </label>
          <input
            type="text"
            value={subjectInfo.legalDescription ?? ""}
            readOnly={readOnly}
            onChange={(e) =>
              onSubjectInfoChange({
                ...subjectInfo,
                legalDescription: e.target.value,
              })
            }
            placeholder="Enter legal description..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
          />
        </div>
        <div className="mb-2">
          <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Tail Pin</label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => {
                onIsRepositioningSubjectTailChange(true);
              }}
              className={`flex-1 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isRepositioningSubjectTail
                  ? "animate-pulse border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/40 dark:text-blue-300"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {isRepositioningSubjectTail
                ? "Click map to set tail tip..."
                : "📍 Reposition Tail Tip"}
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => {
                onIsSubjectTailPinnedChange(!isSubjectTailPinned);
                if (
                  !isSubjectTailPinned &&
                  onSubjectPinnedTailTipPositionChange
                ) {
                  onSubjectPinnedTailTipPositionChange(
                    subjectPinnedTailTipPosition,
                  );
                } else if (
                  isSubjectTailPinned &&
                  onSubjectPinnedTailTipPositionChange
                ) {
                  onSubjectPinnedTailTipPositionChange(undefined);
                }
                if (isRepositioningSubjectTail) {
                  onIsRepositioningSubjectTailChange(false);
                }
              }}
              className={`rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isSubjectTailPinned
                  ? "border-green-500 bg-green-50 text-green-700 dark:border-green-600 dark:bg-green-900/40 dark:text-green-300"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
              title={
                isSubjectTailPinned
                  ? "Disable tail pinning"
                  : "Enable tail pinning"
              }
            >
              {isSubjectTailPinned ? "🔒" : "🔓"}
            </button>
          </div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {isSubjectTailPinned
              ? subjectPinnedTailTipPosition
                ? "Tail tip is pinned. Move bubble to stretch tail."
                : "Click 'Reposition Tail Tip' to set the pin location."
              : "Tail pinning is disabled."}
          </div>
        </div>
      </div>

      {/* Comparable Properties */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Comparable Properties
          </label>
           <button
             type="button"
             disabled={readOnly}
             onClick={handleAddComparable}
             className="rounded-md border border-blue-500 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-400 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60"
           >
             + Add
           </button>
        </div>
        {/* Type switcher removed as per requirements */}

        {filteredComparables.map((comp, index) => {
          const isCollapsed = collapsedComps.has(comp.id);
          return (
            <div
              key={comp.id}
              className="mb-4 rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
            >
              <div 
                className="flex cursor-pointer items-center justify-between bg-gray-50 p-3 hover:bg-gray-100 dark:bg-gray-800/80 dark:hover:bg-gray-700"
                onClick={() => toggleCollapse(comp.id)}
              >
                <div className="flex items-center gap-2">
                   <span className="text-xs text-gray-500 dark:text-gray-400">{isCollapsed ? "▶" : "▼"}</span>
                   <label className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200">
                      Comp {index + 1}
                   </label>
                   {isCollapsed && (
                     <span className="ml-2 max-w-[150px] truncate text-xs text-gray-500 dark:text-gray-400">
                       {comp.address || "No address"}
                     </span>
                   )}
                </div>
              </div>

              {!isCollapsed && (
              <div className="border-t border-gray-200 p-3 dark:border-gray-700">
                {comp.apn && comp.apn.length > 0 && (
                  <div className="mb-2">
                    <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">APN</label>
                    <input
                      type="text"
                      value={comp.apn.join(", ")}
                      readOnly
                      className="w-full rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                    />

                    <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleOpenGis(comp.apn?.[0] ?? "")}
                        className="mt-1 w-full rounded-md border border-indigo-500 bg-indigo-50 px-2 py-1 text-xs text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-800/60"
                    >
                        🌐 Open GIS Overlay
                    </button>
                  </div>
                )}
                <div className="mb-2">
                  <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">
                    Coordinates (DMS)
                  </label>
                  <input
                    type="text"
                    value={coordinateInputsById[comp.id] ?? ""}
                    readOnly={readOnly}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCoordinateInputsById((prev) => ({
                        ...prev,
                        [comp.id]: value,
                      }));
                      setCoordinateErrorsById((prev) => ({
                        ...prev,
                        [comp.id]: undefined,
                      }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const raw = coordinateInputsById[comp.id] ?? "";
                        if (raw.trim().length > 0) {
                          applyCoordinatesToComparable(comp.id, raw);
                        }
                      }
                    }}
                    placeholder={`31° 47' 24" N 102° 30' 30" W`}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
                  />
                  {coordinateErrorsById[comp.id] ? (
                    <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {coordinateErrorsById[comp.id]}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Paste coordinates and press Enter to update this comp.
                    </div>
                  )}
                </div>
                <div className="mb-2">
                  <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">
                    Address
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={comp.address}
                      readOnly={readOnly}
                      onChange={(e) =>
                        handleComparableChange(comp.id, { address: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && comp.address.trim()) {
                          onComparableAddressSearch(comp.id, comp.address);
                        }
                      }}
                      placeholder="Enter address..."
                      className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
                    />
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => {
                        if (comp.address.trim()) {
                          onComparableAddressSearch(comp.id, comp.address);
                        }
                      }}
                      className="rounded-md bg-gray-100 px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      title="Search"
                    >
                      🔍
                    </button>
                  </div>
                </div>

                <div className="mb-2">
                  <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">
                    Address (for display)
                  </label>
                  <input
                    type="text"
                    value={comp.addressForDisplay}
                    readOnly={readOnly}
                    onChange={(e) =>
                      handleComparableChange(comp.id, {
                        addressForDisplay: e.target.value,
                      })
                    }
                    placeholder="Enter display address..."
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
                  />
                </div>

                <div className="mb-2">
                  <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">
                    Tail Pin
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => {
                        onPinningTailForCompIdChange(comp.id);
                      }}
                      className={`flex-1 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        pinningTailForCompId === comp.id
                          ? "animate-pulse border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/40 dark:text-blue-300"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {pinningTailForCompId === comp.id
                        ? "Click map to set tail tip..."
                        : "📍 Reposition Tail Tip"}
                    </button>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => {
                        handleComparableChange(comp.id, {
                          isTailPinned: !comp.isTailPinned,
                          pinnedTailTipPosition: comp.isTailPinned
                            ? undefined
                            : comp.pinnedTailTipPosition,
                        });
                        if (pinningTailForCompId === comp.id) {
                          onPinningTailForCompIdChange(null);
                        }
                      }}
                      className={`rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        comp.isTailPinned
                          ? "border-green-500 bg-green-50 text-green-700 dark:border-green-600 dark:bg-green-900/40 dark:text-green-300"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                      title={
                        comp.isTailPinned
                          ? "Disable tail pinning"
                          : "Enable tail pinning"
                      }
                    >
                      {comp.isTailPinned ? "🔒" : "🔓"}
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {comp.isTailPinned
                      ? comp.pinnedTailTipPosition
                        ? "Tail tip is pinned. Move bubble to stretch tail."
                        : "Click 'Reposition Tail Tip' to set the pin location."
                      : "Tail pinning is disabled."}
                  </div>
                  {activeType === "Land" && onOpenLandMap && (
                    <div className="mt-3">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => onOpenLandMap(comp.id)}
                        className="w-full rounded-md border border-green-600 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-green-500 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-800/40"
                      >
                        Open Land Location Map
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bubble Sizes */}
      <div className="mb-6">
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
          <span className="min-w-[60px] text-center text-sm font-medium text-gray-700 dark:text-gray-200">
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

      {/* Screenshot Mode */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Screenshot Mode
        </label>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onHideUIChange(!hideUI)}
          className={`w-full rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            hideUI
              ? "border-green-500 bg-green-50 text-green-700 dark:border-green-600 dark:bg-green-900/40 dark:text-green-300"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          {hideUI
            ? "✓ UI Hidden (Ready for Screenshot)"
            : "Hide UI for Screenshot"}
        </button>
        {onShowDocumentOverlayChange && (
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onShowDocumentOverlayChange(!showDocumentOverlay)}
            className={`mt-2 w-full rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              showDocumentOverlay
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/40 dark:text-blue-300"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            {showDocumentOverlay
              ? "✓ Document Frame Visible"
              : 'Show 8.5×11" Document Frame'}
          </button>
        )}
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
                <span className="min-w-[60px] text-center text-sm font-medium text-gray-700 dark:text-gray-200">
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
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {hideUI
            ? "All buttons and controls are hidden. Ready to take a screenshot!"
            : "Toggle to hide all UI elements for clean screenshots"}
          {showDocumentOverlay &&
            ' The document frame shows the 8.5×11" area that will fit on a Google Doc page.'}
        </div>
      </div>
    </div>
  );
}
