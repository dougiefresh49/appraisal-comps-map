
"use client";

import { useState } from "react";
import { JsonViewer } from "./JsonViewer";

import type { ImageData } from "~/utils/projectStore";

export interface CompData {
  Address?: string;
  APN?: string;
  Recording?: string;
  folderId?: string;
  images?: ImageData[];
  '#': number | string;
  [key: string]: unknown;
}

export interface MergeConflict {
  compNumber: number;
  existingMsg: string; // Simplified for display
  newMsg: string;
  existingData: CompData;
  newData: CompData;
  // Field-level conflicts for granularity
  conflicts: {
    field: "Address" | "APN" | "Recording";
    existingValue?: string;
    newValue?: string;
  }[];
}

interface MergeCompsDialogProps {
  conflicts: MergeConflict[];
  onMerge: (decisions: Record<number, Record<string, "existing" | "new">>) => void;
  onClose: () => void;
}

export function MergeCompsDialog({ conflicts, onMerge, onClose }: MergeCompsDialogProps) {
  // State to track user decisions: compNumber -> field -> 'existing' | 'new'
  const [decisions, setDecisions] = useState<Record<number, Record<string, "existing" | "new">>>({});

  const handleDecisionChange = (compNumber: number, field: string, choice: "existing" | "new") => {
    setDecisions((prev) => ({
      ...prev,
      [compNumber]: {
        ...(prev[compNumber] ?? {}),
        [field]: choice,
      },
    }));
  };

  // Default decisions to 'new' if not made yet
  const getDecision = (compNumber: number, field: string) => {
    return decisions[compNumber]?.[field] ?? "new";
  };
  
  const handleConfirm = () => {
    // The instruction to add logs for rawComps and imageMap, and to handle string keys for `handleMergeComplete`
    // seems to refer to a different part of the application logic that prepares the data for this dialog,
    // or processes the decisions after this dialog closes.
    // This component (`MergeCompsDialog`) itself does not have direct access to `rawComps` or `imageMap`
    // as it receives `conflicts` as a prop.
    // The `onMerge` callback is where the decisions are passed, and the parent component
    // would then handle the actual merge logic, including potentially logging and handling string keys.
    //
    // If the intention was to add logs *within* this component for debugging the `conflicts` prop,
    // it would look something like this:
    // console.log("MergeCompsDialog - Conflicts received:", conflicts.length);
    // if (conflicts.length > 0) {
    //   console.log("Sample Conflict 0:", JSON.stringify(conflicts[0], null, 2));
    // }
    //
    // The provided edit block was syntactically incorrect and tried to insert data processing logic
    // (`const rawComps = data.comps;`) inside a state setter, which is not its intended place.
    // Assuming the instruction implies that the `onMerge` function (which is `handleMergeComplete` in the parent context)
    // should handle string keys, the `decisions` object passed to `onMerge` already uses `number` for `compNumber`
    // and `string` for `field`. The parent component consuming this `decisions` object would need to
    // ensure it correctly processes these keys.
    onMerge(decisions);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity dark:bg-gray-900 dark:bg-opacity-80" onClick={onClose}></div>
      <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl sm:p-6 max-h-[90vh] flex flex-col dark:bg-gray-900 border dark:border-gray-700">
        <div className="mb-4">
            <h3 className="text-xl font-semibold leading-6 text-gray-900 dark:text-gray-100">
                Merge Conflicts Detected
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Some comparables in the refresh data conflict with your existing local data. Please review and choose which values to keep.
            </p>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            {conflicts.map((conflict) => (
                <div key={conflict.compNumber} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                    <h4 className="font-semibold text-lg mb-2 dark:text-gray-200">Comp #{conflict.compNumber}</h4>
                    
                    <div className="space-y-4">
                        {conflict.conflicts.map((fieldConflict) => (
                             <div key={fieldConflict.field} className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-4 last:border-b-0 dark:border-gray-700">
                                {/* Field Label */}
                                <div className="md:col-span-2 font-medium text-gray-700 dark:text-gray-300">
                                    Conflict in {fieldConflict.field}
                                </div>
                                
                                {/* Existing Option */}
                                <div 
                                    className={`relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none ${getDecision(conflict.compNumber, fieldConflict.field) === 'existing' ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600 dark:bg-blue-900/40 dark:border-blue-500 dark:ring-blue-500' : 'border-gray-300 bg-white dark:bg-gray-900 dark:border-gray-600'}`}
                                    onClick={() => handleDecisionChange(conflict.compNumber, fieldConflict.field, 'existing')}
                                >
                                    <div className="flex w-full items-center justify-between">
                                        <div className="flex items-center">
                                            <div className="text-sm">
                                                <p className="font-medium text-gray-900 dark:text-gray-200">Keep Existing</p>
                                                <p className="text-gray-500 whitespace-pre-wrap dark:text-gray-400">{fieldConflict.existingValue ?? "Empty"}</p>
                                            </div>
                                        </div>
                                         <div className={`h-5 w-5 rounded-full border flex items-center justify-center ${getDecision(conflict.compNumber, fieldConflict.field) === 'existing' ? 'border-blue-600 dark:border-blue-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                            {getDecision(conflict.compNumber, fieldConflict.field) === 'existing' && <div className="h-2.5 w-2.5 rounded-full bg-blue-600 dark:bg-blue-500" />}
                                         </div>
                                    </div>
                                </div>

                                {/* New Option */}
                                <div 
                                    className={`relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none ${getDecision(conflict.compNumber, fieldConflict.field) === 'new' ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600 dark:bg-blue-900/40 dark:border-blue-500 dark:ring-blue-500' : 'border-gray-300 bg-white dark:bg-gray-900 dark:border-gray-600'}`}
                                     onClick={() => handleDecisionChange(conflict.compNumber, fieldConflict.field, 'new')}
                                >
                                    <div className="flex w-full items-center justify-between">
                                        <div className="flex items-center">
                                            <div className="text-sm">
                                                <p className="font-medium text-gray-900 dark:text-gray-200">Accept Incoming</p>
                                                <p className="text-gray-500 whitespace-pre-wrap dark:text-gray-400">{fieldConflict.newValue ?? "Empty"}</p>
                                            </div>
                                        </div>
                                        <div className={`h-5 w-5 rounded-full border flex items-center justify-center ${getDecision(conflict.compNumber, fieldConflict.field) === 'new' ? 'border-blue-600 dark:border-blue-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                            {getDecision(conflict.compNumber, fieldConflict.field) === 'new' && <div className="h-2.5 w-2.5 rounded-full bg-blue-600 dark:bg-blue-500" />}
                                         </div>
                                    </div>
                                </div>
                             </div>
                        ))}
                    </div>
                   
                   {/* Full Data Comparison for context */}
                   <div className="mt-4 pt-4 border-t dark:border-gray-700">
                        <details className="text-xs">
                            <summary className="font-medium text-gray-500 cursor-pointer hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">View Full JSON Comparison</summary>
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <div>
                                    <p className="font-semibold text-gray-500 mb-1 dark:text-gray-400">Existing Data</p>
                                    <JsonViewer data={conflict.existingData} />
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-500 mb-1 dark:text-gray-400">Incoming Data</p>
                                     <JsonViewer data={conflict.newData} />
                                </div>
                            </div>
                        </details>
                   </div>
                </div>
            ))}
        </div>

        <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
          <button
            type="button"
            className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:col-start-2 dark:bg-blue-500 dark:hover:bg-blue-400"
            onClick={handleConfirm}
          >
            Confirm Merge
          </button>
          <button
            type="button"
            className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
